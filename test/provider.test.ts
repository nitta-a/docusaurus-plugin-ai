import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentChunk, LLMProvider } from '../src/index.js';
import {
  createAnthropicProvider,
  createGoogleProvider,
  createLocalAIProvider,
  createOpenAIProvider,
  createVercelAIProvider,
  searchDocuments,
} from '../src/index.js';

const generateTextMock = vi.hoisted(() => vi.fn());
const streamTextMock = vi.hoisted(() => vi.fn());
const createOpenAIMock = vi.hoisted(() => vi.fn());
const createGoogleGenerativeAIMock = vi.hoisted(() => vi.fn());
const createAnthropicMock = vi.hoisted(() => vi.fn());

vi.mock('ai', () => ({ generateText: generateTextMock, streamText: streamTextMock }));
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: createOpenAIMock }));
vi.mock('@ai-sdk/google', () => ({ createGoogleGenerativeAI: createGoogleGenerativeAIMock }));
vi.mock('@ai-sdk/anthropic', () => ({ createAnthropic: createAnthropicMock }));

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

  it('maps generation defaults and request overrides without leaking SDK types', async () => {
    generateTextMock.mockResolvedValue({ text: 'Configured answer', usage: {} });
    const providerOptions = { gateway: { models: ['openai/gpt-5-nano'] } };
    const provider = createVercelAIProvider({
      model: 'gpt-5-mini',
      createModel: () => ({ provider: 'gateway' }),
      maxOutputTokens: 400,
      temperature: 0.7,
      topP: 0.8,
      topK: 20,
      presencePenalty: 0.1,
      frequencyPenalty: 0.2,
      stopSequences: ['END'],
      seed: 1,
      maxRetries: 1,
      timeoutMs: 30000,
      providerOptions,
    });

    await provider.generate([{ role: 'user', content: 'Default question' }]);
    expect(generateTextMock).toHaveBeenNthCalledWith(1, {
      model: { provider: 'gateway' },
      messages: [{ role: 'user', content: 'Default question' }],
      maxOutputTokens: 400,
      temperature: 0.7,
      topP: 0.8,
      topK: 20,
      presencePenalty: 0.1,
      frequencyPenalty: 0.2,
      stopSequences: ['END'],
      seed: 1,
      maxRetries: 1,
      timeout: 30000,
      providerOptions,
    });

    await provider.generate([{ role: 'user', content: 'Question' }], {
      maxTokens: 200,
      temperature: 0.2,
      topP: 0.5,
      topK: 10,
      presencePenalty: 0,
      frequencyPenalty: 0,
      stopSequences: ['DONE'],
      seed: 2,
      maxRetries: 0,
      timeoutMs: 5000,
    });

    expect(generateTextMock).toHaveBeenNthCalledWith(2, {
      model: { provider: 'gateway' },
      messages: [{ role: 'user', content: 'Question' }],
      maxOutputTokens: 200,
      temperature: 0.2,
      topP: 0.5,
      topK: 10,
      presencePenalty: 0,
      frequencyPenalty: 0,
      stopSequences: ['DONE'],
      seed: 2,
      maxRetries: 0,
      timeout: 5000,
      providerOptions,
    });
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

  it('forwards extended generation defaults through the OpenAI adapter', async () => {
    generateTextMock.mockResolvedValue({ text: 'OpenAI configured answer', usage: {} });
    const providerOptions = { openai: { reasoningEffort: 'low' } };
    const provider = createOpenAIProvider({
      model: 'gpt-4o-mini',
      apiKey: 'test-key',
      topP: 0.8,
      topK: 20,
      presencePenalty: 0.1,
      frequencyPenalty: 0.2,
      stopSequences: ['END'],
      seed: 1,
      maxRetries: 1,
      timeoutMs: 30000,
      providerOptions,
    });

    await provider.generate([{ role: 'user', content: 'Hello' }]);

    expect(generateTextMock).toHaveBeenCalledWith({
      model: { provider: 'openai', modelId: 'gpt-4o-mini' },
      messages: [{ role: 'user', content: 'Hello' }],
      topP: 0.8,
      topK: 20,
      presencePenalty: 0.1,
      frequencyPenalty: 0.2,
      stopSequences: ['END'],
      seed: 1,
      maxRetries: 1,
      timeout: 30000,
      providerOptions,
    });
  });

  it('provides a Google Gemini adapter through the same contract', async () => {
    const model = { provider: 'google.generative-ai', modelId: 'gemini-2.5-flash' };
    createGoogleGenerativeAIMock.mockReturnValue(() => model);
    generateTextMock.mockResolvedValue({ text: 'Gemini answer', usage: {} });

    const provider = createGoogleProvider({ model: 'gemini-2.5-flash', apiKey: 'google-test-key' });

    await expect(provider.generate([{ role: 'user', content: 'Hello' }])).resolves.toMatchObject({
      content: 'Gemini answer',
      model: 'gemini-2.5-flash',
    });
    expect(createGoogleGenerativeAIMock).toHaveBeenCalledWith({ apiKey: 'google-test-key' });
    expect(generateTextMock).toHaveBeenCalledWith({
      model,
      messages: [{ role: 'user', content: 'Hello' }],
    });
  });

  it('provides a Claude adapter through the same contract', async () => {
    const model = { provider: 'anthropic.messages', modelId: 'claude-sonnet-4-5' };
    createAnthropicMock.mockReturnValue(() => model);
    generateTextMock.mockResolvedValue({ text: 'Claude answer', usage: {} });

    const provider = createAnthropicProvider({ model: 'claude-sonnet-4-5', apiKey: 'anthropic-test-key' });

    await expect(provider.generate([{ role: 'user', content: 'Hello' }])).resolves.toMatchObject({
      content: 'Claude answer',
      model: 'claude-sonnet-4-5',
    });
    expect(createAnthropicMock).toHaveBeenCalledWith({ apiKey: 'anthropic-test-key' });
    expect(generateTextMock).toHaveBeenCalledWith({
      model,
      messages: [{ role: 'user', content: 'Hello' }],
    });
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
      {
        temperature: 0.2,
        topP: 0.5,
        topK: 10,
        presencePenalty: 0,
        frequencyPenalty: 0,
        stopSequences: ['DONE'],
        seed: 2,
        maxRetries: 0,
        timeoutMs: 5000,
      },
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
      topP: 0.5,
      topK: 10,
      presencePenalty: 0,
      frequencyPenalty: 0,
      stopSequences: ['DONE'],
      seed: 2,
      maxRetries: 0,
      timeout: 5000,
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
