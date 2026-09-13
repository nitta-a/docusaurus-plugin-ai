export type { AIModelFactory, VercelAIProviderOptions } from './ai-sdk-provider.js';
export { createVercelAIProvider } from './ai-sdk-provider.js';
export type { AnthropicProviderOptions } from './anthropic-provider.js';
export { createAnthropicProvider } from './anthropic-provider.js';
export type { ChunkOptions, MarkdownChunkOptions, RawDoc } from './build/parser.js';
export { AIChat, AIChatSources, consumeAIStream } from './chat.js';
export type { ChunkSplitOptions } from './core/chunker.js';
export { splitProseContent } from './core/chunker.js';
export type { RAGConfig, RAGPromptContext } from './core/rag.js';
export { createRAGProvider } from './core/rag.js';
export type {
  AIErrorResponse,
  AIResponse,
  AIRetriever,
  AIStreamResponse,
  AITextStream,
  AIUsage,
  ChatMessage,
  DocumentChunk,
  DocumentChunkMetadata,
  DocumentSource,
  GenerationOptions,
  LegacyAIRetriever,
  LLMProvider,
  SourceReference,
} from './core/types.js';
export type { GoogleProviderOptions } from './google-provider.js';
export { createGoogleProvider } from './google-provider.js';
export type { HttpAIProviderOptions } from './http-provider.js';
export { AI_SOURCES_HEADER, AIProviderError, createHttpAIProvider } from './http-provider.js';
export { createLocalAIProvider } from './local-provider.js';
export type { OpenAIProviderOptions } from './openai-provider.js';
export { createOpenAIProvider } from './openai-provider.js';
export type { AISearchOptions, AISearchResult } from './search.js';
export { createDocumentRetriever, searchDocuments } from './search.js';
