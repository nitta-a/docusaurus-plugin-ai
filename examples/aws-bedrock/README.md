# AWS Lambda + Amazon Bedrock

This example keeps AWS credentials and the Bedrock model behind an AWS Lambda
Function URL. The static Docusaurus site only uses `createHttpAIProvider` and
never receives AWS credentials.

```text
Browser -> createHttpAIProvider -> POST /api/ai
                                  -> Lambda Function URL (RESPONSE_STREAM)
                                  -> createRAGProvider
                                  -> @ai-sdk/amazon-bedrock
                                  -> Amazon Bedrock
```

## Configure

Install and build the example from the repository root:

```bash
pnpm --dir examples/aws-bedrock install
pnpm --dir examples/aws-bedrock build
```

Set these Lambda environment variables:

```text
AWS_REGION=us-east-1
BEDROCK_MODEL=amazon.nova-lite-v1:0
DOCS_DIR=/var/task/docs
DOCS_ROUTE_BASE_PATH=/docs
```

The default model is Amazon Nova Lite. Model availability and access must be
enabled for the selected AWS Region and account. Change `BEDROCK_MODEL` to
another Bedrock model ID when needed.

Attach an execution role with `bedrock:InvokeModel` and
`bedrock:InvokeModelWithResponseStream` permissions for the selected model.
Keep the role scoped to the model ARN in production. Lambda automatically
supplies the role credentials; local development can use the standard AWS
credential chain (`AWS_PROFILE`, AWS SSO, or environment credentials).

Create the Function URL with `InvokeMode=RESPONSE_STREAM` to preserve
incremental output:

```bash
aws lambda create-function-url-config \
  --function-name <function-name> \
  --auth-type AWS_IAM \
  --invoke-mode RESPONSE_STREAM
```

Response streaming is available through Lambda Function URLs and requires a
supported AWS Region. For public browser access, put an authenticated
application endpoint or a suitable API layer in front of Lambda instead of
using `NONE` authorization without additional protection.

## Browser provider

```tsx
import { AIChat, createHttpAIProvider } from 'docusaurus-plugin-ai';

export function DocumentationChat() {
  return <AIChat provider={createHttpAIProvider({ endpoint: '/api/ai' })} />;
}
```

The handler accepts `{ messages, options }`. It returns `AIResponse` JSON for
normal requests and a plain UTF-8 text stream when the request `Accept` header
includes `text/plain`. RAG citations are sent in the URL-encoded
`x-docusaurus-ai-sources` response header.
