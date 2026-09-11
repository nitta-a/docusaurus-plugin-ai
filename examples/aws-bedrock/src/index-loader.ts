import { resolve } from 'node:path';
import type { DocumentChunk } from 'docusaurus-plugin-ai';
import { loadDocuments } from 'docusaurus-plugin-ai/plugin';

let cachedDocuments: readonly DocumentChunk[] | undefined;

export const loadIndex = async (): Promise<readonly DocumentChunk[]> => {
  if (cachedDocuments) return cachedDocuments;

  cachedDocuments = await loadDocuments(
    process.env.DOCS_DIR ?? resolve(process.cwd(), '../docs'),
    process.env.DOCS_ROUTE_BASE_PATH ?? '/docs',
    {
      maxChunkChars: Number(process.env.MAX_CHUNK_CHARS ?? 2000),
      chunkOverlap: Number(process.env.CHUNK_OVERLAP ?? 200),
    },
  );
  return cachedDocuments;
};
