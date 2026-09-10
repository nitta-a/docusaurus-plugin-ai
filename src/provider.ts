/** A message sent to an AI provider. */
export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** A searchable document generated from a Docusaurus docs directory. */
export interface AIDocument {
  id: string;
  title: string;
  content: string;
  url: string;
  description?: string;
}

/** The common request shape shared by all AI provider implementations. */
export interface AIGenerateInput {
  messages: readonly AIMessage[];
}

/** Token usage reported by a provider when available. */
export interface AIUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

/** The normalized response returned by an AI provider. */
export interface AIResponse {
  content: string;
  model?: string;
  usage?: AIUsage;
}

/**
 * Vendor-neutral contract for generating an answer.
 *
 * Implementations for OpenAI, Azure OpenAI, Bedrock, or a custom backend can
 * be added without changing the Docusaurus-facing API.
 */
export interface AIProvider {
  generate(input: AIGenerateInput): Promise<AIResponse>;
}
