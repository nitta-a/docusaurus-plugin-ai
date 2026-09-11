import type { FormEvent } from 'react';
import { useState } from 'react';
import type { AITextStream, LLMProvider, ChatMessage as ProviderMessage, SourceReference } from './core/types.js';

export interface AIChatProps {
  provider: LLMProvider;
  title?: string;
  description?: string;
  placeholder?: string;
}

interface ChatMessage extends ProviderMessage {
  id: number;
  sources?: readonly SourceReference[];
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

/** A small accessible, unstyled chat surface for embedding in Docusaurus. */
export const AIChat = ({
  provider,
  title = 'Ask the documentation',
  description = 'Ask a question and the configured provider will answer it.',
  placeholder = 'How do I get started?',
}: AIChatProps) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

        let content = '';
        for await (const delta of toAsyncIterable(response.stream)) {
          content += delta;
          setMessages((current) =>
            current.map((message) => (message.id === assistantId ? { ...message, content } : message)),
          );
        }
      } else {
        const response = await provider.generate(requestMessages);
        setMessages((current) => [
          ...current,
          { id: Date.now() + 1, role: 'assistant', content: response.content, sources: response.sources },
        ]);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : '回答の取得に失敗しました。');
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
            {message.sources && message.sources.length > 0 ? (
              <aside aria-label="参照元">
                <strong>参照元</strong>
                <ul>
                  {message.sources.map((source) => (
                    <li key={source.id}>
                      <a href={source.url}>{source.title}</a>
                      <p>{source.snippet}</p>
                    </li>
                  ))}
                </ul>
              </aside>
            ) : null}
          </article>
        ))}
        {isLoading ? <p role="status">回答を生成しています…</p> : null}
      </div>
      {error ? <p role="alert">{error}</p> : null}
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
