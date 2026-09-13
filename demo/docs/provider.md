---
sidebar_position: 3
title: Provider contract
---

# Provider contract

An `LLMProvider` receives an array of system, user, and assistant messages and
returns normalized answer text. An `AIRetriever` independently returns
structure-preserving document chunks. Use `createRAGProvider` to compose the
two contracts and attach source citations to the response. The demo uses
`createLocalAIProvider`, which searches the generated local index
deterministically. A production adapter can call OpenAI, Azure OpenAI, Bedrock,
or another service without changing the Docusaurus-facing API.

For a Vercel deployment, the same adapter can use AI Gateway without adding a
provider-specific package to this core library:

Install `ai` in the server application because the application imports
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

Create this provider on the server. Do not expose Gateway credentials in the
static site; `providerOptions` is server-side configuration and is not accepted
by the browser HTTP contract.

The core package also includes direct server-side helpers for Google Gemini and
Claude. Install the corresponding AI SDK provider in the server application:

```bash
pnpm add @ai-sdk/google @ai-sdk/anthropic
```

```ts
import { createAnthropicProvider, createGoogleProvider } from '@docusaurus-plugin-ai/core';

const gemini = createGoogleProvider({ model: 'gemini-2.5-flash' });
const claude = createAnthropicProvider({ model: 'claude-sonnet-4-5' });
```

Omit `apiKey` to use the provider SDK environment variables. Keep both helpers
and their credentials on the server.

If a provider exposes the optional `stream` method, `AIChat` renders text
deltas as they arrive and shows RAG sources immediately. Providers without
`stream` continue to use the normal `generate` path.

The React UI can stop an active generation, retry a failed request, regenerate
an assistant answer, and clear the current conversation. `stopLabel`,
`retryLabel`, `regenerateLabel`, and `clearLabel` provide localized labels.
