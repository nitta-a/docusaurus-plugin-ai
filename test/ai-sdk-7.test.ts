import { describe, expect, it } from 'vitest';
import { createRAGProvider, createVercelAIProvider, type DocumentChunk } from '../src/index.js';

describe('AI SDK 7 integration', () => {
  it('accepts RAG system context by sending instructions instead of system messages', async () => {
    let languageModelOptions: unknown;
    const model = {
      specificationVersion: 'v4' as const,
      provider: 'test-provider',
      modelId: 'test-model',
      supportedUrls: {},
      doGenerate: async (options: unknown) => {
        languageModelOptions = options;
        return {
          content: [{ type: 'text', text: '回答' }],
          finishReason: 'stop',
          usage: {
            inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: 1, text: 1, reasoning: undefined },
          },
          warnings: [],
        };
      },
      doStream: async () => {
        throw new Error('stream is not part of this test');
      },
    };
    const provider = createVercelAIProvider({
      model: 'test-model',
      createModel: () => model,
      system: '固定ポリシー',
    });
    const chunks: readonly DocumentChunk[] = [
      { id: 'setup', title: 'Setup', url: '/setup', content: '設定方法', type: 'prose' },
    ];
    const rag = createRAGProvider({
      retriever: { search: async () => chunks },
      provider,
      buildPrompt: () => 'RAGコンテキスト',
    });

    await expect(rag.generate([{ role: 'user', content: '質問' }])).resolves.toMatchObject({ content: '回答' });

    expect(languageModelOptions).toMatchObject({
      prompt: [
        { role: 'system', content: '固定ポリシー\n\nRAGコンテキスト' },
        { role: 'user', content: [{ type: 'text', text: '質問' }] },
      ],
    });
    expect(JSON.stringify(languageModelOptions)).not.toContain('System messages are not allowed');
  });
});
