/**
 * Thrown when OpenRouter reports that no upstream endpoint can serve the
 * request with the required parameters (e.g. no provider supports
 * `response_format: json_schema` for the model). Callers classify by `name`.
 */
export class NoEligibleProviderError extends Error {
  override readonly name = 'NoEligibleProviderError';
  constructor(readonly model: string) {
    super(`No eligible provider supports structured output for model ${model}`);
  }
}
