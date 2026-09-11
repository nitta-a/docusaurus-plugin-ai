import { type UIMessage, useChat } from '@ai-sdk/react';
import { TextStreamChatTransport } from 'ai';
import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { AiChatButton } from './components/AiChatButton.js';
import { AiChatPanel } from './components/AiChatPanel.js';
import type { AiChatContext, AiChatMessage } from './types.js';

export interface AiChatProps {
  /** Application-owned endpoint that returns a Vercel AI SDK text stream. */
  readonly endpoint: string;
  /** Optional page/application context sent alongside the messages. */
  readonly context?: AiChatContext;
  readonly headers?: HeadersInit;
  readonly credentials?: RequestCredentials;
  readonly defaultOpen?: boolean;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly title?: string;
  readonly description?: string;
  readonly placeholder?: string;
  readonly sendLabel?: string;
  readonly launcherLabel?: string;
}

const messageText = (message: Pick<UIMessage, 'parts'>) =>
  message.parts
    ?.filter((part) => part.type === 'text')
    .map((part) => part.text ?? '')
    .join('') ?? '';

const toDisplayMessage = (message: UIMessage): AiChatMessage | null => {
  if (message.role !== 'user' && message.role !== 'assistant') return null;
  return { id: message.id, role: message.role, content: messageText(message) };
};

/** Provider-neutral, streaming React chat surface for Docusaurus or any React site. */
export const AiChat = ({
  endpoint,
  context,
  headers,
  credentials,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  title,
  description,
  placeholder,
  sendLabel,
  launcherLabel,
}: AiChatProps) => {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const [input, setInput] = useState('');
  const isControlled = controlledOpen !== undefined;
  const isOpen = controlledOpen ?? uncontrolledOpen;

  const transportHeaders = useMemo(
    () => (headers === undefined ? undefined : Object.fromEntries(new Headers(headers).entries())),
    [headers],
  );
  const transport = useMemo(
    () =>
      new TextStreamChatTransport({
        api: endpoint,
        headers: transportHeaders,
        credentials,
        prepareSendMessagesRequest: ({ messages }) => ({
          body: {
            messages: messages
              .map((message) => ({
                role: message.role,
                content: messageText(message),
              }))
              .filter((message) => message.role === 'user' || message.role === 'assistant'),
            ...(context === undefined ? {} : { context }),
          },
        }),
      }),
    [context, credentials, endpoint, transportHeaders],
  );
  const { messages, sendMessage, status, error } = useChat({ transport });
  const displayMessages = messages
    .map(toDisplayMessage)
    .filter((message): message is AiChatMessage => message !== null);
  const isLoading = status === 'submitted' || status === 'streaming';

  const setOpen = (nextOpen: boolean) => {
    if (!isControlled) setUncontrolledOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    await sendMessage({ text });
  };

  return (
    <div className="docusaurus-ai">
      {isOpen ? (
        <AiChatPanel
          messages={displayMessages}
          input={input}
          onInputChange={setInput}
          onSubmit={submit}
          onClose={() => setOpen(false)}
          isLoading={isLoading}
          error={error?.message}
          title={title}
          description={description}
          placeholder={placeholder}
          sendLabel={sendLabel}
        />
      ) : null}
      <AiChatButton isOpen={isOpen} onClick={() => setOpen(!isOpen)} label={launcherLabel} />
    </div>
  );
};
