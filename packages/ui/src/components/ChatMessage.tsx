import type { AiChatMessage } from '../types.js';

export interface ChatMessageProps {
  readonly message: AiChatMessage;
  readonly userLabel?: string;
  readonly assistantLabel?: string;
}

/** Render one user or assistant message without coupling to a markdown renderer. */
export const ChatMessage = ({ message, userLabel = 'You', assistantLabel = 'AI' }: ChatMessageProps) => (
  <article className={`docusaurus-ai__message docusaurus-ai__message--${message.role}`}>
    <strong className="docusaurus-ai__message-role">{message.role === 'user' ? userLabel : assistantLabel}</strong>
    <div className="docusaurus-ai__message-content">{message.content || ' '}</div>
  </article>
);
