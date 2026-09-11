import { resolve } from 'node:path';
import { createAzure } from '@ai-sdk/azure';
import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { DefaultAzureCredential, getBearerTokenProvider, ManagedIdentityCredential } from '@azure/identity';
import {
  AI_SOURCES_HEADER,
  type AIUsage,
  type ChatMessage,
  createDocumentRetriever,
  createRAGProvider,
  createVercelAIProvider,
  type GenerationOptions,
} from 'docusaurus-plugin-ai';
import { loadDocuments } from 'docusaurus-plugin-ai/plugin';
import { logAICallMetrics } from '../telemetry.js';
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
const rag = createRAGProvider({
  retriever: createDocumentRetriever(documents),
  provider,
});

const streamResponse = async (
  messages: readonly ChatMessage[],
  options: GenerationOptions | undefined,
  context: InvocationContext,
  startedAt: number,
) => {
  if (!rag.stream) throw new Error('The configured provider does not support streaming.');
  const result = await rag.stream(messages, options);
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const delta of result.stream) controller.enqueue(encoder.encode(delta));
        controller.close();
      } catch (error) {
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
  try {
    const parsed = validateAIRequest(await request.json());
    if (request.headers.get('accept')?.includes('text/plain')) {
      return await streamResponse(parsed.messages, parsed.options, context, startedAt);
    }

    const response = await rag.generate(parsed.messages, parsed.options);
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
    return { status: 200, jsonBody: response };
  } catch (error) {
    context.error(error);
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
