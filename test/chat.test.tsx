import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AIChatSources, consumeAIStream } from '../src/chat.js';
import type { LLMProvider } from '../src/core/types.js';

describe('AIChat streaming and citations', () => {
  it('consumes provider stream deltas in order', async () => {
    const provider: LLMProvider = {
      generate: async () => ({ content: 'unused' }),
      stream: async () => ({
        stream: (async function* () {
          yield '日本語';
          yield 'の回答';
        })(),
      }),
    };
    const response = await provider.stream?.([{ role: 'user', content: '質問' }]);
    const updates: string[] = [];

    await expect(response ? consumeAIStream(response.stream, (content) => updates.push(content)) : '').resolves.toBe(
      '日本語の回答',
    );
    expect(updates).toEqual(['日本語', '日本語の回答']);
  });

  it('renders citation links and optional snippets semantically', () => {
    const markup = renderToStaticMarkup(
      <AIChatSources
        sources={[
          { id: 'one', title: '認証ガイド', url: '/docs/auth', snippet: 'APIキーの設定方法' },
          { id: 'two', title: '設定', url: '/docs/config' },
        ]}
      />,
    );

    expect(markup).toContain('aria-label="参照元"');
    expect(markup).toContain('href="/docs/auth"');
    expect(markup).toContain('APIキーの設定方法');
    expect(markup).toContain('href="/docs/config"');
  });
});
