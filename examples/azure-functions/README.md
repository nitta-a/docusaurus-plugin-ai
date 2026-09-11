# Azure Functions + Azure OpenAI

This example keeps Azure credentials in a Node.js Azure Functions v4 backend.
The static Docusaurus site uses `createHttpAIProvider` and never receives an
Azure key or Entra token.

The function uses a managed identity and the Azure AI SDK adapter:

```text
Browser -> createHttpAIProvider -> POST /api/ai
                                  -> Azure Function
                                  -> createRAGProvider
                                  -> @ai-sdk/azure (Entra token)
                                  -> Azure OpenAI
```

## Configure

Install the example dependencies, then set these Function App settings:

```text
AZURE_RESOURCE_NAME=your-azure-openai-resource
AZURE_OPENAI_DEPLOYMENT=your-chat-deployment-name
DOCS_DIR=/home/site/wwwroot/docs
DOCS_ROUTE_BASE_PATH=/docs
```

`AZURE_CLIENT_ID` is optional. Set it when the Function App uses a user-assigned
managed identity; omit it for a system-assigned identity.

The deployed example uses `ManagedIdentityCredential` by default. For local
development only, set `AZURE_USE_DEFAULT_CREDENTIAL=true` and sign in with
`az login`; `DefaultAzureCredential` will then use the local developer
credential chain.

Enable the Function App identity and grant it the `Cognitive Services OpenAI
User` role on the Azure OpenAI resource. For example:

```bash
az functionapp identity assign --resource-group <resource-group> --name <function-app>
az role assignment create \
  --assignee-object-id <principal-id> \
  --role "Cognitive Services OpenAI User" \
  --scope /subscriptions/<subscription-id>/resourceGroups/<resource-group>/providers/Microsoft.CognitiveServices/accounts/<resource-name>
```

The role assignment can take several minutes to propagate. The function uses
`ManagedIdentityCredential` (or the explicit local-development fallback) with
the `https://cognitiveservices.azure.com/.default` scope and
`createAzure({ tokenProvider })`, so no API key is required.

## Run

```bash
pnpm install
pnpm build
func start
```

The endpoint is `http://localhost:7071/api/ai`.

## Browser provider

```tsx
import { AIChat, createHttpAIProvider } from '@docusaurus-plugin-ai/core';

export function DocumentationChat() {
  return <AIChat provider={createHttpAIProvider({ endpoint: '/api/ai' })} />;
}
```

The endpoint accepts `{ messages, options }`, returns `AIResponse` JSON for
normal requests, and returns the AI SDK text stream for requests whose
`Accept` header includes `text/plain`. Streaming citations are sent in the
URL-encoded `x-docusaurus-ai-sources` response header.

## Security and operations

`src/validation.ts` rejects empty or oversized prompts, more than 20 messages,
`maxTokens` values above 2000, temperatures outside `0..2`, and total prompt
content above 20,000 characters. Safe defaults of 800 output tokens and a
temperature of `0.2` are applied when callers omit those controls. The handler
uses these limits before invoking Azure OpenAI. `src/telemetry.ts` writes
query-scoped RAG events with retrieval duration, total duration, source
references, token usage, and success/error status to the Function invocation
log, which Application Insights ingests automatically.

The sample Function intentionally uses `authLevel: 'anonymous'` because it is
designed to run behind Azure Static Web Apps (SWA). SWA terminates Microsoft
Entra ID authentication and the accompanying `staticwebapp.config.json`
requires the `authenticated` role for `/api/*` before requests reach the
Function. If you deploy the Function independently, change `authLevel` to
`'function'` or put an authenticated gateway such as Azure API Management in
front of it; the SWA route configuration does not protect a standalone
Function App.

When the frontend is deployed to Azure Static Web Apps, copy
`staticwebapp.config.json` into the deployed site output. It requires Entra ID
authentication for `/api/*` and redirects unauthenticated users to the Azure
AD login route. Keep `/api/*` excluded from the Docusaurus SPA fallback.

Deployment checklist:

1. Place `staticwebapp.config.json` in the Static Web Apps output and enable Entra ID authentication.
2. Keep `validateAIRequest` enabled so message count, prompt length, `maxTokens`, and `temperature` limits are enforced.
3. Use `locale` for document language and `codeLanguage` only for fenced-code language metadata.
4. Load documents with `maxChunkChars` and `chunkOverlap` so prose is split at natural boundaries.
