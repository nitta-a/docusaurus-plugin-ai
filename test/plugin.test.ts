import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import docusaurusPluginAI, { loadDocuments } from '../src/plugin.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const createDocs = async (source: string): Promise<string> => {
  const directory = await mkdtemp(join(tmpdir(), 'docusaurus-plugin-ai-'));
  temporaryDirectories.push(directory);
  await writeFile(join(directory, 'guide.md'), source, 'utf8');
  return directory;
};

describe('loadDocuments', () => {
  it('propagates the loader locale into document metadata', async () => {
    const directory = await createDocs('# Guide\n\n日本語の説明です。');
    const chunks = await loadDocuments(directory, '/docs', {}, 'ja');

    expect(chunks[0]).toMatchObject({
      url: '/docs/guide',
      metadata: { lang: 'ja', locale: 'ja' },
    });
  });
});

describe('docusaurusPluginAI', () => {
  it('passes currentLocale and chunk options through loadContent', async () => {
    const siteDir = await createDocs('First sentence. Second sentence.');
    const plugin = docusaurusPluginAI(
      { siteDir, i18n: { currentLocale: 'en-US' } } as Parameters<typeof docusaurusPluginAI>[0],
      { docsDir: '.', maxChunkChars: 17 },
    );

    const content = await plugin.loadContent?.();
    expect(content?.chunks).toEqual([
      expect.objectContaining({ content: 'First sentence.', metadata: { lang: 'en-US', locale: 'en-US' } }),
      expect.objectContaining({ content: 'Second sentence.', metadata: { lang: 'en-US', locale: 'en-US' } }),
    ]);
  });
});
