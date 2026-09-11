# @docusaurus-plugin-ai/core

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

## Release

Releases are published from `v*.*.*` tags after the same checks run in CI.
The GitHub repository needs an `NPM_TOKEN` secret with permission to publish
`@docusaurus-plugin-ai/core`; the workflow also enables npm provenance and creates a
GitHub Release.

```bash
git tag v0.1.0
git push origin v0.1.0
```

The tag must exactly match `package.json#version`. The publish job is
idempotent: if that exact version is already on npm, publishing is skipped and
the package is still checked for registry availability.

The release checks audit only production dependencies because the private
Docusaurus demo is a build-time workspace project. Its current `image-size`
advisories have no upstream patched version; they are not included in the npm
tarball or the package's runtime dependency graph.

## Docusaurus plugin

Add the plugin to `docusaurus.config.mjs`:

```js
import aiPlugin from '@docusaurus-plugin-ai/core/plugin';

export default {
  plugins: [[aiPlugin, { docsDir: 'docs', routePath: '/ai' }]],
};
```

At build time the plugin reads `.md` and `.mdx` files, preserves prose,
fenced code, tables, and heading paths as document chunks, and creates the
chat page at `routePath`. The built-in page uses the deterministic local
provider and does not require credentials.

Document metadata keeps the natural-language `locale` separate from fenced
code syntax: `metadata.locale` comes from document front matter (`locale` or
legacy `lang`) and falls back to Docusaurus's `i18n.currentLocale`, while
`metadata.codeLanguage` contains values such as `typescript` or `json` only
for code chunks.

Long sections can be split into overlapping retrieval chunks. The values below
are Unicode-character limits and are passed through to the Markdown parser:

```js
plugins: [[aiPlugin, {
  docsDir: 'docs',
  routePath: '/ai',
  maxChunkChars: 2000,
  chunkOverlap: 200,
}]],
```

## Core contracts

Retrieval and generation are independent plain-object contracts:

```ts
import type { AIRetriever, DocumentChunk, LLMProvider } from '@docusaurus-plugin-ai/core';

const retriever: AIRetriever = {
  async search(query, options) {
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
import { createRAGProvider } from '@docusaurus-plugin-ai/core';

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
import { createOpenAIProvider } from '@docusaurus-plugin-ai/core';

const provider = createOpenAIProvider({
  model: 'gpt-4o-mini',
  // Omit apiKey to use the SDK's OPENAI_API_KEY environment variable.
});
```

Other AI SDK providers can use `createVercelAIProvider` with an application-owned
model factory. Keep credentials on the server; do not bundle provider keys into
the static Docusaurus site.

### Azure OpenAI with Microsoft Entra ID

The plugin deliberately does not depend on the Azure SDK. Install
`@ai-sdk/azure` and `@azure/identity` in the server application, then pass the
Azure model factory to the same adapter:

```ts
import { createAzure } from '@ai-sdk/azure';
import { getBearerTokenProvider, ManagedIdentityCredential } from '@azure/identity';
import { createVercelAIProvider } from '@docusaurus-plugin-ai/core';

const credential = new ManagedIdentityCredential(
  process.env.AZURE_CLIENT_ID ? { clientId: process.env.AZURE_CLIENT_ID } : undefined,
);
const azure = createAzure({
  resourceName: process.env.AZURE_RESOURCE_NAME!,
  tokenProvider: getBearerTokenProvider(
    credential,
    'https://cognitiveservices.azure.com/.default',
  ),
});

const provider = createVercelAIProvider({
  model: process.env.AZURE_OPENAI_DEPLOYMENT!,
  createModel: (deployment) => azure.chat(deployment),
});
```

Use `azure.chat()` when the application expects the Azure OpenAI Chat
Completions API. Assign the Function App's system- or user-assigned managed
identity the `Cognitive Services OpenAI User` role on the Azure OpenAI resource.
The complete Azure Functions handler, including RAG, streaming, and role setup,
is in [`examples/azure-functions`](./examples/azure-functions/README.md). The
adapter follows the [AI SDK Azure provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/azure)
and the identity setup follows [Microsoft's managed identity guidance](https://learn.microsoft.com/en-us/azure/foundry-classic/openai/how-to/managed-identity).

### Amazon Bedrock with AWS Lambda

The same adapter works with Amazon Bedrock without adding an AWS dependency to
the core package. Install `@ai-sdk/amazon-bedrock` and use the AWS SDK default
credential chain in the Lambda backend:

```ts
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { createVercelAIProvider } from '@docusaurus-plugin-ai/core';

const bedrock = createAmazonBedrock({
  region: process.env.AWS_REGION!,
  credentialProvider: fromNodeProviderChain(),
});

const provider = createVercelAIProvider({
  model: process.env.BEDROCK_MODEL ?? 'amazon.nova-lite-v1:0',
  createModel: (modelId) => bedrock(modelId),
});
```

Give the Lambda execution role only the Bedrock permissions it needs. The
complete Lambda Function URL handler, including RAG, streaming, and
`x-docusaurus-ai-sources`, is in
[`examples/aws-bedrock`](./examples/aws-bedrock/README.md).

### Browser-to-backend HTTP provider

For a static Docusaurus site, keep the Azure provider behind an application-owned
HTTP endpoint:

```tsx
import { AIChat, createHttpAIProvider } from '@docusaurus-plugin-ai/core';

const provider = createHttpAIProvider({ endpoint: '/api/ai' });
export const DocumentationChat = () => <AIChat provider={provider} />;
```

The provider posts `{ messages, options }`. A normal response is an
`AIResponse` JSON object. A streaming response is plain UTF-8 text, compatible
with `streamText().toTextStreamResponse()`. If the backend has RAG citations,
it can expose the URL-encoded `x-docusaurus-ai-sources` response header so the
chat surface can render sources before the first text delta. See the Azure
Functions example for a complete handler.

#### Azure Static Web Apps authentication boundary

The Azure Functions example uses `authLevel: 'anonymous'` because the sample
is intended to sit behind Azure Static Web Apps. Its
[`staticwebapp.config.json`](./examples/azure-functions/staticwebapp.config.json)
requires the `authenticated` role for `/api/*` and redirects unauthenticated
users to Microsoft Entra ID. A standalone Function App is not protected by
that file: deploy it with `authLevel: 'function'` or enforce authentication at
an API gateway such as Azure API Management.

## React UI package

The provider-neutral React surface lives in `@docusaurus-plugin-ai/ui`. It uses
the Vercel AI SDK React transport for streaming, but contains no OpenAI, Azure,
Bedrock, or other provider implementation:

```tsx
import { AiChat } from '@docusaurus-plugin-ai/ui';
import '@docusaurus-plugin-ai/ui/styles.css';

export function DocumentationChat() {
  return (
    <AiChat
      endpoint="/api/ai/chat"
      placeholder="ドキュメントについて質問してください"
      context={{ pathname: window.location.pathname }}
    />
  );
}
```

The endpoint should return a Vercel AI SDK plain-text stream (for example,
`streamText(...).toTextStreamResponse()`). The UI sends normalized
`{ messages, context }` JSON, shows a fixed bottom-right launcher, and supports
Enter to send and Shift+Enter for a newline. The existing core package's
`createHttpAIProvider` remains available for integrations that prefer the
provider-injected `AIChat` API.

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
