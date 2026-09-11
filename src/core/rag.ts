import type {
  AIResponse,
  AIRetriever,
  AIStreamResponse,
  ChatMessage,
  DocumentChunk,
  GenerationOptions,
  LegacyAIRetriever,
  LLMProvider,
  SourceReference,
} from './types.js';

export interface RAGPromptContext {
  readonly query: string;
  readonly chunks: readonly DocumentChunk[];
}

export interface RAGConfig {
  readonly retriever: AIRetriever | LegacyAIRetriever;
  readonly provider: LLMProvider;
  readonly topK?: number;
  readonly buildPrompt?: (context: RAGPromptContext) => string;
}

const defaultBuildPrompt = ({ chunks }: RAGPromptContext): string => {
  const context = chunks
    .map((chunk, index) => {
      const heading = chunk.headingPath?.length ? `\nSection: ${chunk.headingPath.join(' / ')}` : '';
      return `[Doc ${index + 1}] Title: ${chunk.title}\nURL: ${chunk.url}\nType: ${chunk.type}${heading}\n\n${chunk.content}`;
    })
    .join('\n\n---\n\n');

  return `あなたはドキュメントの専門アシスタントです。
以下の提供されたドキュメント情報のみに基づいて、ユーザーの質問に回答してください。
ドキュメントに記載がない内容については、「ドキュメントに記載がありません」と回答してください。
回答内では、必要に応じて該当する情報源を参照してください。

【参照ドキュメント】
${context}`;
};

const toSnippet = (content: string, maxLength = 240): string => {
  const normalized = content.replace(/\s+/gu, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
};

const toSourceReference = (chunk: DocumentChunk): SourceReference => ({
  id: chunk.id,
  title: chunk.title,
  url: chunk.url,
  snippet: toSnippet(chunk.content),
});

const isDocumentChunk = (source: DocumentChunk | SourceReference): source is DocumentChunk =>
  'content' in source && 'type' in source;

const toDocumentChunk = (source: SourceReference): DocumentChunk => ({
  id: source.id,
  title: source.title,
  url: source.url,
  content: source.snippet ?? source.title,
  type: 'prose',
});

const searchRetriever = async (
  retriever: AIRetriever | LegacyAIRetriever,
  query: string,
  topK: number,
): Promise<readonly DocumentChunk[]> => {
  const results =
    'search' in retriever
      ? await retriever.search(query, { limit: topK })
      : await retriever.retrieve(query, { limit: topK });
  return results.map((source) => (isDocumentChunk(source) ? source : toDocumentChunk(source)));
};

const buildMessages = async (
  messages: readonly ChatMessage[],
  retriever: AIRetriever | LegacyAIRetriever,
  topK: number,
  buildPrompt: (context: RAGPromptContext) => string,
): Promise<{ readonly composedMessages: readonly ChatMessage[]; readonly sources: readonly SourceReference[] }> => {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');
  if (!lastUserMessage) return { composedMessages: messages, sources: [] };

  const chunks = await searchRetriever(retriever, lastUserMessage.content, topK);
  const sources = chunks.map(toSourceReference);
  const systemMessage: ChatMessage = {
    role: 'system',
    content: buildPrompt({ query: lastUserMessage.content, chunks }),
  };
  const composedMessages: readonly ChatMessage[] = [
    systemMessage,
    ...messages.filter((message) => message.role !== 'system'),
  ];

  return { composedMessages, sources };
};

/** Compose retrieval, prompt construction, generation, and source attachment. */
export const createRAGProvider = (config: RAGConfig): LLMProvider => {
  const topK = Math.max(1, config.topK ?? 5);
  const buildPrompt = config.buildPrompt ?? defaultBuildPrompt;
  const providerStream = config.provider.stream;
  const stream = providerStream
    ? async (messages: readonly ChatMessage[], options?: GenerationOptions): Promise<AIStreamResponse> => {
        const { composedMessages, sources } = await buildMessages(messages, config.retriever, topK, buildPrompt);
        const result = await providerStream(composedMessages, options);
        return { ...result, sources };
      }
    : undefined;

  return {
    generate: async (messages: readonly ChatMessage[], options?: GenerationOptions): Promise<AIResponse> => {
      const { composedMessages, sources } = await buildMessages(messages, config.retriever, topK, buildPrompt);
      const result = await config.provider.generate(composedMessages, options);
      return { ...result, sources };
    },
    ...(stream ? { stream } : {}),
  };
};
