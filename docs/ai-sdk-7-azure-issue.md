# Fix AI SDK 7 system message handling and text-stream response negotiation

## Background

When using `@docusaurus-plugin-ai/core@0.2.0` with `ai@7.x`, Azure OpenAI
requests fail when RAG is enabled. `createRAGProvider` adds retrieved document
context as a `role: "system"` message, while AI SDK 7 expects that content in
`instructions` and rejects system messages in `messages`.

## Actual error

```text
System messages are not allowed in the prompt or messages fields.
Use the instructions option instead.
```

## Expected behavior

`createVercelAIProvider` should normalize system messages automatically:

- Move system messages into the `instructions` option.
- Remove system messages from `messages`.
- Preserve the order of the base system instruction and RAG context.
- Work with Azure OpenAI, OpenAI, Bedrock, and other AI SDK providers.

## Additional UI issue

`AiChat` uses `TextStreamChatTransport`. It must send `Accept: text/plain` by
default and render only the `content` field if an endpoint returns a JSON
envelope. Explicit `Accept: application/json` remains supported for
non-streaming clients that need `model`, `usage`, and `sources`.

## Structured error handling

Expose a typed `AIErrorResponse` so the UI can display a user-friendly summary,
error code, provider detail, HTTP status, and trace ID. `AiChat` should offer
an `onError` callback and a copy action for `traceId`.

## RAG source citations

Provide a built-in way to display, for every assistant response:

- Document title
- URL
- Citation snippet
- Sources received before or during streaming

## Acceptance criteria

- RAG works with AI SDK 7 without system-message validation errors.
- Azure OpenAI Chat Completions works with the documented adapter.
- `AiChat` renders only the answer content.
- JSON and text-stream response modes are clearly separated.
- Structured errors are available to the UI.
- RAG source citations can be rendered by the UI.
- README and Azure Functions examples document the complete setup.
