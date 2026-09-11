import type { DocumentChunk } from '../core/types.js';

export interface RawDoc {
  readonly title: string;
  readonly url: string;
  readonly rawMarkdown: string;
  /** Docusaurus/document locale associated with this source. */
  readonly lang?: string;
}

export interface ChunkOptions {
  /** Maximum number of Unicode code points in a generated chunk. */
  readonly maxChunkChars?: number;
  /** Number of code points repeated between adjacent chunks. */
  readonly chunkOverlap?: number;
}

/** Backward-compatible name for ChunkOptions. */
export interface MarkdownChunkOptions extends ChunkOptions {}

interface SectionState {
  headingPath: readonly string[];
  lines: string[];
}

const codePointOffset = (text: string, codeUnitOffset: number): number =>
  Array.from(text.slice(0, codeUnitOffset)).length;

const findOptimalBreakpoint = (characters: readonly string[], targetEnd: number, searchWindowChars: number): number => {
  if (targetEnd >= characters.length) return characters.length;

  const windowStart = Math.max(0, targetEnd - searchWindowChars);
  const windowText = characters.slice(windowStart, targetEnd).join('');

  const paragraphIndex = windowText.lastIndexOf('\n\n');
  if (paragraphIndex >= 0) return windowStart + codePointOffset(windowText, paragraphIndex) + 2;

  const sentenceMatches = [...windowText.matchAll(/[。．](?:\s*)|\.\s+/gu)];
  const lastSentence = sentenceMatches.at(-1);
  if (lastSentence?.index !== undefined) {
    return windowStart + codePointOffset(windowText, lastSentence.index) + Array.from(lastSentence[0]).length;
  }

  const newlineIndex = windowText.lastIndexOf('\n');
  if (newlineIndex >= 0) return windowStart + codePointOffset(windowText, newlineIndex) + 1;

  return targetEnd;
};

/** Split prose while preferring paragraph, sentence, and line boundaries. */
export const splitProseWithBoundaries = (text: string, options: MarkdownChunkOptions = {}): readonly string[] => {
  const normalized = text.trim();
  const characters = Array.from(normalized);
  const maxChunkChars = options.maxChunkChars;
  const chunkOverlap = options.chunkOverlap ?? 0;

  if (maxChunkChars === undefined || characters.length <= maxChunkChars) return normalized ? [normalized] : [];

  const result: string[] = [];
  const searchWindowChars = Math.min(150, Math.floor(maxChunkChars * 0.25));
  let start = 0;

  while (start < characters.length) {
    const targetEnd = Math.min(characters.length, start + maxChunkChars);
    const end = findOptimalBreakpoint(characters, targetEnd, searchWindowChars);
    const chunk = characters.slice(start, end).join('').trim();
    if (chunk) result.push(chunk);
    if (end >= characters.length) break;

    // The search window is smaller than maxChunkChars, but retain this guard
    // so future breakpoint changes can never make the loop stall.
    start = Math.max(start + 1, end - chunkOverlap);
  }

  return result;
};

const headingPattern = /^\s{0,3}(#{1,3})\s+(.+?)\s*$/u;
const fencePattern = /^\s{0,3}(`{3,}|~{3,})(.*)$/u;
const tableSeparatorPattern = /^\s*\|?\s*:?-{1,}:?\s*(?:\|\s*:?-{1,}:?\s*)*\|?\s*$/u;

const isTableStart = (lines: readonly string[], index: number): boolean => {
  const header = lines[index];
  const separator = lines[index + 1];
  return (
    header !== undefined && separator !== undefined && header.includes('|') && tableSeparatorPattern.test(separator)
  );
};

const addChunk = (
  chunks: DocumentChunk[],
  doc: RawDoc,
  type: DocumentChunk['type'],
  content: string,
  headingPath: readonly string[],
  metadata: DocumentChunk['metadata'] | undefined,
  sequence: { value: number },
  options: NormalizedMarkdownChunkOptions,
): void => {
  const normalized = type === 'code' ? content.replace(/\n+$/u, '') : content.trim();
  if (!normalized) return;

  const characters = Array.from(normalized);
  const maxChunkChars = options.maxChunkChars ?? characters.length;
  const step = maxChunkChars - options.chunkOverlap;

  if (type === 'prose' && options.maxChunkChars !== undefined) {
    for (const contentPart of splitProseWithBoundaries(normalized, options)) {
      chunks.push({
        id: `${doc.url}#chunk-${sequence.value++}`,
        title: doc.title,
        url: doc.url,
        content: contentPart,
        type,
        ...(headingPath.length ? { headingPath: [...headingPath] } : {}),
        ...(headingPath.length ? { heading: headingPath[headingPath.length - 1] } : {}),
        ...(doc.lang ? { metadata: { lang: doc.lang, locale: doc.lang } } : {}),
      });
    }
    return;
  }

  let start = 0;
  while (start < characters.length) {
    const end = Math.min(characters.length, start + maxChunkChars);
    const contentPart = characters.slice(start, end).join('');
    chunks.push({
      id: `${doc.url}#chunk-${sequence.value++}`,
      title: doc.title,
      url: doc.url,
      content: contentPart,
      type,
      ...(headingPath.length ? { headingPath: [...headingPath] } : {}),
      ...(headingPath.length ? { heading: headingPath[headingPath.length - 1] } : {}),
      ...(metadata || doc.lang
        ? {
            metadata: {
              ...(metadata ?? {}),
              ...(doc.lang ? { ...(metadata?.lang === undefined ? { lang: doc.lang } : {}), locale: doc.lang } : {}),
            },
          }
        : {}),
    });
    if (end >= characters.length) break;
    start += step;
  }
};

