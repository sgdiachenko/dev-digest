import type { Provider } from '@devdigest/shared';

/**
 * GPT-5 and the o-series reasoning models reject a custom `temperature` (only
 * the default is allowed) and use `max_completion_tokens` instead of
 * `max_tokens`. Detect them so callers can omit/remap those params.
 */
export function isReasoningModel(model: string): boolean {
  return /^(gpt-5|o1|o3|o4)/.test(model);
}

/**
 * The temperature that is actually sent to the provider: `null` when the
 * provider ignores the requested value (OpenAI reasoning models), otherwise
 * the requested one. Used to record the real value in an eval run's config.
 */
export function sentTemperature(provider: Provider, model: string, requested: number): number | null {
  return provider === 'openai' && isReasoningModel(model) ? null : requested;
}
