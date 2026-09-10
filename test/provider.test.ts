import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AIDocument, AIProvider } from '../src/index.js';
import { createLocalAIProvider, createOpenAIProvider, createVercelAIProvider, searchDocuments } from '../src/index.js';

const generateTextMock = vi.hoisted(() => vi.fn());
const createOpenAIMock = vi.hoisted(() => vi.fn());

vi.mock('ai', () => ({ generateText: generateTextMock }));
vi.mock('@ai-sdk/openai', () => ({ createOpenAI: createOpenAIMock }));

describe('AIProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('can be implemented by a vendor-specific adapter', async () => {
    const provider: AIProvider = {
      async generate({ messages }) {
        return {
          content: `Received ${messages.length} message(s).`,
          model: 'test-provider',
        };
      },
    };

    await expect(
      provider.generate({
        messages: [{ role: 'user', content: 'How do I authenticate?' }],
      }),
    ).resolves.toEqual({
      content: 'Received 1 message(s).',
      model: 'test-provider',
    });
  });

  it('searches local documents and returns the best title match first', () => {
    const documents: AIDocument[] = [
      {
        id: 'setup',
        title: 'Setup',
        content: 'Install the plugin and add it to your Docusaurus config.',
        url: '/docs/setup',
      },
      {
        id: 'deploy',
        title: 'Deployment',
        content: 'Build the site before deploying it.',
        url: '/docs/deploy',
      },
    ];

    expect(searchDocuments('setup plugin', documents)).toMatchObject([{ document: { id: 'setup' } }]);
  });

  it('provides a deterministic no-credentials implementation', async () => {
    const provider = createLocalAIProvider({
      documents: [
        {
          id: 'auth',
          title: 'Authentication',
          content: 'Configure an API key in the server environment.',
          url: '/docs/auth',
        },
      ],
    });

    await expect(provider.generate({ messages: [{ role: 'user', content: 'API key' }] })).resolves.toMatchObject({
      model: 'local-document-search',
      content: expect.stringContaining('/docs/auth'),
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
      provider.generate({
        messages: [
          { role: 'system', content: 'System message' },
          { role: 'user', content: 'Question' },
        ],
      }),
    ).resolves.toEqual({
      content: 'Generated answer',
      model: 'test-model',
      usage: { promptTokens: 12, completionTokens: 7, totalTokens: 19 },
    });

    expect(generateTextMock).toHaveBeenCalledWith({
      model,
      messages: [
        { role: 'system', content: 'System message' },
        { role: 'user', content: 'Question' },
      ],
      system: 'Answer from docs.',
    });
  });

  it('provides an OpenAI adapter through the same contract', async () => {
    const model = { provider: 'openai', modelId: 'gpt-4o-mini' };
    createOpenAIMock.mockReturnValue(() => model);
    generateTextMock.mockResolvedValue({ text: 'OpenAI answer', usage: {} });

    const provider = createOpenAIProvider({
      model: 'gpt-4o-mini',
      apiKey: 'test-key',
    });

    await expect(provider.generate({ messages: [{ role: 'user', content: 'Hello' }] })).resolves.toMatchObject({
      content: 'OpenAI answer',
      model: 'gpt-4o-mini',
    });
    expect(createOpenAIMock).toHaveBeenCalledWith({ apiKey: 'test-key' });
  });
});
