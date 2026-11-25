/**
 * Prompt caching, the same way for every LLM provider.
 *
 * The contract (every adapter in this folder follows it):
 * - `system` is the stable prefix. Features pass a fixed system prompt per
 *   stage (no dates, ids or per-review data in it); everything that changes per
 *   review goes in `content`, after it.
 * - The adapter caches that prefix with its provider's own mechanism:
 *     anthropic: an explicit cache_control breakpoint on the system block;
 *     minimax / other OpenAI-compatible APIs and gemini: the provider caches a
 *     repeated prefix on its own, so the adapter only keeps the system message
 *     first and byte-identical between calls.
 * - Caching never changes what the model reads: the prompt text is the same
 *   bytes with or without it, so extraction and classification are unaffected.
 *   A cache hit only makes the repeated prefix cheaper and faster.
 * - Every adapter reports usage as { input, output, cacheRead, cacheWrite }
 *   (null where the provider does not say), so hit rates can be compared
 *   across providers.
 */

/** Anthropic system blocks with a cache breakpoint at the end of the stable prefix. */
function anthropicSystem(system) {
  return [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }];
}

const num = (v) => (Number.isFinite(v) ? v : null);

/** Anthropic: input_tokens is only the uncached remainder. */
function anthropicUsage(u = {}) {
  return {
    input: num(u.input_tokens),
    output: num(u.output_tokens),
    cacheRead: num(u.cache_read_input_tokens) ?? 0,
    cacheWrite: num(u.cache_creation_input_tokens) ?? 0,
  };
}

/** OpenAI-compatible (MiniMax): prompt_tokens includes the cached part. */
function openAiUsage(u = {}) {
  return {
    input: num(u.prompt_tokens),
    output: num(u.completion_tokens),
    cacheRead: num(u.prompt_tokens_details?.cached_tokens),
    cacheWrite: null,
  };
}

export { anthropicSystem, anthropicUsage, openAiUsage };
