import type { AiChatMessage, AiChatSource } from '../types.js';

export interface ChatMessageProps {
  readonly message: AiChatMessage;
  readonly userLabel?: string;
  readonly assistantLabel?: string;
}

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
export const ChatMessage = ({ message, userLabel = 'You', assistantLabel = 'AI' }: ChatMessageProps) => (
  <article className={`docusaurus-ai__message docusaurus-ai__message--${message.role}`}>
    <strong className="docusaurus-ai__message-role">{message.role === 'user' ? userLabel : assistantLabel}</strong>
    <div className="docusaurus-ai__message-content">{message.content || ' '}</div>
    {message.sources && message.sources.length > 0 ? <AiChatSources sources={message.sources} /> : null}
  </article>
);

export { AiChatSources };
