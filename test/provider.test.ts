import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentChunk, LLMProvider } from '../src/index.js';
import { createLocalAIProvider, createOpenAIProvider, createVercelAIProvider, searchDocuments } from '../src/index.js';

const generateTextMock = vi.hoisted(() => vi.fn());
const streamTextMock = vi.hoisted(() => vi.fn());
const createOpenAIMock = vi.hoisted(() => vi.fn());

vi.mock('ai', () => ({ generateText: generateTextMock, streamText: streamTextMock }));
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: createOpenAIMock }));

describe('LLMProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('can be implemented by a vendor-specific adapter', async () => {
    const provider: LLMProvider = {
      async generate(messages) {
        return { content: `Received ${messages.length} message(s).`, model: 'test-provider' };
      },
    };

    await expect(provider.generate([{ role: 'user', content: 'How do I authenticate?' }])).resolves.toEqual({
      content: 'Received 1 message(s).',
      model: 'test-provider',
    });
  });

  it('searches local documents and returns the best title match first', () => {
    const documents: DocumentChunk[] = [
      {
        id: 'setup',
        title: 'Setup',
        content: 'Install the plugin and add it to your Docusaurus config.',
        url: '/docs/setup',
        type: 'prose',
      },
      {
        id: 'deploy',
        title: 'Deployment',
        content: 'Build the site before deploying it.',
        url: '/docs/deploy',
        type: 'prose',
      },
    ];

    expect(searchDocuments('setup plugin', documents)[0]).toMatchObject({ document: { id: 'setup' } });
  });

  it('provides a deterministic no-credentials implementation', async () => {
    const provider = createLocalAIProvider({
      documents: [
        {
          id: 'auth',
          title: 'Authentication',
          content: 'Configure an API key in the server environment.',
          url: '/docs/auth',
          type: 'prose',
        },
      ],
    });

    await expect(provider.generate([{ role: 'user', content: 'API key' }])).resolves.toMatchObject({
      model: 'local-document-search',
      content: expect.stringContaining('/docs/auth'),
      sources: [{ url: '/docs/auth' }],
    });
  });

  it('adapts an AI SDK model without exposing SDK-specific response types', async () => {
    generateTextMock.mockResolvedValue({
      text: 'Generated answer',
      usage: { inputTokens: 12, outputTokens: 7, totalTokens: 19 },
    });

    const model = { provider: 'test', modelId: 'test-model' };
    const provider = createVercelAIProvider({
      model: 'test-model',
      createModel: () => model,
      system: 'Answer from docs.',
    });

    await expect(
      provider.generate([
        { role: 'system', content: 'System message' },
        { role: 'user', content: 'Question' },
      ]),
    ).resolves.toEqual({
      content: 'Generated answer',
      model: 'test-model',
      usage: { promptTokens: 12, completionTokens: 7, totalTokens: 19 },
    });

    expect(generateTextMock).toHaveBeenCalledWith({
      model,
      messages: [{ role: 'user', content: 'Question' }],
      instructions: 'Answer from docs.\n\nSystem message',
    });
  });

  it('normalizes RAG system context for AI SDK 7 instructions', async () => {
    generateTextMock.mockResolvedValue({ text: 'RAG answer', usage: {} });
    const provider = createVercelAIProvider({
      model: 'gpt-4o-mini',
      createModel: () => ({ provider: 'openai.chat' }),
      system: 'Follow the application policy.',
    });

    await provider.generate([
      { role: 'system', content: 'Retrieved documentation context.' },
      { role: 'user', content: 'How does this work?' },
    ]);

    const call = generateTextMock.mock.calls.at(-1)?.[0] as {
      messages: readonly { role: string }[];
      instructions: string;
    };
    expect(call.messages).toEqual([{ role: 'user', content: 'How does this work?' }]);
    expect(call.messages.some((message) => message.role === 'system')).toBe(false);
    expect(call.instructions).toBe('Follow the application policy.\n\nRetrieved documentation context.');
  });

  it('provides an OpenAI adapter through the same contract', async () => {
    const model = { provider: 'openai', modelId: 'gpt-4o-mini' };
    createOpenAIMock.mockReturnValue(() => model);
    generateTextMock.mockResolvedValue({ text: 'OpenAI answer', usage: {} });

    const provider = createOpenAIProvider({ model: 'gpt-4o-mini', apiKey: 'test-key' });

    await expect(provider.generate([{ role: 'user', content: 'Hello' }])).resolves.toMatchObject({
      content: 'OpenAI answer',
      model: 'gpt-4o-mini',
    });
    expect(createOpenAIMock).toHaveBeenCalledWith({ apiKey: 'test-key' });
  });

  it('adapts AI SDK text deltas to the streaming contract', async () => {
    const textStream = (async function* () {
      yield 'Hello';
      yield ' world';
    })();
    streamTextMock.mockReturnValue({
      textStream,
      usage: Promise.resolve({ inputTokens: 4, outputTokens: 3, totalTokens: 7 }),
    });

    const provider = createVercelAIProvider({ model: 'test-model', createModel: () => ({ provider: 'test' }) });
    const response = await provider.stream?.(
      [
        { role: 'system', content: 'Use the retrieved context.' },
        { role: 'user', content: 'Hello?' },
      ],
      { temperature: 0.2 },
    );

    expect(response?.sources).toBeUndefined();
    await expect(response?.usage).resolves.toEqual({ promptTokens: 4, completionTokens: 3, totalTokens: 7 });
    await expect(response ? collect(response.stream) : Promise.reject(new Error('stream unavailable'))).resolves.toBe(
      'Hello world',
    );
    expect(streamTextMock).toHaveBeenCalledWith({
      model: { provider: 'test' },
      messages: [{ role: 'user', content: 'Hello?' }],
      instructions: 'Use the retrieved context.',
      temperature: 0.2,
    });
  });

  it('accepts a browser ReadableStream through the streaming contract', async () => {
    const provider: LLMProvider = {
      generate: vi.fn(),
      stream: vi.fn().mockResolvedValue({
        stream: new ReadableStream<string>({
          start(controller) {
            controller.enqueue('first');
            controller.enqueue(' second');
            controller.close();
          },
        }),
      }),
    };

    const response = await provider.stream?.([{ role: 'user', content: 'Question' }]);
    expect(response?.stream).toBeDefined();
    await expect(
      response ? collectReadable(response.stream) : Promise.reject(new Error('stream unavailable')),
    ).resolves.toBe('first second');
  });
});

const collect = async (stream: AsyncIterable<string>): Promise<string> => {
  let content = '';
  for await (const delta of stream) content += delta;
  return content;
};

const collectReadable = async (stream: AsyncIterable<string> | ReadableStream<string>): Promise<string> => {
  if (typeof (stream as AsyncIterable<string>)[Symbol.asyncIterator] === 'function') {
    return collect(stream as AsyncIterable<string>);
  }
  const reader = (stream as ReadableStream<string>).getReader();
  let content = '';
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
