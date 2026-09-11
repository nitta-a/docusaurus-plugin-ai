import type { AIResponse, DocumentChunk, LLMProvider, SourceReference } from './core/types.js';
import { searchDocuments } from './search.js';

export interface LocalAIProviderOptions {
  documents: readonly DocumentChunk[];
  resultLimit?: number;
}

/**
 * A deterministic, browser-safe provider for demos and local development.
 * It exercises the same LLMProvider contract without requiring credentials.
 */
export const createLocalAIProvider = ({ documents, resultLimit = 3 }: LocalAIProviderOptions): LLMProvider => ({
  async generate(messages): Promise<AIResponse> {
    return createLocalResponse(messages, documents, resultLimit);
  },
  async stream(messages) {
    const response = createLocalResponse(messages, documents, resultLimit);
    return { stream: streamText(response.content), sources: response.sources };
  },
});

const createLocalResponse = (
  messages: Parameters<LLMProvider['generate']>[0],
  documents: readonly DocumentChunk[],
  resultLimit: number,
): AIResponse => {
  const query = [...messages].reverse().find((message) => message.role === 'user')?.content ?? '';
  const results = searchDocuments(query, documents, { limit: resultLimit });

  if (results.length === 0) {
    return {
      content: '関連するドキュメントが見つかりませんでした。別のキーワードで試してください。',
      model: 'local-document-search',
      sources: [],
    };
  }

  const references = results
    .map(({ document, snippet }) => `## ${document.title}\n${snippet}\n\n参照: ${document.url}`)
    .join('\n\n');
  const sources: readonly SourceReference[] = results.map(({ document, snippet }) => ({
    id: document.id,
    title: document.title,
    url: document.url,
    snippet,
  }));

  return {
    content: `ローカルのドキュメント検索結果です。\n\n${references}`,
    model: 'local-document-search',
    sources,
  };
};

async function* streamText(content: string): AsyncIterable<string> {
  const parts = content.match(/\S+\s*/gu) ?? [];
  for (const part of parts) {
    yield part;
    await Promise.resolve();
  }
}
