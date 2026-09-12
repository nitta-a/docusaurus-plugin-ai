import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AiChatMessage, AiChatSource } from '../types.js';

export interface ChatMessageProps {
  readonly message: AiChatMessage;
  readonly userLabel?: string;
  readonly assistantLabel?: string;
  readonly copyLabel?: string;
  readonly copiedLabel?: string;
  readonly copyErrorLabel?: string;
  readonly renderMarkdown?: boolean;
  readonly onCopy?: (message: AiChatMessage) => void | Promise<void>;
}

type CopyStatus = 'idle' | 'copied' | 'error';

const copyText = async (content: string): Promise<void> => {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(content);
      return;
    } catch {
      // Fall through to the legacy selection-based implementation.
    }
  }

  if (typeof document === 'undefined' || !document.body) throw new Error('Clipboard is unavailable.');
  const textarea = document.createElement('textarea');
  textarea.value = content;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('Clipboard is unavailable.');
};

const AiChatSources = ({ sources }: { readonly sources: readonly AiChatSource[] }) => (
  <aside className="docusaurus-ai__sources" aria-label="Sources">
    <strong>Sources</strong>
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

/** Render one user or assistant message without coupling to a markdown renderer. */
export const ChatMessage = ({
  message,
  userLabel = 'You',
  assistantLabel = 'AI',
  copyLabel = 'Copy answer',
  copiedLabel = 'Copied',
  copyErrorLabel = 'Copy failed',
  renderMarkdown = true,
  onCopy,
}: ChatMessageProps) => {
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');

  useEffect(() => {
    if (copyStatus !== 'copied') return undefined;
    const timeout = window.setTimeout(() => setCopyStatus('idle'), 2000);
    return () => window.clearTimeout(timeout);
  }, [copyStatus]);

  const handleCopy = async () => {
    try {
      await copyText(message.content);
      await onCopy?.(message);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('error');
    }
  };

  return (
    <article className={`docusaurus-ai__message docusaurus-ai__message--${message.role}`}>
      <strong className="docusaurus-ai__message-role">{message.role === 'user' ? userLabel : assistantLabel}</strong>
      <div
        className={`docusaurus-ai__message-content${message.role === 'assistant' && renderMarkdown ? ' docusaurus-ai__markdown' : ''}`}
      >
        {message.role === 'assistant' && renderMarkdown ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content || ' '}</ReactMarkdown>
        ) : (
          message.content || ' '
        )}
      </div>
      {message.role === 'assistant' ? (
        <div className="docusaurus-ai__message-actions">
          <button
            className="docusaurus-ai__copy"
            type="button"
            onClick={() => void handleCopy()}
            disabled={message.content.length === 0}
            aria-label={copyStatus === 'copied' ? copiedLabel : copyLabel}
          >
            {copyStatus === 'copied' ? copiedLabel : copyStatus === 'error' ? copyErrorLabel : copyLabel}
          </button>
          <span className="docusaurus-ai__sr-only" aria-live="polite">
            {copyStatus === 'copied' ? copiedLabel : copyStatus === 'error' ? copyErrorLabel : ''}
          </span>
        </div>
      ) : null}
      {message.sources && message.sources.length > 0 ? <AiChatSources sources={message.sources} /> : null}
    </article>
  );
};

export { AiChatSources };
