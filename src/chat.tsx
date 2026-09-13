import type { FormEvent } from 'react';
import { useRef, useState } from 'react';
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
  readonly stopLabel?: string;
  readonly clearLabel?: string;
  readonly retryLabel?: string;
  readonly regenerateLabel?: string;
}

interface ChatMessage extends ProviderMessage {
  readonly id: number;
  readonly sources?: readonly SourceReference[];
}

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
export const consumeAIStream = async (
  stream: AITextStream,
  onText: (content: string) => void,
  signal?: AbortSignal,
): Promise<string> => {
  if (signal?.aborted) return '';

  if (typeof (stream as AsyncIterable<string>)[Symbol.asyncIterator] === 'function') {
    let content = '';
    for await (const delta of stream as AsyncIterable<string>) {
      if (signal?.aborted) return content;
      content += delta;
      onText(content);
    }
    return content;
  }

  const reader = (stream as ReadableStream<string>).getReader();
  const cancel = () => void reader.cancel();
  signal?.addEventListener('abort', cancel, { once: true });
  let content = '';
  try {
    while (true) {
      if (signal?.aborted) return content;
      const result = await reader.read();
      if (result.done) return content;
      content += result.value;
      onText(content);
    }
  } finally {
    signal?.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
};

const isAbortError = (value: unknown): boolean =>
  value instanceof Error && (value.name === 'AbortError' || value.message.toLowerCase().includes('aborted'));

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
  stopLabel = '生成を停止',
  clearLabel = '会話をクリア',
  retryLabel = '再試行',
  regenerateLabel = '回答を再生成',
}: AIChatProps) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<AIErrorResponse | null>(null);
  const activeController = useRef<AbortController | null>(null);

  const run = async (requestMessages: readonly ProviderMessage[]) => {
    const controller = new AbortController();
    activeController.current = controller;
    setIsLoading(true);
    setError(null);

    try {
      if (provider.stream) {
        const assistantId = Date.now() + 1;
        const response = await provider.stream(requestMessages, { signal: controller.signal });
        setMessages((current) => [
          ...current,
          { id: assistantId, role: 'assistant', content: '', sources: response.sources },
        ]);

        await consumeAIStream(
          response.stream,
          (content) => {
            setMessages((current) =>
              current.map((message) => (message.id === assistantId ? { ...message, content } : message)),
            );
          },
          controller.signal,
        );
      } else {
        const response = await provider.generate(requestMessages, { signal: controller.signal });
        if (!controller.signal.aborted) {
          setMessages((current) => [
            ...current,
            { id: Date.now() + 1, role: 'assistant', content: response.content, sources: response.sources },
          ]);
        }
      }
    } catch (caughtError) {
      if (controller.signal.aborted || isAbortError(caughtError)) return;
      const structuredError = toAIErrorResponse(caughtError);
      setError(structuredError);
      onError?.(structuredError, caughtError);
    } finally {
      if (activeController.current === controller) {
        activeController.current = null;
        setIsLoading(false);
      }
    }
  };

  const stop = () => activeController.current?.abort();

  const clear = () => {
    stop();
    activeController.current = null;
    setMessages([]);
    setInput('');
    setError(null);
    setIsLoading(false);
  };

  const retry = () => {
    if (isLoading) return;
    let lastUserIndex = -1;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === 'user') {
        lastUserIndex = index;
        break;
      }
    }
    if (lastUserIndex < 0) return;
    const requestMessages = messages.slice(0, lastUserIndex + 1).map(({ role, content }) => ({ role, content }));
    setMessages(messages.slice(0, lastUserIndex + 1));
    void run(requestMessages);
  };

  const regenerate = (assistantId: number) => {
    if (isLoading) return;
    const assistantIndex = messages.findIndex((message) => message.id === assistantId && message.role === 'assistant');
    if (assistantIndex < 0) return;
    const requestMessages = messages.slice(0, assistantIndex).map(({ role, content }) => ({ role, content }));
    setMessages(messages.slice(0, assistantIndex));
    void run(requestMessages);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = input.trim();
    if (!content || isLoading) return;

    const userMessage: ChatMessage = { id: Date.now(), role: 'user', content };
    setMessages((current) => [...current, userMessage]);
    setInput('');
    const requestMessages = [...messages, userMessage].map(({ role, content: messageContent }) => ({
      role,
      content: messageContent,
    }));
    await run(requestMessages);
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
            {message.role === 'assistant' ? (
              <button type="button" onClick={() => regenerate(message.id)} disabled={isLoading}>
                {regenerateLabel}
              </button>
            ) : null}
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
          <button type="button" onClick={retry}>
            {retryLabel}
          </button>
        </div>
      ) : null}
      <div>
        <button type="button" onClick={clear} disabled={messages.length === 0 && !error}>
          {clearLabel}
        </button>
        {isLoading ? (
          <button type="button" onClick={stop}>
            {stopLabel}
          </button>
        ) : null}
      </div>
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
