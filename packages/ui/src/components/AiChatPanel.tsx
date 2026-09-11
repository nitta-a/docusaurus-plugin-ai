import type { AiChatMessage } from '../types.js';
import { ChatInput } from './ChatInput.js';
import { ChatMessage } from './ChatMessage.js';

export interface AiChatPanelProps {
  readonly messages: readonly AiChatMessage[];
  readonly input: string;
  readonly onInputChange: (value: string) => void;
  readonly onSubmit: () => void | Promise<void>;
  readonly onClose: () => void;
  readonly isLoading: boolean;
  readonly error?: string;
  readonly title?: string;
  readonly description?: string;
  readonly placeholder?: string;
  readonly sendLabel?: string;
  readonly userLabel?: string;
  readonly assistantLabel?: string;
}

/** The open chat surface; state and transport remain owned by AiChat. */
export const AiChatPanel = ({
  messages,
  input,
  onInputChange,
  onSubmit,
  onClose,
  isLoading,
  error,
  title = 'Ask AI',
  description,
  placeholder,
  sendLabel,
  userLabel,
  assistantLabel,
}: AiChatPanelProps) => (
  <section
    id="docusaurus-ai-chat-panel"
    className="docusaurus-ai__panel"
    role="dialog"
    aria-modal="false"
    aria-labelledby="docusaurus-ai-chat-title"
  >
    <header className="docusaurus-ai__header">
      <div>
        <h2 id="docusaurus-ai-chat-title">{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      <button className="docusaurus-ai__close" type="button" onClick={onClose} aria-label="Close AI chat">
        ×
      </button>
    </header>
    <div className="docusaurus-ai__messages" aria-live="polite" aria-busy={isLoading}>
      {messages.length === 0 ? <p className="docusaurus-ai__empty">Ask a question about this documentation.</p> : null}
      {messages.map((message) => (
        <ChatMessage key={message.id} message={message} userLabel={userLabel} assistantLabel={assistantLabel} />
      ))}
      {isLoading ? (
        <p className="docusaurus-ai__status" role="status">
          Thinking…
        </p>
      ) : null}
    </div>
    {error ? (
      <p className="docusaurus-ai__error" role="alert">
        {error}
      </p>
    ) : null}
    <ChatInput
      value={input}
      onChange={onInputChange}
      onSubmit={onSubmit}
      placeholder={placeholder}
      submitLabel={sendLabel}
      disabled={isLoading}
    />
  </section>
);
