/** A document fragment returned by a retriever. */
export interface DocumentChunk {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly content: string;
  readonly type: 'prose' | 'code' | 'table';
  readonly headingPath?: readonly string[];
  readonly score?: number;
}

/** Vendor-neutral context retrieval contract. */
export interface AIRetriever {
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
  readonly signal?: AbortSignal;
}

/** A compact citation attached to an AI response. */
export interface SourceReference {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
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

/** Incremental text and metadata returned by a streaming provider. */
export type AITextStream = AsyncIterable<string> | ReadableStream<string>;

export interface AIStreamResponse {
  readonly stream: AITextStream;
  readonly sources?: readonly SourceReference[];
}

/** Vendor-neutral inference/generation contract. */
export interface LLMProvider {
  readonly generate: (messages: readonly ChatMessage[], options?: GenerationOptions) => Promise<AIResponse>;
  readonly stream?: (messages: readonly ChatMessage[], options?: GenerationOptions) => Promise<AIStreamResponse>;
}
