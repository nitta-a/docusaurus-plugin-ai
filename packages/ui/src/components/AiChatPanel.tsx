import type { AIErrorResponse, AiChatMessage } from '../types.js';
import { ChatInput } from './ChatInput.js';
import { ChatMessage } from './ChatMessage.js';

export interface AiChatPanelProps {
  readonly messages: readonly AiChatMessage[];
  readonly input: string;
  readonly onInputChange: (value: string) => void;
  readonly onSubmit: () => void | Promise<void>;
  readonly onClose: () => void;
  readonly isLoading: boolean;
  readonly error?: AIErrorResponse;
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
    {error ? <AiChatError error={error} /> : null}
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

const copyTraceId = async (traceId: string): Promise<void> => {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return;
  await navigator.clipboard.writeText(traceId);
};

const AiChatError = ({ error }: { readonly error: AIErrorResponse }) => (
  <div className="docusaurus-ai__error" role="alert">
    <p>{error.error}</p>
    {error.code ? <p data-error-code={`error-code-${error.code}`}>Code: {error.code}</p> : null}
    {error.detail ? <p>Details: {error.detail}</p> : null}
    {error.status ? <p>Status: {error.status}</p> : null}
    {error.traceId ? (
      <p>
        Trace ID: <code>{error.traceId}</code>{' '}
        <button type="button" onClick={() => void copyTraceId(error.traceId ?? '')}>
          Copy
        </button>
      </p>
    ) : null}
  </div>
);
