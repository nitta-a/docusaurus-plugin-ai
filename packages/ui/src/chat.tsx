import { type UIMessage, useChat } from '@ai-sdk/react';
import { TextStreamChatTransport } from 'ai';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AiChatButton } from './components/AiChatButton.js';
import { AiChatPanel } from './components/AiChatPanel.js';
import {
  AI_SOURCES_HEADER,
  type AIErrorResponse,
  type AiChatContext,
  type AiChatMessage,
  type AiChatSource,
} from './types.js';

export interface AiChatProps {
  /** Application-owned endpoint that returns a Vercel AI SDK text stream. */
  readonly endpoint: string;
  /** Optional page/application context sent alongside the messages. */
  readonly context?: AiChatContext;
  readonly headers?: HeadersInit;
  /** Defaults to text/plain; application/json is also normalized to content for this text-stream UI. */
  readonly accept?: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly credentials?: RequestCredentials;
  readonly defaultOpen?: boolean;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly title?: string;
  readonly description?: string;
  readonly placeholder?: string;
  readonly sendLabel?: string;
  readonly launcherLabel?: string;
  readonly onError?: (error: AIErrorResponse, cause: unknown) => void;
  readonly defaultMaximized?: boolean;
  readonly maximized?: boolean;
  readonly onMaximizedChange?: (maximized: boolean) => void;
  readonly maximizeLabel?: string;
  readonly restoreLabel?: string;
  readonly copyLabel?: string;
  readonly copiedLabel?: string;
  readonly copyErrorLabel?: string;
  /** Render assistant answers as safe Markdown with GFM extensions by default. */
  readonly renderMarkdown?: boolean;
  readonly onCopy?: (message: AiChatMessage) => void | Promise<void>;
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

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isSource = (value: unknown): value is AiChatSource =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.title === 'string' &&
  typeof value.url === 'string' &&
  (value.snippet === undefined || typeof value.snippet === 'string');
const parseSources = (value: unknown): readonly AiChatSource[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const sources = value.filter(isSource);
  return sources.length === value.length ? sources : undefined;
};
const parseError = (value: unknown, status?: number): AIErrorResponse => {
  if (isRecord(value) && typeof value.error === 'string') {
    return {
      error: value.error,
      ...(typeof value.code === 'string' ? { code: value.code } : {}),
      ...(typeof value.detail === 'string' ? { detail: value.detail } : {}),
      ...(typeof value.status === 'number' ? { status: value.status } : status === undefined ? {} : { status }),
      ...(typeof value.traceId === 'string' ? { traceId: value.traceId } : {}),
      ...(parseSources(value.sources) ? { sources: parseSources(value.sources) } : {}),
    };
  }
  return {
    error: value instanceof Error ? value.message : 'AI request failed.',
    ...(status === undefined ? {} : { status }),
  };
};
const parseErrorText = (text: string, status: number): AIErrorResponse => {
  try {
    return parseError(JSON.parse(text) as unknown, status);
  } catch {
    return parseError(text, status);
  }
};

class AiChatRequestError extends Error {
  readonly response: AIErrorResponse;

  constructor(response: AIErrorResponse) {
    super(response.error);
    this.name = 'AiChatRequestError';
    this.response = response;
  }
}

/** Provider-neutral, streaming React chat surface for Docusaurus or any React site. */
export const AiChat = ({
  endpoint,
  context,
  headers,
  credentials,
  accept = 'text/plain',
  fetch: configuredFetch,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  title,
  description,
  placeholder,
  sendLabel,
  launcherLabel,
  onError,
  defaultMaximized,
  maximized,
  onMaximizedChange,
  maximizeLabel,
  restoreLabel,
  copyLabel,
  copiedLabel,
  copyErrorLabel,
  renderMarkdown,
  onCopy,
}: AiChatProps) => {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const [input, setInput] = useState('');
  const [sourcesByResponse, setSourcesByResponse] = useState<readonly (readonly AiChatSource[] | undefined)[]>([]);
  const responseIndex = useRef(0);
  const isControlled = controlledOpen !== undefined;
  const isOpen = controlledOpen ?? uncontrolledOpen;

  const transportHeaders = useMemo(() => {
    const nextHeaders = new Headers(headers);
    if (!nextHeaders.has('accept')) nextHeaders.set('accept', accept);
    return Object.fromEntries(nextHeaders.entries());
  }, [accept, headers]);
  const captureFetch = useCallback(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const response = await (configuredFetch ?? globalThis.fetch)(input, init);
      if (!response.ok) {
        const body = await response.text();
        throw new AiChatRequestError(parseErrorText(body, response.status));
      }

      const currentResponseIndex = responseIndex.current++;
      let sources = parseSourcesHeader(response.headers.get(AI_SOURCES_HEADER));
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        const payload = (await response.clone().json()) as unknown;
        if (isRecord(payload) && typeof payload.content === 'string') {
          sources = sources ?? parseSources(payload.sources);
          setSourcesByResponse((current) => {
            const next = [...current];
            next[currentResponseIndex] = sources;
            return next;
          });
          const streamHeaders = new Headers(response.headers);
          streamHeaders.set('content-type', 'text/plain; charset=utf-8');
          return new Response(payload.content, { status: response.status, headers: streamHeaders });
        }
      }
      setSourcesByResponse((current) => {
        const next = [...current];
        next[currentResponseIndex] = sources;
        return next;
      });
      return response;
    },
    [configuredFetch],
  );
  const transport = useMemo(
    () =>
      new TextStreamChatTransport({
        api: endpoint,
        headers: transportHeaders,
        credentials,
        fetch: captureFetch,
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
    [captureFetch, context, credentials, endpoint, transportHeaders],
  );
  const { messages, sendMessage, status, error } = useChat({ transport });
  let assistantIndex = 0;
  const displayMessages = messages
    .map((message) => {
      const displayMessage = toDisplayMessage(message);
      if (displayMessage?.role !== 'assistant') return displayMessage;
      const sources = sourcesByResponse[assistantIndex++];
      return { ...displayMessage, ...(sources ? { sources } : {}) };
    })
    .filter((message): message is AiChatMessage => message !== null);
  const isLoading = status === 'submitted' || status === 'streaming';

  const structuredError = useMemo(
    () => (error instanceof AiChatRequestError ? error.response : parseError(error)),
    [error],
  );
  useEffect(() => {
    if (error) onError?.(structuredError, error);
  }, [error, onError, structuredError]);

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
          error={error ? structuredError : undefined}
          defaultMaximized={defaultMaximized}
          maximized={maximized}
          onMaximizedChange={onMaximizedChange}
          maximizeLabel={maximizeLabel}
          restoreLabel={restoreLabel}
          copyLabel={copyLabel}
          copiedLabel={copiedLabel}
          copyErrorLabel={copyErrorLabel}
          renderMarkdown={renderMarkdown}
          onCopy={onCopy}
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

const parseSourcesHeader = (value: string | null): readonly AiChatSource[] | undefined => {
  if (!value) return undefined;
  try {
    return parseSources(JSON.parse(decodeURIComponent(value)) as unknown);
  } catch {
    return undefined;
  }
};
