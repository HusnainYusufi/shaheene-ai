// Run: node tests/llmCache.test.js   (no network, no API keys)
import assert from 'node:assert';
import { anthropicSystem, anthropicUsage, openAiUsage } from '../src/providers/llm/cache.js';
import * as extract from '../src/features/reviewVerification/prompts/extract.v3.js';
import * as classify from '../src/features/reviewVerification/prompts/classify.v2.js';

let failed = 0;
const test = (name, fn) => {
  try {
    fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed += 1;
    console.log(`FAIL ${name}\n     ${e.message}`);
  }
};

test('caching does not change the prompt the model reads', () => {
  for (const p of [extract, classify]) {
    const blocks = anthropicSystem(p.system);
    assert.strictEqual(blocks.length, 1);
    assert.strictEqual(
      blocks[0].text,
      p.system,
      `${p.VERSION}: system text must be byte-identical`,
    );
    assert.deepStrictEqual(blocks[0].cache_control, { type: 'ephemeral' });
  }
});

test('the cached prefix is the same for every review', () => {
  // A prefix that changed per call would never be read back from cache.
  for (const p of [extract, classify]) {
    assert.strictEqual(typeof p.system, 'string');
    assert.doesNotMatch(
      p.system,
      /\d{4}-\d{2}-\d{2}T/,
      `${p.VERSION}: no timestamps in the system prompt`,
    );
    assert.deepStrictEqual(anthropicSystem(p.system), anthropicSystem(p.system));
  }
  // Per-review data goes in the user turn, after the cached prefix.
  const a = extract.user({ submittedAt: '2026-11-20T10:00:00Z' });
  const b = extract.user({ submittedAt: '2026-11-21T10:00:00Z' });
  assert.notStrictEqual(a, b);
});

test('usage has one shape for every provider', () => {
  assert.deepStrictEqual(
    anthropicUsage({
      input_tokens: 900,
      output_tokens: 120,
      cache_read_input_tokens: 610,
      cache_creation_input_tokens: 0,
    }),
    { input: 900, output: 120, cacheRead: 610, cacheWrite: 0 },
  );
  assert.deepStrictEqual(anthropicUsage({ input_tokens: 5, output_tokens: 1 }), {
    input: 5,
    output: 1,
    cacheRead: 0,
    cacheWrite: 0,
  });
  assert.deepStrictEqual(
    openAiUsage({
      prompt_tokens: 1500,
      completion_tokens: 80,
      prompt_tokens_details: { cached_tokens: 1024 },
    }),
    { input: 1500, output: 80, cacheRead: 1024, cacheWrite: null },
  );
  assert.deepStrictEqual(openAiUsage(undefined), {
    input: null,
    output: null,
    cacheRead: null,
    cacheWrite: null,
  });
});

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
