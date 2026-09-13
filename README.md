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
Docusaurus demo is a build-time workspace project. Docusaurus currently pulls
in `image-size@2.0.2`, for which npm has not published an upstream patched
version. The workspace applies `patches/image-size@2.0.2.patch` to reject
malformed zero-length image boxes before they can loop; the package is not
included in the npm tarball or the package's runtime dependency graph. The
workspace's `auditConfig.ignoreGhsas` lists only these two advisories because
the registry metadata identifies the locally patched package by its vulnerable
version; `pnpm audit` reports them as ignored and `pnpm audit:prod` remains
clean.

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

The adapter also supports common AI SDK generation controls such as
`maxRetries`, `timeoutMs`, `topP`, `topK`, penalties, stop sequences, and `seed`.
Per-request values override adapter defaults. `timeoutMs` is converted to the AI
SDK `timeout` option. `signal` remains an abort signal and is not serialized by
the HTTP provider. Provider-specific `providerOptions` are server-side adapter
configuration only and must not come from browser input.

`createVercelAIProvider` is compatible with AI SDK 7: it detects every
`role: 'system'` message, removes those messages from `messages`, and combines
their content into the `instructions` option. The configured `system` value is
placed first, followed by RAG context, preserving the instruction order. This
also applies to `createOpenAIProvider` and to Azure, Bedrock, or other adapters
that supply a model factory. Applications do not need to rewrite
`createRAGProvider` output.

#### Vercel AI Gateway

Use the existing model factory with the AI SDK Gateway when the server needs
provider routing or model fallbacks. No additional provider package or
`createGatewayProvider` API is required:

Install the AI SDK in the server application because the application imports
`gateway` directly:

```bash
pnpm add ai
```

```ts
import { gateway } from 'ai';
import { createVercelAIProvider } from '@docusaurus-plugin-ai/core';

const provider = createVercelAIProvider({
  model: 'openai/gpt-5-mini',
  createModel: (modelId) => gateway(modelId),
  providerOptions: {
    gateway: {
      models: ['openai/gpt-5-nano', 'google/gemini-2.5-flash'],
    },
  },
});
```

Initialize Gateway only in the server-side endpoint. Keep its credentials out
of the static Docusaurus bundle. Configure Gateway authentication through the
deployment environment, and use its server-side routing/fallback settings for
provider selection.

#### Google Gemini

Install the Google provider in the server application:

```bash
pnpm add @ai-sdk/google
```

```ts
import { createGoogleProvider } from '@docusaurus-plugin-ai/core';

const provider = createGoogleProvider({
  model: 'gemini-2.5-flash',
  // Omit apiKey to use GOOGLE_GENERATIVE_AI_API_KEY.
});
```

#### Claude / Anthropic

Install the Anthropic provider in the server application:

```bash
pnpm add @ai-sdk/anthropic
```

```ts
import { createAnthropicProvider } from '@docusaurus-plugin-ai/core';

const provider = createAnthropicProvider({
  model: 'claude-sonnet-4-5',
  // Omit apiKey to use ANTHROPIC_API_KEY.
});
```

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

The request contract uses content negotiation:

| Client | `Accept` | Response |
| --- | --- | --- |
| `createHttpAIProvider().generate()` | `application/json` | `AIResponse` JSON, including `model`, `usage`, and `sources` |
| `createHttpAIProvider().stream()` | `text/plain` | UTF-8 text deltas; citations are in `x-docusaurus-ai-sources` |
| `@docusaurus-plugin-ai/ui` `AiChat` | `text/plain` by default | Answer text only |

The UI also accepts an explicit `Accept: application/json` header for clients
that need JSON. Its chat renderer still displays only the response `content`;
use `createHttpAIProvider().generate()` when the caller needs the complete JSON
object programmatically. Structured failures use the public `AIErrorResponse`
shape (`error`, `code`, `detail`, `status`, and `traceId`) and are retained by
`AIProviderError`.

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
`{ messages, context }` JSON and `Accept: text/plain` by default, shows a fixed
bottom-right launcher, and supports Enter to send and Shift+Enter for a newline.
If an endpoint returns an `AIResponse` JSON envelope despite the text request,
the UI renders only `content`; `model`, `usage`, and `sources` are not mixed
into the answer text. The existing core package's
`createHttpAIProvider` remains available for integrations that prefer the
provider-injected `AIChat` API.

Each assistant answer includes a built-in `Copy answer` action. The panel can
also expand to the viewport and restore its original size:

```tsx
<AiChat
  endpoint="/api/ai/chat"
  defaultMaximized={false}
  onMaximizedChange={(maximized) => console.log('maximized', maximized)}
  onCopy={(message) => analytics.track('ai-answer-copied', { id: message.id })}
/>
```

Use `maximized` for controlled state, or `defaultMaximized` for an initial
state. `maximizeLabel`, `restoreLabel`, `copyLabel`, `copiedLabel`, and
`copyErrorLabel` allow localization without replacing the controls.

The chat also supports stopping an active generation, retrying the last failed
request, regenerating an assistant answer, and clearing the conversation. These
controls are shown automatically when using `AiChat`; customize their labels
with `stopLabel`, `retryLabel`, `regenerateLabel`, and `clearLabel`.

Assistant answers are rendered as safe Markdown with GitHub Flavored Markdown
support for headings, lists, links, code blocks, tables, and task lists. Raw
HTML is not rendered. Set `renderMarkdown={false}` when an application needs
the original plain-text presentation.

### Azure Functions communication and CORS

The complete request path is:

```text
Docusaurus/AiChat
  -> POST /api/ai with JSON messages and Accept: text/plain or application/json
  -> Azure Functions validation and CORS/auth boundary
  -> createRAGProvider retrieval
  -> createVercelAIProvider instructions normalization
  -> @ai-sdk/azure azure.chat(deployment)
  -> Azure OpenAI Chat Completions
```

For a separately hosted frontend, configure the Function App CORS allowlist
instead of using `*` in production:

```bash
az functionapp cors add \
  --resource-group <resource-group> \
  --name <function-app> \
  --allowed-origins https://docs.example.com http://localhost:3000
```

The sample also supports `CORS_ORIGIN` for explicit preflight and response
headers. Same-origin Azure Static Web Apps deployments normally do not need
additional CORS headers. Keep authentication at SWA, the Function App, or an
API gateway; CORS is not authentication.

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
