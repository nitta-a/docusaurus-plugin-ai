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
});
