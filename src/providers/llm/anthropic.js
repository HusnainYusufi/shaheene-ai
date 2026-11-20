import Anthropic from '@anthropic-ai/sdk';
import env from '../../config/env.js';
import { toJsonSchema, extractJson } from './jsonSchema.js';

const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 0 }); // retries live in utils/retry

class LlmRefusalError extends Error {
  constructor(details) {
    super(`Model declined the request${details?.category ? ` (${details.category})` : ''}`);
    this.name = 'LlmRefusalError';
    this.details = details;
  }
}

function toBlocks(content) {
  return content.map((part) => {
    if (part.type === 'image') {
      return {
        type: 'image',
        source: { type: 'base64', media_type: part.mediaType, data: part.data },
      };
    }
    return { type: 'text', text: part.text };
  });
}

/**
 * generateJson({ system, content, schema, maxTokens, signal }) -> { data, model, usage }
 * content: [{ type: 'text', text } | { type: 'image', mediaType, data(base64) }]
 */
async function generateJson({ system, content, schema, maxTokens = 4096, signal }) {
  const response = await client.beta.messages.create(
    {
      model: env.ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: toBlocks(content) }],
      output_config: {
        effort: env.ANTHROPIC_EFFORT,
        format: { type: 'json_schema', schema: toJsonSchema(schema) },
      },
      // On a safety decline the API re-runs the request on a fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    },
    { signal },
  );

  if (response.stop_reason === 'refusal') throw new LlmRefusalError(response.stop_details);
  if (response.stop_reason === 'max_tokens') throw new Error('LLM output hit max_tokens');

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
  return {
    data: schema.parse(extractJson(text)),
    model: response.model,
    usage: { input: response.usage.input_tokens, output: response.usage.output_tokens },
  };
}

export const name = 'anthropic';
export { generateJson, LlmRefusalError };
