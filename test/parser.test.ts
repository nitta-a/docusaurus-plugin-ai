import { describe, expect, it } from 'vitest';
import { parseMarkdownToChunks } from '../src/build/parser.js';

describe('parseMarkdownToChunks', () => {
  it('preserves sections, fenced code, tables, and heading hierarchy', () => {
    const chunks = parseMarkdownToChunks({
      title: 'Guide',
      url: '/docs/guide',
      rawMarkdown: `# Guide

Introductory text.

## Installation

\`\`\`ts
# this is code, not a heading
const value = 1;
\`\`\`

### Options

| Name | Value |
| --- | --- |
| mode | fast |
`,
    });

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toMatchObject({ type: 'prose', content: 'Introductory text.', headingPath: ['Guide'] });
    expect(chunks[1]).toMatchObject({ type: 'code', headingPath: ['Guide', 'Installation'] });
    expect(chunks[1]?.heading).toBe('Installation');
    expect(chunks[1]?.metadata).toEqual({ lang: 'ts' });
    expect(chunks[1]?.content).toContain('# this is code, not a heading');
    expect(chunks[2]).toMatchObject({ type: 'table', headingPath: ['Guide', 'Installation', 'Options'] });
    expect(chunks[2]?.content).toContain('| mode | fast |');
  });

  it('removes MDX import/export statements without removing code content', () => {
    const chunks = parseMarkdownToChunks({
      title: 'MDX',
      url: '/docs/mdx',
      rawMarkdown: `import Tabs from '@theme/Tabs';
export const value = true;

Text.

~~~js
export const insideCode = true;
~~~`,
    });

    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.content).toBe('Text.');
    expect(chunks[1]?.content).toContain('export const insideCode = true;');
  });

  it('preserves code indentation and recognizes a single-column table', () => {
    const chunks = parseMarkdownToChunks({
      title: 'Details',
      url: '/docs/details',
      rawMarkdown: `\`\`\`python
  def answer():
    return 42
\`\`\`

| Value |
| :--- |
| kept |
`,
    });

    expect(chunks[0]?.content).toContain('  def answer():\n    return 42');
    expect(chunks[0]?.metadata).toEqual({ lang: 'python' });
    expect(chunks[1]).toMatchObject({ type: 'table', content: '| Value |\n| :--- |\n| kept |' });
  });

  it('splits long chunks with Unicode-safe overlap while preserving metadata', () => {
    const chunks = parseMarkdownToChunks(
      {
        title: 'Long section',
        url: '/docs/long',
        rawMarkdown: '# 見出し\n\nあいうえおかきくけこ',
      },
      { maxChunkChars: 6, chunkOverlap: 2 },
    );

    expect(chunks.map((chunk) => chunk.content)).toEqual(['あいうえおか', 'おかきくけこ']);
    expect(chunks.map((chunk) => chunk.id)).toEqual(['/docs/long#chunk-0', '/docs/long#chunk-1']);
    expect(chunks.every((chunk) => chunk.headingPath?.join('/') === '見出し')).toBe(true);
  });

  it('prefers prose paragraph and sentence boundaries when splitting', () => {
    const chunks = parseMarkdownToChunks(
      {
        title: 'Boundaries',
        url: '/docs/boundaries',
        rawMarkdown: '# Boundaries\n\nFirst sentence. Second sentence.\n\nFinal paragraph.',
        lang: 'ja',
      },
      { maxChunkChars: 17 },
    );

    expect(chunks.map((chunk) => chunk.content)).toEqual(['First sentence.', 'Second sentence.', 'Final paragraph.']);
    expect(chunks.every((chunk) => chunk.metadata?.lang === 'ja')).toBe(true);
    expect(chunks.every((chunk) => chunk.metadata?.locale === 'ja')).toBe(true);
  });

  it('keeps code language metadata while attaching document locale', () => {
    const chunks = parseMarkdownToChunks({
      title: 'Code',
      url: '/docs/code',
      rawMarkdown: '```ts\nconst value = 1;\n```',
      lang: 'en',
    });

    expect(chunks[0]?.metadata).toEqual({ lang: 'ts', locale: 'en' });
  });

  it('keeps Unicode boundary offsets code-point safe', () => {
    const chunks = parseMarkdownToChunks(
      {
        title: 'Emoji',
        url: '/docs/emoji',
        rawMarkdown: `${'😀'.repeat(10)}. Next.`,
      },
      { maxChunkChars: 12 },
    );

    expect(chunks.map((chunk) => chunk.content)).toEqual([`${'😀'.repeat(10)}.`, 'Next.']);
  });

  it('rejects invalid chunk controls instead of creating an infinite split loop', () => {
    const doc = { title: 'Invalid', url: '/docs/invalid', rawMarkdown: 'text' };
    expect(() => parseMarkdownToChunks(doc, { maxChunkChars: 0 })).toThrow('maxChunkChars');
    expect(() => parseMarkdownToChunks(doc, { maxChunkChars: 2, chunkOverlap: 2 })).toThrow('chunkOverlap');
    expect(() => parseMarkdownToChunks(doc, { chunkOverlap: 1 })).toThrow('requires maxChunkChars');
  });
});
