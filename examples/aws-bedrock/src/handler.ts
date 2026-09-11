import type { Context } from 'aws-lambda';
import {
  AI_SOURCES_HEADER,
  type ChatMessage,
  createDocumentRetriever,
  createRAGProvider,
  type GenerationOptions,
} from 'docusaurus-plugin-ai';
import { loadIndex } from './index-loader.js';
import { initBedrockProvider } from './provider.js';

interface LambdaHttpEvent {
  readonly body?: string | null;
  readonly isBase64Encoded?: boolean;
  readonly headers?: Record<string, string | undefined>;
}

interface RequestBody {
  readonly messages?: unknown;
  readonly options?: unknown;
}

interface AIErrorResponse {
  readonly error: {
    readonly code: 'BAD_REQUEST' | 'UPSTREAM_ERROR' | 'INTERNAL_ERROR';
    readonly message: string;
  };
}

interface LambdaResponseMetadata {
  readonly statusCode: number;
  readonly headers: Record<string, string>;
}

interface LambdaResponseStream {
  write(chunk: string | Uint8Array): boolean;
  end(): void;
  finished?(): Promise<void>;
}

interface AwsLambdaRuntime {
  readonly HttpResponseStream: {
    from(stream: LambdaResponseStream, metadata: LambdaResponseMetadata): LambdaResponseStream;
  };
  streamifyResponse<TEvent, TContext>(
    handler: (event: TEvent, responseStream: LambdaResponseStream, context: TContext) => Promise<void>,
  ): (event: TEvent, context: TContext) => Promise<void>;
}

declare const awslambda: AwsLambdaRuntime;

const provider = initBedrockProvider({
  region: process.env.AWS_REGION ?? 'us-east-1',
  model: process.env.BEDROCK_MODEL ?? 'amazon.nova-lite-v1:0',
});
const retrieverPromise = loadIndex().then((documents) => createDocumentRetriever(documents));
const ragPromise = retrieverPromise.then((retriever) => createRAGProvider({ retriever, provider }));

const isChatMessage = (value: unknown): value is ChatMessage => {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  return (
    (message.role === 'system' || message.role === 'user' || message.role === 'assistant') &&
    typeof message.content === 'string'
  );
};

const parseBody = (event: LambdaHttpEvent): { messages: readonly ChatMessage[]; options?: GenerationOptions } => {
  if (!event.body) throw new Error('Request body is required.');
  const encoded = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
  const body = JSON.parse(encoded) as RequestBody;
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
  if (maxTokens !== undefined && (typeof maxTokens !== 'number' || !Number.isInteger(maxTokens) || maxTokens < 1)) {
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

const errorResponse = (code: AIErrorResponse['error']['code'], message: string): string =>
  JSON.stringify({ error: { code, message } } satisfies AIErrorResponse);

const headersFor = (headers: Record<string, string>, sources?: unknown): Record<string, string> => ({
  ...headers,
  ...(sources === undefined ? {} : { [AI_SOURCES_HEADER]: encodeURIComponent(JSON.stringify(sources)) }),
});

export const handler = awslambda.streamifyResponse(
  async (event: LambdaHttpEvent, initialStream: LambdaResponseStream, context: Context) => {
    const acceptsText = (event.headers?.accept ?? event.headers?.Accept)?.includes('text/plain') ?? false;
    let responseStream = initialStream;
    let responseStarted = false;
    try {
      const parsed = parseBody(event);
      const rag = await ragPromise;

      if (!acceptsText) {
        const response = await rag.generate(parsed.messages, parsed.options);
        responseStream = awslambda.HttpResponseStream.from(responseStream, {
          statusCode: 200,
          headers: { 'content-type': 'application/json; charset=utf-8' },
        });
        responseStarted = true;
        responseStream.write(JSON.stringify(response));
        responseStream.end();
        await responseStream.finished?.();
        return;
      }

      if (!rag.stream) throw new Error('The configured provider does not support streaming.');
      const response = await rag.stream(parsed.messages, parsed.options);
      responseStream = awslambda.HttpResponseStream.from(responseStream, {
        statusCode: 200,
        headers: headersFor(
          {
            'content-type': 'text/plain; charset=utf-8',
            'cache-control': 'no-cache, no-transform',
          },
          response.sources ?? [],
        ),
      });
      responseStarted = true;
      for await (const delta of response.stream) responseStream.write(delta);
      responseStream.end();
      await responseStream.finished?.();
    } catch (error) {
      const isBadRequest =
        error instanceof SyntaxError || (error instanceof Error && error.message.startsWith('Request'));
      const statusCode = isBadRequest ? 400 : 500;
      const code: AIErrorResponse['error']['code'] = isBadRequest ? 'BAD_REQUEST' : 'INTERNAL_ERROR';
      console.error('AI request failed', { awsRequestId: context.awsRequestId, error });
      if (responseStarted) {
        responseStream.end();
        await responseStream.finished?.();
        return;
      }
      responseStream = awslambda.HttpResponseStream.from(responseStream, {
        statusCode,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
      responseStream.write(
        errorResponse(
          code,
          isBadRequest ? (error instanceof Error ? error.message : 'Invalid request.') : 'AI request failed.',
        ),
      );
      responseStream.end();
      await responseStream.finished?.();
    }
  },
);
