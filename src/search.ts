import type { AIDocument } from './provider.js';

export interface AISearchResult {
  document: AIDocument;
  score: number;
  snippet: string;
}

export interface AISearchOptions {
  limit?: number;
  snippetLength?: number;
}

const tokenize = (value: string): string[] =>
  value
    .toLocaleLowerCase()
    .split(/[\s\p{P}\p{S}]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);

const makeSnippet = (content: string, query: string, length: number): string => {
  const normalizedContent = content.replace(/\s+/gu, ' ').trim();
  const queryTokens = tokenize(query);
  const contentLower = normalizedContent.toLocaleLowerCase();
  const matchAt = queryTokens.reduce((best, token) => {
    const position = contentLower.indexOf(token);
    return position >= 0 && (best < 0 || position < best) ? position : best;
  }, -1);

  if (normalizedContent.length <= length) return normalizedContent;
  const start = Math.max(0, (matchAt < 0 ? 0 : matchAt) - Math.floor(length / 3));
  const end = Math.min(normalizedContent.length, start + length);
  return `${start > 0 ? '…' : ''}${normalizedContent.slice(start, end)}${end < normalizedContent.length ? '…' : ''}`;
};

/** Return the most relevant local documentation matches for a query. */
export const searchDocuments = (
  query: string,
  documents: readonly AIDocument[],
  options: AISearchOptions = {},
): AISearchResult[] => {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const limit = Math.max(1, options.limit ?? 5);
  const snippetLength = Math.max(80, options.snippetLength ?? 220);

  return documents
    .map((document) => {
      const title = document.title.toLocaleLowerCase();
      const content = document.content.toLocaleLowerCase();
      const score = queryTokens.reduce((total, token) => {
        const titleMatches = title.split(token).length - 1;
        const contentMatches = content.split(token).length - 1;
        return total + titleMatches * 8 + contentMatches;
      }, 0);
      return {
        document,
        score,
        snippet: makeSnippet(document.content, query, snippetLength),
      };
    })
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.document.title.localeCompare(right.document.title))
    .slice(0, limit);
};
