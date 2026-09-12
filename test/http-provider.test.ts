import { describe, expect, it, vi } from 'vitest';
import { AI_SOURCES_HEADER, type AIProviderError, createHttpAIProvider } from '../src/index.js';

describe('createHttpAIProvider', () => {
  it('posts the vendor-neutral request envelope and normalizes JSON responses', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: '回答',
          model: 'azure-deployment',
          sources: [{ id: 'setup', title: '設定', url: '/docs/setup', snippet: '説明' }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const provider = createHttpAIProvider({
      endpoint: '/api/ai',
      fetch: fetchMock,
      headers: { authorization: 'Bearer test' },
    });

    await expect(
      provider.generate([{ role: 'user', content: '質問' }], { temperature: 0.2, maxTokens: 100 }),
    ).resolves.toEqual({
      content: '回答',
      model: 'azure-deployment',
      sources: [{ id: 'setup', title: '設定', url: '/docs/setup', snippet: '説明' }],
    });

    const request = fetchMock.mock.calls[0]?.[1];
    expect(request?.method).toBe('POST');
    expect(new Headers(request?.headers).get('authorization')).toBe('Bearer test');
    expect(new Headers(request?.headers).get('accept')).toBe('application/json');
    expect(JSON.parse(String(request?.body))).toEqual({
      messages: [{ role: 'user', content: '質問' }],
      options: { temperature: 0.2, maxTokens: 100 },
    });
  });

  it('decodes UTF-8 text streams and exposes citations from the response header', async () => {
    const source = [{ id: 'one', title: '認証', url: '/docs/auth', snippet: 'APIキー' }];
    const encoder = new TextEncoder();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(encoder.encode('日本語'));
            controller.enqueue(encoder.encode('の回答'));
            controller.close();
          },
        }),
        {
          status: 200,
          headers: {
            'content-type': 'text/plain; charset=utf-8',
            [AI_SOURCES_HEADER]: encodeURIComponent(JSON.stringify(source)),
          },
        },
      ),
    );
    const provider = createHttpAIProvider({ endpoint: '/api/ai', fetch: fetchMock });
    const response = await provider.stream?.([{ role: 'user', content: '質問' }]);

    expect(response?.sources).toEqual(source);
    await expect(response ? collect(response.stream) : Promise.reject(new Error('stream unavailable'))).resolves.toBe(
      '日本語の回答',
    );
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toBeDefined();
    expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get('accept')).toBe('text/plain');
  });

  it('surfaces useful HTTP errors', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ error: 'backend unavailable' }), { status: 503 }));
    const provider = createHttpAIProvider({ endpoint: '/api/ai', fetch: fetchMock });

    await expect(provider.generate([{ role: 'user', content: '質問' }])).rejects.toThrow(
      'HTTP 503: {"error":"backend unavailable"}',
    );
  });

  it('preserves structured error fields for the UI', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'AIサービスでエラーが発生しました。',
          code: 'AI_PROVIDER_ERROR',
          detail: 'provider error message',
          status: 500,
          traceId: 'trace-123',
        }),
        { status: 500, headers: { 'content-type': 'application/json' } },
      ),
    );
    const provider = createHttpAIProvider({ endpoint: '/api/ai', fetch: fetchMock });

    await expect(provider.generate([{ role: 'user', content: '質問' }])).rejects.toMatchObject({
      name: 'AIProviderError',
      response: {
        error: 'AIサービスでエラーが発生しました。',
        code: 'AI_PROVIDER_ERROR',
        detail: 'provider error message',
        status: 500,
        traceId: 'trace-123',
      },
    } satisfies Partial<AIProviderError>);
  });
});

const collect = async (stream: AsyncIterable<string> | ReadableStream<string>): Promise<string> => {
  let content = '';
  if (typeof (stream as AsyncIterable<string>)[Symbol.asyncIterator] === 'function') {
    for await (const delta of stream as AsyncIterable<string>) content += delta;
    return content;
  }
  const reader = (stream as ReadableStream<string>).getReader();
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) return content;
      content += result.value;
    }
  } finally {
    reader.releaseLock();
  }
};
