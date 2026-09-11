import type { AIRetriever, DocumentChunk } from './core/types.js';

export interface AISearchResult {
  readonly document: DocumentChunk;
  readonly score: number;
  readonly snippet: string;
}

export interface AISearchOptions {
  readonly limit?: number;
  readonly snippetLength?: number;
  readonly threshold?: number;
}

interface WeightedToken {
  readonly value: string;
  readonly weight: number;
}

const segmentWords = (value: string): readonly string[] => {
  const normalized = value.toLocaleLowerCase();
  if (typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
    return Array.from(segmenter.segment(normalized))
      .filter((part) => part.isWordLike)
      .map((part) => part.segment);
  }

  return normalized.split(/[\s\p{P}\p{S}]+/u).filter(Boolean);
};

const bigrams = (value: string): readonly string[] => {
  const characters = Array.from(value).filter((character) => /[\p{L}\p{N}]/u.test(character));
  return characters.slice(0, -1).map((character, index) => `${character}${characters[index + 1] ?? ''}`);
};

const tokenize = (value: string): readonly WeightedToken[] => {
  const tokens = new Map<string, number>();
  for (const word of segmentWords(value)) {
    if (!word) continue;
    tokens.set(word, Math.max(tokens.get(word) ?? 0, 1));
    if (/\P{ASCII}/u.test(word)) {
      for (const gram of bigrams(word)) tokens.set(gram, Math.max(tokens.get(gram) ?? 0, 0.25));
    }
  }
  return [...tokens.entries()].map(([token, weight]) => ({ value: token, weight }));
};

const tokenCounts = (value: string): ReadonlyMap<string, number> => {
  const counts = new Map<string, number>();
  for (const word of segmentWords(value)) {
    counts.set(word, (counts.get(word) ?? 0) + 1);
    if (/\P{ASCII}/u.test(word)) {
      for (const gram of bigrams(word)) counts.set(gram, (counts.get(gram) ?? 0) + 1);
    }
  }
  return counts;
};

const fieldScore = (queryTokens: readonly WeightedToken[], field: string, weight: number): number => {
  const counts = tokenCounts(field);
  return queryTokens.reduce((total, token) => total + (counts.get(token.value) ?? 0) * token.weight * weight, 0);
};

const headingText = (document: DocumentChunk): string => document.heading ?? document.headingPath?.join(' / ') ?? '';

const makeSnippet = (content: string, query: string, length: number): string => {
  const normalizedContent = content.replace(/\s+/gu, ' ').trim();
  const queryTokens = tokenize(query);
  const contentLower = normalizedContent.toLocaleLowerCase();
  const matchAt = queryTokens.reduce((best, token) => {
    const position = contentLower.indexOf(token.value);
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
  documents: readonly DocumentChunk[],
  options: AISearchOptions = {},
): AISearchResult[] => {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const limit = Math.max(1, options.limit ?? 5);
  const snippetLength = Math.max(80, options.snippetLength ?? 220);
  const threshold = options.threshold ?? 0;

  return documents
    .map((document) => {
      const title = document.title.toLocaleLowerCase();
      const heading = headingText(document).toLocaleLowerCase();
      const content = document.content.toLocaleLowerCase();
      const contentWeight = document.type === 'code' ? 4 : 1;
      const phrase = query.toLocaleLowerCase().trim();
      const phraseBonus = phrase.length > 1 && heading.includes(phrase) ? 12 : 0;
      const score =
        fieldScore(queryTokens, heading, 20) +
        fieldScore(queryTokens, title, 8) +
        fieldScore(queryTokens, content, contentWeight) +
        phraseBonus;
      return {
        document,
        score,
        snippet: makeSnippet(document.content, query, snippetLength),
      };
    })
    .filter((result) => result.score > 0 && result.score >= threshold)
    .sort((left, right) => right.score - left.score || left.document.title.localeCompare(right.document.title))
    .slice(0, limit);
};

/** Create an AIRetriever over an immutable in-memory document collection. */
export const createDocumentRetriever = (
  documents: readonly DocumentChunk[],
  defaults: AISearchOptions = {},
): AIRetriever => ({
  async search(query, options) {
    return searchDocuments(query, documents, { ...defaults, ...options }).map((result) => result.document);
  },
});
