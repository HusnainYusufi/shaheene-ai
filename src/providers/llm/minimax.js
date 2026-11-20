import env from '../../config/env.js';
import { toJsonSchema, extractJson } from './jsonSchema.js';

function toParts(content) {
  return content.map((part) =>
    part.type === 'image'
      ? { type: 'image_url', image_url: { url: `data:${part.mediaType};base64,${part.data}` } }
      : { type: 'text', text: part.text },
  );
}

/**
 * MiniMax chat completions (OpenAI-style wire format), called with fetch.
 * The JSON schema goes in the system prompt; the reply is validated with zod.
 */
async function generateJson({ system, content, schema, maxTokens = 4096, signal }) {
  const schemaText = JSON.stringify(toJsonSchema(schema));
  const res = await fetch(`${env.MINIMAX_BASE_URL}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.MINIMAX_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.MINIMAX_MODEL,
      max_tokens: maxTokens,
      messages: [
        {
          role: 'system',
          content: `${system}\n\nReply with one JSON object only, matching this JSON Schema:\n${schemaText}`,
        },
        { role: 'user', content: toParts(content) },
      ],
    }),
  });

  if (!res.ok) {
    const err = new Error(`MiniMax HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const body = await res.json();
  const text = body?.choices?.[0]?.message?.content;
  if (!text) throw new Error('MiniMax returned no content');

  return {
    data: schema.parse(extractJson(text)),
    model: body.model || env.MINIMAX_MODEL,
    usage: {
      input: body.usage?.prompt_tokens ?? null,
      output: body.usage?.completion_tokens ?? null,
    },
  };
}

export const name = 'minimax';
export { generateJson };