interface NormalizedMarkdownChunkOptions {
  readonly maxChunkChars?: number;
  readonly chunkOverlap: number;
}

const normalizeOptions = (options: MarkdownChunkOptions): NormalizedMarkdownChunkOptions => {
  const maxChunkChars = options.maxChunkChars;
  const chunkOverlap = options.chunkOverlap ?? 0;
  if (maxChunkChars !== undefined && (!Number.isInteger(maxChunkChars) || maxChunkChars < 1)) {
    throw new RangeError('maxChunkChars must be a positive integer.');
  }
  if (!Number.isInteger(chunkOverlap) || chunkOverlap < 0) {
    throw new RangeError('chunkOverlap must be a non-negative integer.');
  }
  if (maxChunkChars === undefined && chunkOverlap > 0) {
    throw new RangeError('chunkOverlap requires maxChunkChars to be set.');
  }
  if (maxChunkChars !== undefined && chunkOverlap >= maxChunkChars) {
    throw new RangeError('chunkOverlap must be smaller than maxChunkChars.');
  }
  return { ...(maxChunkChars === undefined ? {} : { maxChunkChars }), chunkOverlap };
};

const updateHeadingPath = (current: readonly string[], level: number, heading: string): string[] => {
  const next = current.slice(0, level - 1);
  next.push(heading.replace(/\s+#+\s*$/u, '').trim());
  return next;
};

/** Parse Markdown/MDX into structure-preserving retrieval chunks. */
export const parseMarkdownToChunks = (doc: RawDoc, options: MarkdownChunkOptions = {}): readonly DocumentChunk[] => {
  const normalizedOptions = normalizeOptions(options);
  const lines = doc.rawMarkdown.split('\n');
  const chunks: DocumentChunk[] = [];
  const sequence = { value: 0 };
  const section: SectionState = { headingPath: [], lines: [] };
  let headingPath: readonly string[] = [];

  const flushProse = (): void => {
    addChunk(
      chunks,
      doc,
      'prose',
      section.lines.join('\n'),
      section.headingPath,
      undefined,
      sequence,
      normalizedOptions,
    );
    section.lines = [];
  };

  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? '';
    const heading = headingPattern.exec(line);
    if (heading) {
      flushProse();
      const hashes = heading[1];
      const headingText = heading[2];
      if (!hashes || !headingText) {
        index += 1;
        continue;
      }
      headingPath = updateHeadingPath(headingPath, hashes.length, headingText);
      section.headingPath = headingPath;
      index += 1;
      continue;
    }

    const fence = fencePattern.exec(line);
    if (fence) {
      flushProse();
      const fenceMarker = fence[1];
      const fenceInfo = fence[2];
      if (!fenceMarker || fenceInfo === undefined) {
        index += 1;
        continue;
      }
      const marker = fenceMarker[0];
      const markerLength = fenceMarker.length;
      const language = fenceInfo.trim().split(/\s+/u)[0] ?? '';
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length) {
        const closingFence = fencePattern.exec(lines[index] ?? '');
        const closingMarker = closingFence?.[1];
        if (closingMarker && closingMarker[0] === marker && closingMarker.length >= markerLength) {
          index += 1;
          break;
        }
        codeLines.push(lines[index] ?? '');
        index += 1;
      }
      addChunk(
        chunks,
        doc,
        'code',
        codeLines.join('\n'),
        section.headingPath,
        { lang: language || 'text' },
        sequence,
        normalizedOptions,
      );
      continue;
    }

    if (isTableStart(lines, index)) {
      flushProse();
      const tableLines: string[] = [];
      while (index < lines.length && (lines[index]?.includes('|') ?? false)) {
        tableLines.push(lines[index] ?? '');
        index += 1;
      }
      addChunk(
        chunks,
        doc,
        'table',
        tableLines.join('\n'),
        section.headingPath,
        undefined,
        sequence,
        normalizedOptions,
      );
      continue;
    }

    if (!/^\s*(?:import|export)\s+/u.test(line)) section.lines.push(line);
    index += 1;
  }

  flushProse();
  return chunks;
};
