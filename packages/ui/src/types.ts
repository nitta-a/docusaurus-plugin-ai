/** The roles rendered by the chat UI. */
export type AiChatRole = 'user' | 'assistant';

/** A provider-neutral message displayed by the chat UI. */
export interface AiChatMessage {
  readonly id: string;
  readonly role: AiChatRole;
  readonly content: string;
  readonly sources?: readonly AiChatSource[];
}

/** Compact RAG citation associated with one assistant response. */
export interface AiChatSource {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly snippet?: string;
}

/** Structured error payload accepted from an application-owned AI endpoint. */
export interface AIErrorResponse {
  readonly error: string;
  readonly code?: string;
  readonly detail?: string;
  readonly status?: number;
  readonly traceId?: string;
  readonly sources?: readonly AiChatSource[];
}

export const AI_SOURCES_HEADER = 'x-docusaurus-ai-sources';

/** JSON-serializable page or application context sent to the chat endpoint. */
export type AiChatContext = Readonly<Record<string, unknown>>;
