import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { createVercelAIProvider, type LLMProvider } from '@docusaurus-plugin-ai/core';

export interface BedrockConfig {
  readonly region: string;
  readonly model: string;
}

/**
 * Creates a Bedrock-backed provider using the AWS SDK default credential chain.
 * In Lambda this resolves to the function execution role; local development
 * can use AWS_PROFILE, AWS SSO, or another standard AWS credential source.
 */
export const initBedrockProvider = (config: BedrockConfig): LLMProvider => {
  const bedrock = createAmazonBedrock({
    region: config.region,
    credentialProvider: fromNodeProviderChain(),
  });

  return createVercelAIProvider({
    model: config.model,
    createModel: (modelId) => bedrock(modelId),
    system: '回答は提供されたドキュメントの内容だけに基づいてください。',
  });
};
