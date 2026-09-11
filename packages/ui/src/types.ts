/** The roles rendered by the chat UI. */
export type AiChatRole = 'user' | 'assistant';

/** A provider-neutral message displayed by the chat UI. */
export interface AiChatMessage {
  readonly id: string;
  readonly role: AiChatRole;
  readonly content: string;
}

/** JSON-serializable page or application context sent to the chat endpoint. */
export type AiChatContext = Readonly<Record<string, unknown>>;
