export interface AiChatButtonProps {
  readonly isOpen: boolean;
  readonly onClick: () => void;
  readonly label?: string;
  readonly closeLabel?: string;
  readonly controls?: string;
}

/** Fixed-position launcher for a chat panel. */
export const AiChatButton = ({
  isOpen,
  onClick,
  label = 'Open AI chat',
  closeLabel = 'Close AI chat',
  controls = 'docusaurus-ai-chat-panel',
}: AiChatButtonProps) => (
  <button
    className="docusaurus-ai__launcher"
    type="button"
    aria-label={isOpen ? closeLabel : label}
    aria-expanded={isOpen}
    aria-controls={controls}
    onClick={onClick}
  >
    <span aria-hidden="true">{isOpen ? '×' : '✦'}</span>
  </button>
);
