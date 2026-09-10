import { describe, expect, it } from 'vitest';
import type { AIDocument, AIProvider } from '../src/index.js';
import { createLocalAIProvider, searchDocuments } from '../src/index.js';

describe('AIProvider', () => {
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
});
