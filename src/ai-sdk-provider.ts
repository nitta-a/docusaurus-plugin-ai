import { generateText } from 'ai';
import type { AIMessage, AIProvider, AIResponse, AIUsage } from './provider.js';

/**
 * Creates a provider-specific model without exposing the Vercel AI SDK model
 * type in this package's public API.
 *
 * Azure OpenAI, Bedrock, and other AI SDK providers can use this same adapter
 * by supplying their own model factory.
 */
export type AIModelFactory = (modelId: string) => unknown;

export interface VercelAIProviderOptions {
  /** Model/deployment identifier passed to the provider factory. */
  model: string;
  /** Provider SDK model factory, kept opaque at this package boundary. */
  createModel: AIModelFactory;
  system?: string;
  maxOutputTokens?: number;
  temperature?: number;
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const normalizeUsage = (usage: unknown): AIUsage | undefined => {
  if (!usage || typeof usage !== 'object') return undefined;
  const values = usage as Record<string, unknown>;
  const promptTokens = isFiniteNumber(values.inputTokens) ? values.inputTokens : values.promptTokens;
  const completionTokens = isFiniteNumber(values.outputTokens) ? values.outputTokens : values.completionTokens;
  const totalTokens = isFiniteNumber(values.totalTokens) ? values.totalTokens : undefined;

  if (!isFiniteNumber(promptTokens) && !isFiniteNumber(completionTokens) && !isFiniteNumber(totalTokens)) {
    return undefined;
  }

  return {
    ...(isFiniteNumber(promptTokens) ? { promptTokens } : {}),
    ...(isFiniteNumber(completionTokens) ? { completionTokens } : {}),
    ...(isFiniteNumber(totalTokens) ? { totalTokens } : {}),
  };
};

const toModelMessages = (messages: readonly AIMessage[]) => messages.map(({ role, content }) => ({ role, content }));

/**
 * Adapt a Vercel AI SDK language model to the vendor-neutral AIProvider
 * contract. The SDK's model type is intentionally used only inside this file.
 */
export const createVercelAIProvider = ({
  model,
  createModel,
  system,
  maxOutputTokens,
  temperature,
}: VercelAIProviderOptions): AIProvider => ({
  async generate({ messages }): Promise<AIResponse> {
    const result = await generateText({
      model: createModel(model) as Parameters<typeof generateText>[0]['model'],
      messages: toModelMessages(messages),
      ...(system === undefined ? {} : { system }),
      ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
      ...(temperature === undefined ? {} : { temperature }),
    });

    const usage = normalizeUsage(result.usage);
    return {
      content: result.text,
      model,
      ...(usage ? { usage } : {}),
    };
  },
});
