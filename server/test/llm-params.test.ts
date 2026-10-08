import { describe, it, expect } from 'vitest';
import { isReasoningModel, sentTemperature } from '../src/platform/llm-params.js';

describe('llm-params (T6)', () => {
  it('detects OpenAI reasoning models', () => {
    for (const m of ['gpt-5', 'gpt-5-mini', 'o1', 'o3-mini', 'o4-mini']) {
      expect(isReasoningModel(m)).toBe(true);
    }
    for (const m of ['gpt-4.1', 'deepseek/deepseek-v4-flash', 'claude-sonnet-4']) {
      expect(isReasoningModel(m)).toBe(false);
    }
  });

  it('AC-170/NFR-7: sent temperature is null for an OpenAI reasoning model', () => {
    expect(sentTemperature('openai', 'gpt-5', 0)).toBeNull();
    expect(sentTemperature('openai', 'o3-mini', 0)).toBeNull();
  });

  it('AC-170/NFR-7: sent temperature is the requested value otherwise', () => {
    expect(sentTemperature('openrouter', 'deepseek/deepseek-v4-flash', 0)).toBe(0);
    expect(sentTemperature('openai', 'gpt-4.1', 0)).toBe(0);
    expect(sentTemperature('anthropic', 'claude-sonnet-4', 0.2)).toBe(0.2);
  });
});
