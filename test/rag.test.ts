import { describe, expect, it, vi } from 'vitest';
import { createRAGProvider, type DocumentChunk, type LLMProvider } from '../src/index.js';

const chunks: readonly DocumentChunk[] = [
  {
    id: 'setup',
    title: 'Setup',
    url: '/docs/setup',
    content: 'Install the plugin with pnpm.',
    type: 'prose',
    headingPath: ['Guide', 'Setup'],
  },
];

describe('createRAGProvider', () => {
  it('retrieves the last user message, composes a system prompt, and attaches sources', async () => {
    const retriever = { retrieve: vi.fn().mockResolvedValue(chunks) };
    const provider: LLMProvider = { generate: vi.fn().mockResolvedValue({ content: 'Answer', model: 'test' }) };
    const buildPrompt = vi.fn(({ query, chunks: promptChunks }) => `${query}:${promptChunks[0]?.content}`);
    const rag = createRAGProvider({ retriever, provider, topK: 2, buildPrompt });

    await expect(
      rag.generate([
        { role: 'system', content: 'old system' },
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'previous' },
        { role: 'user', content: 'latest' },
      ]),
    ).resolves.toEqual({
      content: 'Answer',
      model: 'test',
      sources: [{ id: 'setup', title: 'Setup', url: '/docs/setup', snippet: 'Install the plugin with pnpm.' }],
    });

    expect(retriever.retrieve).toHaveBeenCalledWith('latest', { limit: 2 });
    expect(buildPrompt).toHaveBeenCalledWith({ query: 'latest', chunks });
    expect(provider.generate).toHaveBeenCalledWith(
      [
        { role: 'system', content: 'latest:Install the plugin with pnpm.' },
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'previous' },
        { role: 'user', content: 'latest' },
      ],
      undefined,
    );
  });

  it('does not retrieve when there is no user message', async () => {
    const retriever = { retrieve: vi.fn() };
    const provider: LLMProvider = { generate: vi.fn().mockResolvedValue({ content: 'Answer' }) };
    const rag = createRAGProvider({ retriever, provider });
    const messages = [{ role: 'system' as const, content: 'System' }];

    await expect(rag.generate(messages)).resolves.toEqual({ content: 'Answer', sources: [] });
    expect(retriever.retrieve).not.toHaveBeenCalled();
    expect(provider.generate).toHaveBeenCalledWith(messages, undefined);
  });

  it('propagates retriever and provider errors', async () => {
    const retriever = { retrieve: vi.fn().mockRejectedValue(new Error('retrieval failed')) };
    const provider: LLMProvider = { generate: vi.fn() };
    const rag = createRAGProvider({ retriever, provider });

    await expect(rag.generate([{ role: 'user', content: 'Question' }])).rejects.toThrow('retrieval failed');

    const workingRetriever = { retrieve: vi.fn().mockResolvedValue([]) };
    const failingProvider: LLMProvider = { generate: vi.fn().mockRejectedValue(new Error('generation failed')) };
    const failingRag = createRAGProvider({ retriever: workingRetriever, provider: failingProvider });
    await expect(failingRag.generate([{ role: 'user', content: 'Question' }])).rejects.toThrow('generation failed');
  });

  it('retrieves context before streaming and exposes sources immediately', async () => {
    const retriever = { retrieve: vi.fn().mockResolvedValue(chunks) };
    const provider: LLMProvider = {
      generate: vi.fn(),
      stream: vi.fn().mockResolvedValue({
        stream: (async function* () {
          yield 'Answer';
        })(),
      }),
    };
    const rag = createRAGProvider({ retriever, provider });

    const response = await rag.stream?.([{ role: 'user', content: 'Question' }]);
    expect(response?.sources).toEqual([
      { id: 'setup', title: 'Setup', url: '/docs/setup', snippet: 'Install the plugin with pnpm.' },
    ]);
    await expect(response ? collect(response.stream) : Promise.reject(new Error('stream unavailable'))).resolves.toBe(
      'Answer',
    );
    expect(provider.stream).toHaveBeenCalled();
  });
});

const collect = async (stream: AsyncIterable<string>): Promise<string> => {
  let content = '';
  for await (const delta of stream) content += delta;
  return content;
};
