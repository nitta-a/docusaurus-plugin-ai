import type { AIDocument, AIProvider } from './provider.js';
import { searchDocuments } from './search.js';

export interface LocalAIProviderOptions {
  documents: readonly AIDocument[];
  resultLimit?: number;
}

/**
 * A deterministic, browser-safe provider for demos and local development.
 * It exercises the same AIProvider contract without requiring credentials.
 */
export const createLocalAIProvider = ({ documents, resultLimit = 3 }: LocalAIProviderOptions): AIProvider => ({
  async generate({ messages }) {
    const query = [...messages].reverse().find((message) => message.role === 'user')?.content ?? '';
    const results = searchDocuments(query, documents, { limit: resultLimit });

    if (results.length === 0) {
      return {
        content: '関連するドキュメントが見つかりませんでした。別のキーワードで試してください。',
        model: 'local-document-search',
      };
    }

    const references = results
      .map(({ document, snippet }) => `## ${document.title}\n${snippet}\n\n参照: ${document.url}`)
      .join('\n\n');

    return {
      content: `ローカルのドキュメント検索結果です。\n\n${references}`,
      model: 'local-document-search',
    };
  },
});
