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
import { AIChat, createHttpAIProvider } from 'docusaurus-plugin-ai';

export function DocumentationChat() {
  return <AIChat provider={createHttpAIProvider({ endpoint: '/api/ai' })} />;
}
```

The endpoint accepts `{ messages, options }`, returns `AIResponse` JSON for
normal requests, and returns the AI SDK text stream for requests whose
`Accept` header includes `text/plain`. Streaming citations are sent in the
URL-encoded `x-docusaurus-ai-sources` response header.
