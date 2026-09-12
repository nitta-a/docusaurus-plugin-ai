import { useState } from 'react';
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
  readonly defaultMaximized?: boolean;
  readonly maximized?: boolean;
  readonly onMaximizedChange?: (maximized: boolean) => void;
  readonly maximizeLabel?: string;
  readonly restoreLabel?: string;
  readonly copyLabel?: string;
  readonly copiedLabel?: string;
  readonly copyErrorLabel?: string;
  readonly onCopy?: (message: AiChatMessage) => void | Promise<void>;
  readonly title?: string;
  readonly description?: string;
  readonly placeholder?: string;
  readonly sendLabel?: string;
  readonly userLabel?: string;
  readonly assistantLabel?: string;
}

/** The open chat surface; chat state and transport remain owned by AiChat. */
export const AiChatPanel = ({
  messages,
  input,
  onInputChange,
  onSubmit,
  onClose,
  isLoading,
  error,
  defaultMaximized,
  maximized: controlledMaximized,
  onMaximizedChange,
  maximizeLabel,
  restoreLabel,
  copyLabel,
  copiedLabel,
  copyErrorLabel,
  onCopy,
  title = 'Ask AI',
  description,
  placeholder,
  sendLabel,
  userLabel,
  assistantLabel,
}: AiChatPanelProps) => {
  const [uncontrolledMaximized, setUncontrolledMaximized] = useState(defaultMaximized ?? false);
  const isMaximized = controlledMaximized ?? uncontrolledMaximized;

  const setMaximized = (nextMaximized: boolean) => {
    if (controlledMaximized === undefined) setUncontrolledMaximized(nextMaximized);
    onMaximizedChange?.(nextMaximized);
  };

  const resolvedMaximizeLabel = maximizeLabel ?? 'Maximize chat';
  const resolvedRestoreLabel = restoreLabel ?? 'Restore chat size';

  return (
    <section
      id="docusaurus-ai-chat-panel"
      className={`docusaurus-ai__panel${isMaximized ? ' docusaurus-ai__panel--maximized' : ''}`}
      role="dialog"
      aria-modal="false"
      aria-labelledby="docusaurus-ai-chat-title"
    >
      <header className="docusaurus-ai__header">
        <div>
          <h2 id="docusaurus-ai-chat-title">{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        <div className="docusaurus-ai__header-actions">
          <button
            className="docusaurus-ai__maximize"
            type="button"
            onClick={() => setMaximized(!isMaximized)}
            aria-label={isMaximized ? resolvedRestoreLabel : resolvedMaximizeLabel}
            aria-pressed={isMaximized}
            title={isMaximized ? resolvedRestoreLabel : resolvedMaximizeLabel}
          >
            <span aria-hidden="true">{isMaximized ? '↙' : '⛶'}</span>
          </button>
          <button className="docusaurus-ai__close" type="button" onClick={onClose} aria-label="Close AI chat">
            ×
          </button>
        </div>
      </header>
      <div className="docusaurus-ai__messages" aria-live="polite" aria-busy={isLoading}>
        {messages.length === 0 ? (
          <p className="docusaurus-ai__empty">Ask a question about this documentation.</p>
        ) : null}
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            userLabel={userLabel}
            assistantLabel={assistantLabel}
            copyLabel={copyLabel}
            copiedLabel={copiedLabel}
            copyErrorLabel={copyErrorLabel}
            onCopy={onCopy}
          />
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
};

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
