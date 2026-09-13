import { createAnthropic } from '@ai-sdk/anthropic';
import { createVercelAIProvider, type VercelAIProviderOptions } from './ai-sdk-provider.js';
import type { LLMProvider } from './core/types.js';

export interface AnthropicProviderOptions extends Omit<VercelAIProviderOptions, 'createModel'> {
  apiKey?: string;
  baseURL?: string;
  headers?: Record<string, string>;
}

/**
 * Create a Claude-backed provider using the Vercel AI SDK.
 * When apiKey is omitted, the SDK reads ANTHROPIC_API_KEY.
 */
export const createAnthropicProvider = ({
  model,
  apiKey,
  baseURL,
  headers,
  system,
  maxOutputTokens,
  temperature,
  topP,
  topK,
  presencePenalty,
  frequencyPenalty,
  stopSequences,
  seed,
  maxRetries,
  timeoutMs,
  providerOptions,
}: AnthropicProviderOptions): LLMProvider => {
  const anthropic = createAnthropic({
    ...(apiKey === undefined ? {} : { apiKey }),
    ...(baseURL === undefined ? {} : { baseURL }),
    ...(headers === undefined ? {} : { headers }),
  });

  return createVercelAIProvider({
    model,
    createModel: (modelId) => anthropic(modelId),
    ...(system === undefined ? {} : { system }),
    ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
    ...(temperature === undefined ? {} : { temperature }),
    ...(topP === undefined ? {} : { topP }),
    ...(topK === undefined ? {} : { topK }),
    ...(presencePenalty === undefined ? {} : { presencePenalty }),
    ...(frequencyPenalty === undefined ? {} : { frequencyPenalty }),
    ...(stopSequences === undefined ? {} : { stopSequences }),
    ...(seed === undefined ? {} : { seed }),
    ...(maxRetries === undefined ? {} : { maxRetries }),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    ...(providerOptions === undefined ? {} : { providerOptions }),
  });
};
