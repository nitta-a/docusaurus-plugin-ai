import type { FormEvent } from 'react';
import { useState } from 'react';
import type { AIMessage, AIProvider } from './provider.js';

export interface AIChatProps {
  provider: AIProvider;
  title?: string;
  description?: string;
  placeholder?: string;
}

interface ChatMessage extends AIMessage {
  id: number;
}

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
      const response = await provider.generate({
        messages: [...messages, userMessage].map(({ role, content: messageContent }) => ({
          role,
          content: messageContent,
        })),
      });
      setMessages((current) => [...current, { id: Date.now() + 1, role: 'assistant', content: response.content }]);
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
