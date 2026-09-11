# docusaurus-plugin-ai

Vendor-neutral AI foundations for Docusaurus documentation.

The package provides structure-preserving Markdown indexing, a separate
retrieval contract, a separate LLM contract, functional RAG composition, and a
small unstyled React chat surface with source citations.

## Requirements

- Node.js 20 or later
- pnpm 10 or later

## Development

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Docusaurus plugin

Add the plugin to `docusaurus.config.mjs`:

```js
import aiPlugin from 'docusaurus-plugin-ai/plugin';

export default {
  plugins: [[aiPlugin, { docsDir: 'docs', routePath: '/ai' }]],
};
```

At build time the plugin reads `.md` and `.mdx` files, preserves prose,
fenced code, tables, and heading paths as document chunks, and creates the
chat page at `routePath`. The built-in page uses the deterministic local
provider and does not require credentials.

## Core contracts

Retrieval and generation are independent plain-object contracts:

```ts
import type { AIRetriever, DocumentChunk, LLMProvider } from 'docusaurus-plugin-ai';

const retriever: AIRetriever = {
  async retrieve(query, options) {
    // Search an application-owned index.
    return [] satisfies readonly DocumentChunk[];
  },
};

const provider: LLMProvider = {
  async generate(messages, options) {
    // Call an application-owned model or backend.
    return { content: `Received ${messages.length} message(s).` };
  },
};
```

Compose them with `createRAGProvider`:

```ts
import { createRAGProvider } from 'docusaurus-plugin-ai';

const ragProvider = createRAGProvider({
  retriever,
  provider,
  topK: 5,
  buildPrompt: ({ query, chunks }) =>
    `Answer the question from these documents only.\nQuestion: ${query}\n${chunks
      .map((chunk) => chunk.content)
      .join('\n\n')}`,
});

const response = await ragProvider.generate([{ role: 'user', content: 'How do I configure it?' }]);
// response.sources contains id, title, URL, and a citation snippet.
```

`LLMProvider.generate` receives messages directly and accepts optional
temperature, token-limit, and abort-signal controls. `AIResponse.sources` is
reserved for compact `SourceReference` citation metadata, so provider-specific
generation types do not leak into the public API.

Providers can optionally expose `stream` for incremental text generation. The
stream may be an `AsyncIterable<string>` or a browser `ReadableStream<string>`:

```ts
const response = await provider.stream?.([{ role: 'user', content: 'How?' }]);
if (response) {
  for await (const delta of response.stream) {
    // Render each delta immediately.
  }
  // response.sources is available before the first delta for RAG providers.
}
```

`AIChat` automatically prefers `stream` when available and falls back to
`generate` otherwise. The Vercel AI SDK adapter uses `streamText().textStream`.

## Vercel AI SDK adapter

The package includes a server-side OpenAI adapter backed by the Vercel AI SDK:

```ts
import { createOpenAIProvider } from 'docusaurus-plugin-ai';

const provider = createOpenAIProvider({
  model: 'gpt-4o-mini',
  // Omit apiKey to use the SDK's OPENAI_API_KEY environment variable.
});
```

Other AI SDK providers can use `createVercelAIProvider` with an application-owned
model factory. Keep credentials on the server; do not bundle provider keys into
the static Docusaurus site.

## Run the Docusaurus demo

```bash
pnpm install
pnpm demo:build
pnpm --dir demo start
```

Open [http://localhost:3000/ai](http://localhost:3000/ai) and ask about the
documentation. Matching chunks and their source links are shown below each
answer.

## License

MIT License. See [LICENSE](./LICENSE) for the full text.
