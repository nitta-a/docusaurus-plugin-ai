import type {
  AIErrorResponse,
  AIResponse,
  AIStreamResponse,
  ChatMessage,
  GenerationOptions,
  LLMProvider,
  SourceReference,
} from './core/types.js';

/** Response header used to make RAG citations available before text streaming starts. */
export const AI_SOURCES_HEADER = 'x-docusaurus-ai-sources';

type HeaderFactory = HeadersInit | (() => HeadersInit | Promise<HeadersInit>);

export interface HttpAIProviderOptions {
  /** HTTP endpoint that accepts the request envelope documented below. */
  readonly endpoint: string;
  /** Optional request headers, or a factory for short-lived auth tokens. */
  readonly headers?: HeaderFactory;
  /** Forward the browser's credentials policy to fetch. */
  readonly credentials?: RequestCredentials;
  /** Injectable fetch implementation for tests or an application middleware. */
  readonly fetch?: typeof globalThis.fetch;
}

/** Error that retains the structured response returned by an AI endpoint. */
export class AIProviderError extends Error {
  readonly response: AIErrorResponse;

  constructor(response: AIErrorResponse, rawBody?: string) {
    super(`HTTP ${response.status ?? 500}: ${rawBody || response.error}`);
    this.name = 'AIProviderError';
    this.response = response;
  }
}

interface HttpRequestBody {
  readonly messages: readonly ChatMessage[];
  readonly options?: {
    readonly temperature?: number;
    readonly maxTokens?: number;
    readonly topP?: number;
    readonly topK?: number;
    readonly presencePenalty?: number;
    readonly frequencyPenalty?: number;
    readonly stopSequences?: readonly string[];
    readonly seed?: number;
    readonly maxRetries?: number;
    readonly timeoutMs?: number;
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isSourceReference = (value: unknown): value is SourceReference =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.title === 'string' &&
  typeof value.url === 'string' &&
  (value.snippet === undefined || typeof value.snippet === 'string');

const parseSources = (value: unknown): readonly SourceReference[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const sources = value.filter(isSourceReference);
  return sources.length === value.length ? sources : undefined;
};

const parseResponse = (value: unknown): AIResponse => {
  if (!isRecord(value) || typeof value.content !== 'string') {
    throw new Error('AI endpoint returned an invalid response: expected a content string.');
  }

  const sources = parseSources(value.sources);
  return {
    content: value.content,
    ...(typeof value.model === 'string' ? { model: value.model } : {}),
    ...(sources ? { sources } : {}),
    ...(isRecord(value.usage) ? { usage: value.usage as AIResponse['usage'] } : {}),
  };
};

const parseErrorResponse = (value: unknown, status: number): AIErrorResponse => {
  if (isRecord(value) && typeof value.error === 'string') {
    return {
      error: value.error,
      ...(typeof value.code === 'string' ? { code: value.code } : {}),
      ...(typeof value.detail === 'string' ? { detail: value.detail } : {}),
      ...(typeof value.status === 'number' ? { status: value.status } : { status }),
      ...(typeof value.traceId === 'string' ? { traceId: value.traceId } : {}),
      ...(parseSources(value.sources) ? { sources: parseSources(value.sources) } : {}),
    };
  }
  return { error: `AI endpoint request failed with HTTP ${status}.`, status };
};

const assertSuccessful = async (response: Response): Promise<void> => {
  if (response.ok) return;
  let rawBody = '';
  try {
    rawBody = await response.text();
  } catch {
    // Keep the status-only structured error when the body cannot be read.
  }
  let parsedBody: unknown;
  try {
    parsedBody = rawBody ? (JSON.parse(rawBody) as unknown) : undefined;
  } catch {
    parsedBody = undefined;
  }
  const error = parseErrorResponse(parsedBody, response.status);
  throw new AIProviderError(
    rawBody ? { ...error, ...(error.error.startsWith('AI endpoint request failed') ? { error: rawBody } : {}) } : error,
    rawBody,
  );
};

const toRequestOptions = (options?: GenerationOptions): HttpRequestBody['options'] | undefined => {
  const requestOptions = {
    ...(options?.temperature === undefined ? {} : { temperature: options.temperature }),
    ...(options?.maxTokens === undefined ? {} : { maxTokens: options.maxTokens }),
    ...(options?.topP === undefined ? {} : { topP: options.topP }),
    ...(options?.topK === undefined ? {} : { topK: options.topK }),
    ...(options?.presencePenalty === undefined ? {} : { presencePenalty: options.presencePenalty }),
    ...(options?.frequencyPenalty === undefined ? {} : { frequencyPenalty: options.frequencyPenalty }),
    ...(options?.stopSequences === undefined ? {} : { stopSequences: options.stopSequences }),
    ...(options?.seed === undefined ? {} : { seed: options.seed }),
    ...(options?.maxRetries === undefined ? {} : { maxRetries: options.maxRetries }),
    ...(options?.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
  };
  return Object.keys(requestOptions).length > 0 ? requestOptions : undefined;
};

const parseSourcesHeader = (response: Response): readonly SourceReference[] | undefined => {
  const value = response.headers.get(AI_SOURCES_HEADER);
  if (!value) return undefined;

  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as unknown;
    return parseSources(parsed);
  } catch {
    return undefined;
  }
};

const decodeTextStream = async function* (body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      const text = decoder.decode(result.value, { stream: true });
      if (text) yield text;
    }
    const remainder = decoder.decode();
    if (remainder) yield remainder;
  } finally {
    reader.releaseLock();
  }
};

const makeBody = (messages: readonly ChatMessage[], options?: GenerationOptions): HttpRequestBody => {
  const requestOptions = toRequestOptions(options);
  return {
    messages,
    ...(requestOptions ? { options: requestOptions } : {}),
  };
};

/**
 * Create a browser-safe provider for an application-owned HTTP endpoint.
 *
 * The endpoint receives `{ messages, options }` as JSON. `generate` expects
 * an `AIResponse` JSON object. `stream` expects a text response and reads
 * optional RAG citations from the URL-encoded `x-docusaurus-ai-sources`
 * response header. This matches `streamText().toTextStreamResponse()` and
 * keeps server credentials out of the static Docusaurus bundle.
 */
export const createHttpAIProvider = ({
  endpoint,
  headers,
  credentials,
  fetch: configuredFetch,
}: HttpAIProviderOptions): LLMProvider => {
  const fetchImpl = configuredFetch ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function')
    throw new Error('A fetch implementation is required to create an HTTP provider.');

  const request = async (
    messages: readonly ChatMessage[],
    options: GenerationOptions | undefined,
    accept: string,
  ): Promise<Response> => {
    const configuredHeaders = typeof headers === 'function' ? await headers() : headers;
    const requestHeaders = new Headers(configuredHeaders);
    requestHeaders.set('content-type', 'application/json');
    requestHeaders.set('accept', accept);

    return fetchImpl(endpoint, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(makeBody(messages, options)),
      ...(credentials === undefined ? {} : { credentials }),
      ...(options?.signal === undefined ? {} : { signal: options.signal }),
    });
  };

  return {
    async generate(messages, options): Promise<AIResponse> {
      const response = await request(messages, options, 'application/json');
      await assertSuccessful(response);
      return parseResponse(await response.json());
    },
    async stream(messages, options): Promise<AIStreamResponse> {
      const response = await request(messages, options, 'text/plain');
      await assertSuccessful(response);
      if (!response.body) throw new Error('AI endpoint returned an empty streaming body.');
      const sources = parseSourcesHeader(response);
      return {
        stream: decodeTextStream(response.body),
        ...(sources ? { sources } : {}),
      };
    },
  };
};
