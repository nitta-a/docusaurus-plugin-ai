import type { FormEvent } from 'react';
import { useState } from 'react';
import type {
  AIErrorResponse,
  AITextStream,
  LLMProvider,
  ChatMessage as ProviderMessage,
  SourceReference,
} from './core/types.js';

export interface AIChatProps {
  readonly provider: LLMProvider;
  readonly title?: string;
  readonly description?: string;
  readonly placeholder?: string;
  readonly onError?: (error: AIErrorResponse, cause: unknown) => void;
}

interface ChatMessage extends ProviderMessage {
  readonly id: number;
  readonly sources?: readonly SourceReference[];
}

const toAsyncIterable = async function* (stream: AITextStream): AsyncIterable<string> {
  if (typeof (stream as AsyncIterable<string>)[Symbol.asyncIterator] === 'function') {
    yield* stream as AsyncIterable<string>;
    return;
  }

  const reader = (stream as ReadableStream<string>).getReader();
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) return;
      yield result.value;
    }
  } finally {
    reader.releaseLock();
  }
};

const toAIErrorResponse = (value: unknown): AIErrorResponse => {
  if (value && typeof value === 'object' && 'response' in value) {
    const response = (value as { response?: unknown }).response;
    if (response && typeof response === 'object' && 'error' in response && typeof response.error === 'string') {
      return response as AIErrorResponse;
    }
  }
  return { error: value instanceof Error ? value.message : '回答の取得に失敗しました。' };
};

/** Consume text deltas while exposing the accumulated response to a renderer. */
export const consumeAIStream = async (stream: AITextStream, onText: (content: string) => void): Promise<string> => {
  let content = '';
  for await (const delta of toAsyncIterable(stream)) {
    content += delta;
    onText(content);
  }
  return content;
};

interface AIChatSourcesProps {
  readonly sources: readonly SourceReference[];
}

/** Semantic citation list shared by the chat surface and its integrations. */
export const AIChatSources = ({ sources }: AIChatSourcesProps) => (
  <aside aria-label="参照元">
    <strong>参照元</strong>
    <ul>
      {sources.map((source) => (
        <li key={source.id}>
          <a href={source.url}>{source.title}</a>
          {source.snippet ? <p>{source.snippet}</p> : null}
        </li>
      ))}
    </ul>
  </aside>
);

/** A small accessible, unstyled chat surface for embedding in Docusaurus. */
export const AIChat = ({
  provider,
  title = 'Ask the documentation',
  description = 'Ask a question and the configured provider will answer it.',
  placeholder = 'How do I get started?',
  onError,
}: AIChatProps) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<AIErrorResponse | null>(null);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = input.trim();
    if (!content || isLoading) return;

    const userMessage: ChatMessage = { id: Date.now(), role: 'user', content };
    setMessages((current) => [...current, userMessage]);
    setInput('');
    setError(null);
    setIsLoading(true);

    try {
      const requestMessages = [...messages, userMessage].map(({ role, content: messageContent }) => ({
        role,
        content: messageContent,
      }));

      if (provider.stream) {
        const assistantId = Date.now() + 1;
        const response = await provider.stream(requestMessages);
        setMessages((current) => [
          ...current,
          { id: assistantId, role: 'assistant', content: '', sources: response.sources },
        ]);

        await consumeAIStream(response.stream, (content) => {
          setMessages((current) =>
            current.map((message) => (message.id === assistantId ? { ...message, content } : message)),
          );
        });
      } else {
        const response = await provider.generate(requestMessages);
        setMessages((current) => [
          ...current,
          { id: Date.now() + 1, role: 'assistant', content: response.content, sources: response.sources },
        ]);
      }
    } catch (caughtError) {
      const structuredError = toAIErrorResponse(caughtError);
      setError(structuredError);
      onError?.(structuredError, caughtError);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section aria-labelledby="ai-chat-title">
      <h1 id="ai-chat-title">{title}</h1>
      <p>{description}</p>
      <div aria-live="polite">
        {messages.map((message) => (
          <article key={message.id} data-role={message.role}>
            <strong>{message.role === 'user' ? 'You' : 'AI'}</strong>
            <p style={{ whiteSpace: 'pre-wrap' }}>{message.content}</p>
            {message.sources && message.sources.length > 0 ? <AIChatSources sources={message.sources} /> : null}
          </article>
        ))}
        {isLoading ? <p role="status">回答を生成しています…</p> : null}
      </div>
      {error ? (
        <div role="alert">
          <p>{error.error}</p>
          {error.code ? <p>Code: {error.code}</p> : null}
          {error.detail ? <p>Details: {error.detail}</p> : null}
          {error.status ? <p>Status: {error.status}</p> : null}
          {error.traceId ? (
            <p>
              Trace ID: <code>{error.traceId}</code>{' '}
              <button
                type="button"
                onClick={() => {
                  if (typeof navigator !== 'undefined' && navigator.clipboard) {
                    void navigator.clipboard.writeText(error.traceId ?? '');
                  }
                }}
              >
                Copy
              </button>
            </p>
          ) : null}
        </div>
      ) : null}
      <form onSubmit={submit}>
        <label htmlFor="ai-chat-input">質問</label>
        <input
          id="ai-chat-input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={placeholder}
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading || input.trim().length === 0}>
          質問する
        </button>
      </form>
    </section>
  );
};
