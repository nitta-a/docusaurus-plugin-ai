import { describe, expect, it } from 'vitest';
import { DEFAULT_CONSTRAINTS, validateAIRequest } from '../examples/azure-functions/src/validation.js';

describe('validateAIRequest', () => {
  it('normalizes a valid request and preserves message content', () => {
    expect(
      validateAIRequest({
        messages: [{ role: 'user', content: '  How do I configure it?  ' }],
        options: { maxTokens: 128, temperature: 0.4 },
      }),
    ).toEqual({
      messages: [{ role: 'user', content: '  How do I configure it?  ' }],
      options: { maxTokens: 128, temperature: 0.4 },
    });
  });

  it('also accepts flat generation controls during migration', () => {
    expect(validateAIRequest({ messages: [{ role: 'user', content: 'question' }], maxTokens: 64 })).toEqual({
      messages: [{ role: 'user', content: 'question' }],
      options: { maxTokens: 64 },
    });
  });

  it('rejects oversized messages and generation controls', () => {
    expect(() =>
      validateAIRequest({
        messages: [{ role: 'user', content: 'x'.repeat(DEFAULT_CONSTRAINTS.maxMessageLength + 1) }],
      }),
    ).toThrow('message at index 0 exceeds length limit');
    expect(() =>
      validateAIRequest({ messages: [{ role: 'user', content: 'question' }], options: { maxTokens: 2001 } }),
    ).toThrow('options.maxTokens must be an integer between 1 and 2000');
    expect(() =>
      validateAIRequest({ messages: [{ role: 'user', content: 'question' }], options: { temperature: 2.1 } }),
    ).toThrow('options.temperature must be a finite number between 0 and 2');
  });
});
