import "server-only";

/**
 * Per-model pricing in USD per **1 million tokens**. Update when Anthropic
 * publishes new rates. Cache-read is 10% of input, cache-write is 125% of
 * input for ephemeral 5-minute caching (Anthropic's published multiplier).
 *
 * Source: https://www.anthropic.com/pricing#anthropic-api
 * Keep this table the single source of truth — every cost calculation in the
 * app pulls from it.
 */
export interface ModelPricing {
  /** USD per 1M input tokens (non-cached). */
  inputPerMillion: number;
  /** USD per 1M output tokens. */
  outputPerMillion: number;
  /** USD per 1M tokens written to the ephemeral cache (≈ 1.25× input). */
  cacheWritePerMillion: number;
  /** USD per 1M tokens read from the ephemeral cache (≈ 0.1× input). */
  cacheReadPerMillion: number;
}

const PRICING: Record<string, ModelPricing> = {
  // Sonnet 4.6 (current default)
  "claude-sonnet-4-6": {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    cacheWritePerMillion: 3.75,
    cacheReadPerMillion: 0.3,
  },
  // Keep older Sonnet IDs around so historical messages can still be priced.
  "claude-sonnet-4-20250514": {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    cacheWritePerMillion: 3.75,
    cacheReadPerMillion: 0.3,
  },
};

/** Default if the model on a message doc isn't in the table. */
const FALLBACK: ModelPricing = PRICING["claude-sonnet-4-6"];

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
}

/**
 * Compute the USD cost of a single message round-trip. Returns the number
 * in dollars (not cents) with full floating precision; round on display, not
 * on storage.
 */
export function computeCostUsd(usage: TokenUsage, model: string): number {
  const p = PRICING[model] ?? FALLBACK;
  return (
    (usage.inputTokens * p.inputPerMillion) / 1_000_000 +
    (usage.outputTokens * p.outputPerMillion) / 1_000_000 +
    (usage.cacheCreationInputTokens * p.cacheWritePerMillion) / 1_000_000 +
    (usage.cacheReadInputTokens * p.cacheReadPerMillion) / 1_000_000
  );
}

export function getPricing(model: string): ModelPricing {
  return PRICING[model] ?? FALLBACK;
}
