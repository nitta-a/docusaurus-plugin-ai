type ChatMessage = {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
};

type GenerationOptions = {
  readonly temperature?: number;
  readonly maxTokens?: number;
};

export interface ValidatedAIRequest {
  readonly messages: readonly ChatMessage[];
  readonly options: GenerationOptions;
}

export interface ValidationConstraints {
  readonly maxTokensLimit: number;
  readonly maxMessagesCount: number;
  readonly maxMessageLength: number;
  readonly maxTotalMessageLength: number;
  readonly defaultMaxTokens: number;
  readonly defaultTemperature: number;
}

export const DEFAULT_CONSTRAINTS: ValidationConstraints = {
  maxTokensLimit: 2000,
  maxMessagesCount: 20,
  maxMessageLength: 8000,
  maxTotalMessageLength: 20000,
  defaultMaxTokens: 800,
  defaultTemperature: 0.2,
};

export class AIRequestValidationError extends Error {
  public override readonly name = 'AIRequestValidationError';
}

const invalid = (message: string): AIRequestValidationError =>
  new AIRequestValidationError(`Invalid request: ${message}`);

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** Validate and normalize the public `{ messages, options }` HTTP envelope. */
export const validateAIRequest = (
  body: unknown,
  constraints: ValidationConstraints = DEFAULT_CONSTRAINTS,
): ValidatedAIRequest => {
  if (!isRecord(body)) throw invalid('request body must be a JSON object.');

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    throw invalid('messages array is required and must not be empty.');
  }
  if (messages.length > constraints.maxMessagesCount) {
    throw invalid(`messages exceed limit of ${constraints.maxMessagesCount}.`);
  }

  const validatedMessages: ChatMessage[] = [];
  let totalMessageLength = 0;
  for (const [index, value] of messages.entries()) {
    if (!isRecord(value)) throw invalid(`message at index ${index} is invalid.`);
    const role = value.role;
    const content = value.content;
    if (role !== 'user' && role !== 'assistant' && role !== 'system') {
      throw invalid(`message at index ${index} has an unsupported role: ${String(role)}.`);
    }
    if (typeof content !== 'string' || content.trim().length === 0) {
      throw invalid(`message at index ${index} has empty or non-string content.`);
    }
    if (content.length > constraints.maxMessageLength) {
      throw invalid(`message at index ${index} exceeds length limit of ${constraints.maxMessageLength} characters.`);
    }
    totalMessageLength += content.length;
    if (totalMessageLength > constraints.maxTotalMessageLength) {
      throw invalid(`total message content exceeds limit of ${constraints.maxTotalMessageLength} characters.`);
    }
    validatedMessages.push({ role, content });
  }

  const options = body.options;
  if (options !== undefined && !isRecord(options)) throw invalid('options must be an object.');
  // Accept the documented envelope and the flat shape from the initial guard
  // proposal so existing callers can migrate without bypassing the limits.
  const rawOptions = options === undefined ? body : (options as Record<string, unknown>);
  const maxTokens = rawOptions?.maxTokens;
  const temperature = rawOptions?.temperature;

  if (
    maxTokens !== undefined &&
    (typeof maxTokens !== 'number' ||
      !Number.isInteger(maxTokens) ||
      maxTokens < 1 ||
      maxTokens > constraints.maxTokensLimit)
  ) {
    throw invalid(`options.maxTokens must be an integer between 1 and ${constraints.maxTokensLimit}.`);
  }
  if (
    temperature !== undefined &&
    (typeof temperature !== 'number' || !Number.isFinite(temperature) || temperature < 0 || temperature > 2)
  ) {
    throw invalid('options.temperature must be a finite number between 0 and 2.');
  }

  const validatedMaxTokens = maxTokens === undefined ? constraints.defaultMaxTokens : (maxTokens as number);
  const validatedTemperature = temperature === undefined ? constraints.defaultTemperature : temperature;
  const validatedOptions: GenerationOptions = {
    maxTokens: validatedMaxTokens,
    temperature: validatedTemperature,
  };
  return {
    messages: validatedMessages,
    options: validatedOptions,
  };
};
