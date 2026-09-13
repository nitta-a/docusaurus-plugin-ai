import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createVercelAIProvider, type VercelAIProviderOptions } from './ai-sdk-provider.js';
import type { LLMProvider } from './core/types.js';

export interface GoogleProviderOptions extends Omit<VercelAIProviderOptions, 'createModel'> {
  apiKey?: string;
  baseURL?: string;
  headers?: Record<string, string>;
}

/**
 * Create a Google Gemini-backed provider using the Vercel AI SDK.
 * When apiKey is omitted, the SDK reads GOOGLE_GENERATIVE_AI_API_KEY.
 */
export const createGoogleProvider = ({
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
}: GoogleProviderOptions): LLMProvider => {
  const google = createGoogleGenerativeAI({
    ...(apiKey === undefined ? {} : { apiKey }),
    ...(baseURL === undefined ? {} : { baseURL }),
    ...(headers === undefined ? {} : { headers }),
  });

  return createVercelAIProvider({
    model,
    createModel: (modelId) => google(modelId),
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
