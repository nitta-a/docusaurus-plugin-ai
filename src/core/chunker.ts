export interface ChunkSplitOptions {
  /** Maximum number of Unicode code points in a prose chunk. */
  readonly maxChunkChars?: number;
  /** Number of Unicode code points repeated between adjacent chunks. */
  readonly chunkOverlap?: number;
}

const codePointOffset = (text: string, codeUnitOffset: number): number =>
  Array.from(text.slice(0, codeUnitOffset)).length;

const findBreakpoint = (characters: readonly string[], targetEnd: number, searchMargin: number): number => {
  if (targetEnd >= characters.length) return characters.length;

  const windowStart = Math.max(0, targetEnd - searchMargin);
  const windowText = characters.slice(windowStart, targetEnd).join('');

  // Prefer a paragraph boundary, then the last complete sentence, then a line.
  const paragraphIndex = windowText.lastIndexOf('\n\n');
  if (paragraphIndex >= 0) return windowStart + codePointOffset(windowText, paragraphIndex) + 2;

  const sentenceMatches = [...windowText.matchAll(/[。．]|\.\s+/gu)];
  const lastSentence = sentenceMatches.at(-1);
  if (lastSentence?.index !== undefined) {
    return windowStart + codePointOffset(windowText, lastSentence.index) + Array.from(lastSentence[0]).length;
  }

  const newlineIndex = windowText.lastIndexOf('\n');
  if (newlineIndex >= 0) return windowStart + codePointOffset(windowText, newlineIndex) + 1;

  return targetEnd;
};

const normalizeOptions = (options: ChunkSplitOptions): Required<ChunkSplitOptions> => {
  const maxChunkChars = options.maxChunkChars ?? 2000;
  const chunkOverlap = options.chunkOverlap ?? 200;

  if (!Number.isInteger(maxChunkChars) || maxChunkChars < 1) {
    throw new RangeError('maxChunkChars must be a positive integer.');
  }
  if (!Number.isInteger(chunkOverlap) || chunkOverlap < 0) {
    throw new RangeError('chunkOverlap must be a non-negative integer.');
  }
  if (chunkOverlap >= maxChunkChars) {
    throw new RangeError('chunkOverlap must be smaller than maxChunkChars.');
  }

  return { maxChunkChars, chunkOverlap };
};

/** Split prose at paragraph, sentence, or line boundaries where possible. */
export const splitProseContent = (text: string, options: ChunkSplitOptions = {}): readonly string[] => {
  const normalized = text.trim();
  if (!normalized) return [];

  const characters = Array.from(normalized);
  const maxChunkChars = options.maxChunkChars ?? 2000;
  if (!Number.isInteger(maxChunkChars) || maxChunkChars < 1) {
    throw new RangeError('maxChunkChars must be a positive integer.');
  }
  if (characters.length <= maxChunkChars) return [normalized];

  const { chunkOverlap } = normalizeOptions({ ...options, maxChunkChars });

  const result: string[] = [];
  // Search only near the target so chunks do not become unexpectedly short.
  const searchMargin = Math.min(150, Math.floor(maxChunkChars * 0.2));
  let startIndex = 0;

  while (startIndex < characters.length) {
    const targetEnd = Math.min(characters.length, startIndex + maxChunkChars);
    const actualEnd = findBreakpoint(characters, targetEnd, searchMargin);
    const chunk = characters.slice(startIndex, actualEnd).join('').trim();
    if (chunk) result.push(chunk);
    if (actualEnd >= characters.length) break;

    // Ensure a pathological boundary implementation can never stall progress.
    startIndex = Math.max(startIndex + 1, actualEnd - chunkOverlap);
  }

  return result;
};
