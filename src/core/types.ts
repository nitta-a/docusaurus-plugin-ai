/** A document fragment returned by a retriever. */
export interface DocumentChunk {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly content: string;
  readonly type: 'prose' | 'code' | 'table';
  /** The nearest parent heading, when the chunk belongs to a section. */
  readonly heading?: string;
  readonly headingPath?: readonly string[];
  readonly metadata?: DocumentChunkMetadata;
  readonly score?: number;
}

/** Extensible, serializable metadata attached to an indexed chunk. */
export interface DocumentChunkMetadata {
  /** Source document locale, when supplied by the indexer. */
  readonly title?: string;
  readonly url?: string;
  readonly locale?: string;
  /** Programming language of a fenced code block, when applicable. */
  readonly codeLanguage?: string;
  /** @deprecated Use locale for document language and codeLanguage for code blocks. */
  readonly lang?: string;
  readonly [key: string]: string | number | boolean | undefined;
}

/** A source that can be supplied as context to a RAG provider. */
export type DocumentSource = DocumentChunk;

/** Vendor-neutral context retrieval contract. */
export interface AIRetriever {
  /** Search the indexed context for the requested query. */
  readonly search: (
    query: string,
    options?: { readonly limit?: number; readonly threshold?: number },
  ) => Promise<readonly DocumentSource[] | readonly SourceReference[]>;
}

/** @deprecated Use AIRetriever.search. */
export interface LegacyAIRetriever {
  readonly retrieve: (
    query: string,
    options?: { readonly limit?: number; readonly threshold?: number },
  ) => Promise<readonly DocumentChunk[]>;
}

/** A message exchanged with an LLM provider. */
export interface ChatMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

/** Generation controls understood by the vendor-neutral provider contract. */
export interface GenerationOptions {
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
  readonly signal?: AbortSignal;
}

/** A compact citation attached to an AI response. */
export interface SourceReference {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly snippet?: string;
}

/** Token usage reported by a provider when available. */
export interface AIUsage {
  readonly promptTokens?: number;
  readonly completionTokens?: number;
  readonly totalTokens?: number;
}

/** Normalized answer data returned by an LLM or RAG provider. */
export interface AIResponse {
  readonly content: string;
  readonly model?: string;
  readonly usage?: AIUsage;
  readonly sources?: readonly SourceReference[];
}

/** Structured error payload returned by an application-owned AI endpoint. */
export interface AIErrorResponse {
  readonly error: string;
  readonly code?: string;
  readonly detail?: string;
  readonly status?: number;
  readonly traceId?: string;
  readonly sources?: readonly SourceReference[];
}

/** Incremental text and metadata returned by a streaming provider. */
export type AITextStream = AsyncIterable<string> | ReadableStream<string>;

export interface AIStreamResponse {
  readonly stream: AITextStream;
  readonly sources?: readonly SourceReference[];
  /** Usage may resolve after the stream has finished. */
  readonly usage?: PromiseLike<AIUsage | undefined>;
}

/** Vendor-neutral inference/generation contract. */
export interface LLMProvider {
  readonly generate: (messages: readonly ChatMessage[], options?: GenerationOptions) => Promise<AIResponse>;
  readonly stream?: (messages: readonly ChatMessage[], options?: GenerationOptions) => Promise<AIStreamResponse>;
}
