import { resolve } from 'node:path';
import { createAzure } from '@ai-sdk/azure';
import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { DefaultAzureCredential, getBearerTokenProvider, ManagedIdentityCredential } from '@azure/identity';
import {
  AI_SOURCES_HEADER,
  type ChatMessage,
  createDocumentRetriever,
  createRAGProvider,
  createVercelAIProvider,
  type GenerationOptions,
} from 'docusaurus-plugin-ai';
import { loadDocuments } from 'docusaurus-plugin-ai/plugin';

interface RequestBody {
  readonly messages?: unknown;
  readonly options?: unknown;
}

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

const isChatMessage = (value: unknown): value is ChatMessage => {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  return (
    (message.role === 'system' || message.role === 'user' || message.role === 'assistant') &&
    typeof message.content === 'string'
  );
};

const parseBody = (body: RequestBody): { messages: readonly ChatMessage[]; options?: GenerationOptions } => {
  if (!Array.isArray(body.messages) || !body.messages.every(isChatMessage)) {
    throw new Error('Request body must contain a messages array.');
  }

  if (body.options === undefined) return { messages: body.messages };
  if (!body.options || typeof body.options !== 'object') throw new Error('Request options must be an object.');
  const options = body.options as Record<string, unknown>;
  const temperature = options.temperature;
  const maxTokens = options.maxTokens;
  if (temperature !== undefined && (typeof temperature !== 'number' || !Number.isFinite(temperature))) {
    throw new Error('options.temperature must be a finite number.');
  }
  if (maxTokens !== undefined && (!Number.isInteger(maxTokens) || maxTokens < 1)) {
    throw new Error('options.maxTokens must be a positive integer.');
  }
  return {
    messages: body.messages,
    options: {
      ...(temperature === undefined ? {} : { temperature }),
      ...(maxTokens === undefined ? {} : { maxTokens }),
    },
  };
};

const streamResponse = async (messages: readonly ChatMessage[], options?: GenerationOptions) => {
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
  try {
    const body = (await request.json()) as RequestBody;
    const parsed = parseBody(body);
    if (request.headers.get('accept')?.includes('text/plain')) {
      return await streamResponse(parsed.messages, parsed.options);
    }

    const response = await rag.generate(parsed.messages, parsed.options);
    return { status: 200, jsonBody: response };
  } catch (error) {
    context.error(error);
    return {
      status: error instanceof Error && error.message.startsWith('Request') ? 400 : 500,
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
