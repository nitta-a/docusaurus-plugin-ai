import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { createAzure } from '@ai-sdk/azure';
import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { DefaultAzureCredential, getBearerTokenProvider, ManagedIdentityCredential } from '@azure/identity';
import {
  AI_SOURCES_HEADER,
  type AIRetriever,
  type AIUsage,
  type ChatMessage,
  createDocumentRetriever,
  createRAGProvider,
  createVercelAIProvider,
  type GenerationOptions,
} from '@docusaurus-plugin-ai/core';
import { loadDocuments } from '@docusaurus-plugin-ai/core/plugin';
import { logAICallMetrics, logRAGTelemetry } from '../telemetry.js';
import { AIRequestValidationError, validateAIRequest } from '../validation.js';

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const credential =
  process.env.AZURE_USE_DEFAULT_CREDENTIAL === 'true'
    ? new DefaultAzureCredential()
    : new ManagedIdentityCredential(
        process.env.AZURE_CLIENT_ID ? { clientId: process.env.AZURE_CLIENT_ID } : undefined,
      );
const tokenProvider = getBearerTokenProvider(credential, 'https://cognitiveservices.azure.com/.default');
const azure = createAzure({
  resourceName: required('AZURE_RESOURCE_NAME'),
  tokenProvider,
});

const documents = await loadDocuments(
  process.env.DOCS_DIR ?? resolve(process.cwd(), '../docs'),
  process.env.DOCS_ROUTE_BASE_PATH ?? '/docs',
  { maxChunkChars: 2000, chunkOverlap: 200 },
);
const provider = createVercelAIProvider({
  model: required('AZURE_OPENAI_DEPLOYMENT'),
  createModel: (deployment) => azure.chat(deployment),
  system: '回答は提供されたドキュメントの内容だけに基づいてください。',
});

const documentRetriever = createDocumentRetriever(documents);

interface RequestRAG {
  readonly rag: ReturnType<typeof createRAGProvider>;
  readonly getRetrievalDurationMs: () => number;
  readonly getRetrievedCount: () => number;
  readonly getSources: () => readonly { readonly title: string; readonly url: string }[];
}

const createRequestRAG = (): RequestRAG => {
  let retrievalDurationMs = 0;
  let retrievedCount = 0;
  let sources: readonly { readonly title: string; readonly url: string }[] = [];
  const retriever: AIRetriever = {
    async search(query, options) {
      const startedAt = Date.now();
      try {
        const results = await documentRetriever.search(query, options);
        retrievedCount = results.length;
        sources = results.map(({ title, url }) => ({ title, url }));
        return results;
      } finally {
        retrievalDurationMs += Date.now() - startedAt;
      }
    },
  };
  return {
    rag: createRAGProvider({ retriever, provider }),
    getRetrievalDurationMs: () => retrievalDurationMs,
    getRetrievedCount: () => retrievedCount,
    getSources: () => sources,
  };
};

const queryFromMessages = (messages: readonly ChatMessage[]): string =>
  [...messages].reverse().find((message) => message.role === 'user')?.content ?? '';

const streamResponse = async (
  messages: readonly ChatMessage[],
  options: GenerationOptions | undefined,
  context: InvocationContext,
  startedAt: number,
  traceId: string,
  query: string,
  requestRAG: RequestRAG,
) => {
  if (!requestRAG.rag.stream) throw new Error('The configured provider does not support streaming.');
  const result = await requestRAG.rag.stream(messages, options);
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let streamError: unknown;
      try {
        for await (const delta of result.stream) controller.enqueue(encoder.encode(delta));
        controller.close();
      } catch (error) {
        streamError = error;
        controller.error(error);
      } finally {
        let usage: AIUsage | undefined;
        try {
          usage = result.usage ? await result.usage : undefined;
        } catch (error) {
          context.error(error);
        }
        logAICallMetrics(context, {
          latencyMs: Date.now() - startedAt,
          ...usage,
          sourcesCount: result.sources?.length ?? 0,
          isStream: true,
        });
        logRAGTelemetry(context, {
          traceId,
          query,
          retrievedCount: result.sources?.length ?? 0,
          sources: (result.sources ?? []).map(({ title, url }) => ({ title, url })),
          durationMs: {
            retrieval: requestRAG.getRetrievalDurationMs(),
            total: Date.now() - startedAt,
          },
          ...(usage ? { usage } : {}),
          status: streamError ? 'error' : 'success',
          ...(streamError instanceof Error ? { errorMessage: streamError.message } : {}),
        });
      }
    },
  });

  return {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      [AI_SOURCES_HEADER]: encodeURIComponent(JSON.stringify(result.sources ?? [])),
      'cache-control': 'no-cache',
    },
    body,
  } satisfies HttpResponseInit;
};

export async function ai(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const startedAt = Date.now();
  const traceId = randomUUID();
  let query = '';
  let requestRAG: RequestRAG | undefined;
  try {
    const parsed = validateAIRequest(await request.json());
    query = queryFromMessages(parsed.messages);
    requestRAG = createRequestRAG();
    if (request.headers.get('accept')?.includes('text/plain')) {
      return await streamResponse(parsed.messages, parsed.options, context, startedAt, traceId, query, requestRAG);
    }

    const response = await requestRAG.rag.generate(parsed.messages, parsed.options);
    logAICallMetrics(
      context,
      {
        latencyMs: Date.now() - startedAt,
        ...response.usage,
        sourcesCount: response.sources?.length ?? 0,
        isStream: false,
      },
      response.model ? { model: response.model } : {},
    );
    logRAGTelemetry(context, {
      traceId,
      query,
      retrievedCount: response.sources?.length ?? 0,
      sources: (response.sources ?? []).map(({ title, url }) => ({ title, url })),
      durationMs: { retrieval: requestRAG.getRetrievalDurationMs(), total: Date.now() - startedAt },
      ...(response.usage ? { usage: response.usage } : {}),
      status: 'success',
    });
    return { status: 200, jsonBody: response };
  } catch (error) {
    context.error(error);
    if (requestRAG) {
      logRAGTelemetry(context, {
        traceId,
        query,
        retrievedCount: requestRAG.getRetrievedCount(),
        sources: requestRAG.getSources(),
        durationMs: { retrieval: requestRAG.getRetrievalDurationMs(), total: Date.now() - startedAt },
        status: 'error',
        ...(error instanceof Error ? { errorMessage: error.message } : {}),
      });
    }
    return {
      status: error instanceof AIRequestValidationError || error instanceof SyntaxError ? 400 : 500,
      jsonBody: { error: error instanceof Error ? error.message : 'AI request failed.' },
    };
  }
}

app.http('ai', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'ai',
  handler: ai,
});
