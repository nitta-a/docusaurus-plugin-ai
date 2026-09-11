import type { DocumentChunk } from '../core/types.js';

export interface RawDoc {
  readonly title: string;
  readonly url: string;
  readonly rawMarkdown: string;
}

interface SectionState {
  headingPath: readonly string[];
  lines: string[];
}

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
  sequence: { value: number },
): void => {
  const normalized = type === 'code' ? content.replace(/\n+$/u, '') : content.trim();
  if (!normalized) return;

  chunks.push({
    id: `${doc.url}#chunk-${sequence.value++}`,
    title: doc.title,
    url: doc.url,
    content: normalized,
    type,
    ...(headingPath.length ? { headingPath: [...headingPath] } : {}),
  });
};

const updateHeadingPath = (current: readonly string[], level: number, heading: string): string[] => {
  const next = current.slice(0, level - 1);
  next.push(heading.replace(/\s+#+\s*$/u, '').trim());
  return next;
};

/** Parse Markdown/MDX into structure-preserving retrieval chunks. */
export const parseMarkdownToChunks = (doc: RawDoc): readonly DocumentChunk[] => {
  const lines = doc.rawMarkdown.split('\n');
  const chunks: DocumentChunk[] = [];
  const sequence = { value: 0 };
  const section: SectionState = { headingPath: [], lines: [] };
  let headingPath: readonly string[] = [];

  const flushProse = (): void => {
    addChunk(chunks, doc, 'prose', section.lines.join('\n'), section.headingPath, sequence);
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
        `Language: ${language || 'text'}\n${codeLines.join('\n').trimEnd()}`,
        section.headingPath,
        sequence,
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
      addChunk(chunks, doc, 'table', tableLines.join('\n'), section.headingPath, sequence);
      continue;
    }

    if (!/^\s*(?:import|export)\s+/u.test(line)) section.lines.push(line);
    index += 1;
  }

  flushProse();
  return chunks;
};
