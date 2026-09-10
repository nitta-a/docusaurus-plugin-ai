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

## Vercel AI SDK adapter

The package includes a small server-side OpenAI adapter backed by the Vercel
AI SDK. The adapter returns the same vendor-neutral `AIProvider` shape, so the
chat component and Docusaurus-facing API do not depend on SDK-specific types:

```ts
import { createOpenAIProvider } from 'docusaurus-plugin-ai';

const provider = createOpenAIProvider({
  model: 'gpt-4o-mini',
  // Omit apiKey to use the SDK's OPENAI_API_KEY environment variable.
});
```

Other AI SDK providers can use the generic adapter without changing the public
contract. For example, an Azure or Bedrock model factory can be supplied from
the corresponding provider package:

```ts
import { createVercelAIProvider } from 'docusaurus-plugin-ai';

const provider = createVercelAIProvider({
  model: 'your-deployment-or-model-id',
  createModel: (modelId) => createProviderModel(modelId),
});
```

`createProviderModel` is intentionally application-owned in this example, so
Azure/Bedrock packages remain optional and do not become dependencies of the
core plugin. The factory return type is opaque at this boundary; Vercel AI SDK
types are not part of the generated public declarations.

## API key and production provider

The built-in `/ai` page uses `createLocalAIProvider`, so the demo does not
need an API key. For production, keep the API key on a server and expose a
small API endpoint to the browser. Do not put an API key in Docusaurus config,
React code, or a value that is bundled into the static site.

Set the key only in the backend environment, for example:

```bash
AI_PROVIDER_API_KEY=your-server-side-key
```

The browser-side provider can implement the same contract by calling your
endpoint:

```ts
import type { AIProvider } from 'docusaurus-plugin-ai';

export const browserProvider: AIProvider = {
  async generate(input) {
    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!response.ok) throw new Error('AI request failed');
    return response.json();
  },
};
```

Your backend owns the provider-specific SDK and secret. It validates the
request, calls OpenAI, Azure OpenAI, AWS Bedrock, or another service using
`process.env.AI_PROVIDER_API_KEY`, then returns an `AIResponse`:

```ts
const serverProvider: AIProvider = {
  async generate(input) {
    // Use the selected provider SDK here. The key stays on the server.
    const content = await callProviderSDK({
      apiKey: process.env.AI_PROVIDER_API_KEY,
      messages: input.messages,
    });
    return { content, model: 'your-provider-model' };
  },
};

// Example framework-agnostic endpoint handler.
export async function POST(request: Request) {
  const input = await request.json();
  const result = await serverProvider.generate(input);
  return Response.json(result);
}
```

Because a static Docusaurus site does not provide API routes by itself, deploy
the endpoint as a separate server, serverless function, or edge function. Pass
`browserProvider` to `AIChat` on a custom page:

```tsx
<AIChat provider={browserProvider} />
```

The plugin's built-in page intentionally remains a no-credentials local demo;
use `AIChat` directly when the application needs a production provider.

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
