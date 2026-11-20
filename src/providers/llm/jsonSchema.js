import { z } from 'zod';

/** zod schema -> plain JSON Schema for provider structured-output params. */
function toJsonSchema(schema) {
  const { $schema, ...rest } = z.toJSONSchema(schema); // eslint-disable-line no-unused-vars
  return rest;
}

/** Pull the first JSON object out of model text (drops <think> blocks and ``` fences). */
function extractJson(text) {
  const cleaned = String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?/gi, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('LLM response contained no JSON object');
  return JSON.parse(cleaned.slice(start, end + 1));
}

export { toJsonSchema, extractJson };
