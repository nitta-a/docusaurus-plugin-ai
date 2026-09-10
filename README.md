# docusaurus-plugin-ai

Vendor-neutral AI foundations for Docusaurus documentation.

This package provides a vendor-neutral provider contract, build-time Markdown
indexing, local full-text retrieval, and a small unstyled React chat surface.
The included Docusaurus demo works without an API key, so the integration can
be checked before connecting a production AI backend.

## Requirements

- Node.js 20 or later
- pnpm 10 or later

## Development

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm format
pnpm test
pnpm build
```

Lint and formatting are handled by Biome.

## Docusaurus plugin

Add the plugin to `docusaurus.config.mjs`:

```js
import aiPlugin from 'docusaurus-plugin-ai/plugin';

export default {
  plugins: [
    [aiPlugin, { docsDir: 'docs', routePath: '/ai' }],
  ],
};
```

At build time the plugin reads `.md` and `.mdx` files under `docsDir`, creates
a static index, and adds the chat page at `routePath`. The default page uses
`createLocalAIProvider`; use `AIChat` directly when the application should
provide its own `AIProvider`.

## Provider contract

The public API is vendor-neutral. An adapter can implement the same interface
for OpenAI, Azure OpenAI, AWS Bedrock, or a custom service:

```ts
import type { AIProvider } from 'docusaurus-plugin-ai';

const provider: AIProvider = {
  async generate({ messages }) {
    // Call the selected AI service here.
    return {
      content: `Answer based on ${messages.length} message(s).`,
    };
  },
};
```

The initial interface is deliberately small:

- `AIMessage` represents system, user, and assistant messages.
- `AIGenerateInput` contains the messages sent to a provider.
- `AIResponse` contains normalized answer text and optional model/usage data.
- `AIProvider` exposes the asynchronous `generate` method.

## Run the Docusaurus demo

```bash
pnpm install
pnpm demo:build
pnpm --dir demo start
```

Open [http://localhost:3000/ai](http://localhost:3000/ai) and ask about
configuration or the provider contract. The demo searches its three local
documentation pages and displays the matching source paths.

## License

MIT License. See [LICENSE](./LICENSE) for the full text.
