import type { ChangeEvent, FormEvent, KeyboardEvent } from 'react';
import { useRef } from 'react';

export interface ChatInputProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSubmit: () => void | Promise<void>;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly label?: string;
  readonly submitLabel?: string;
  readonly onStop?: () => void;
  readonly stopLabel?: string;
}

/** Accessible chat form. Enter submits; Shift+Enter keeps a newline. */
export const ChatInput = ({
  value,
  onChange,
  onSubmit,
  placeholder = 'Ask a question…',
  disabled = false,
  label = 'Question',
  submitLabel = 'Send',
  onStop,
  stopLabel = 'Stop generating',
}: ChatInputProps) => {
  const formRef = useRef<HTMLFormElement>(null);
  const inputId = 'docusaurus-ai-chat-input';

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!disabled && value.trim()) void onSubmit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  };

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value);

  return (
    <form ref={formRef} className="docusaurus-ai__input-form" onSubmit={submit}>
      <label className="docusaurus-ai__sr-only" htmlFor={inputId}>
        {label}
      </label>
      <textarea
        id={inputId}
        className="docusaurus-ai__textarea"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={2}
        autoComplete="off"
      />
      {onStop ? (
        <button
          className="docusaurus-ai__stop"
          type="button"
          onClick={onStop}
          disabled={!disabled}
          aria-label={stopLabel}
        >
          {stopLabel}
        </button>
      ) : (
        <button
          className="docusaurus-ai__submit"
          type="submit"
          disabled={disabled || value.trim().length === 0}
          aria-label={submitLabel}
        >
          {submitLabel}
        </button>
      )}
    </form>
  );
};
