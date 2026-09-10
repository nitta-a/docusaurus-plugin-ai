import { createOpenAI } from '@ai-sdk/openai';
import { createVercelAIProvider, type VercelAIProviderOptions } from './ai-sdk-provider.js';
import type { AIProvider } from './provider.js';

export interface OpenAIProviderOptions extends Omit<VercelAIProviderOptions, 'createModel'> {
  apiKey?: string;
  baseURL?: string;
  organization?: string;
  project?: string;
  headers?: Record<string, string>;
}

/**
 * Create an OpenAI-backed provider using the Vercel AI SDK.
 *
 * When apiKey is omitted, the underlying SDK reads its usual environment
 * configuration. Keep this provider on the server for production Docusaurus
 * deployments so credentials are not bundled into the static site.
 */
export const createOpenAIProvider = ({
  model,
  apiKey,
  baseURL,
  organization,
  project,
  headers,
  system,
  maxOutputTokens,
  temperature,
}: OpenAIProviderOptions): AIProvider => {
  const openai = createOpenAI({
    ...(apiKey === undefined ? {} : { apiKey }),
    ...(baseURL === undefined ? {} : { baseURL }),
    ...(organization === undefined ? {} : { organization }),
    ...(project === undefined ? {} : { project }),
    ...(headers === undefined ? {} : { headers }),
  });

  return createVercelAIProvider({
    model,
    createModel: (modelId) => openai(modelId),
    ...(system === undefined ? {} : { system }),
    ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
    ...(temperature === undefined ? {} : { temperature }),
  });
};
