import env from '../../config/env.js';
import { toJsonSchema, extractJson } from './jsonSchema.js';
import { openAiUsage } from './cache.js';

const PARSE_ATTEMPTS = 2;

function toParts(content) {
  return content.map((part) =>
    part.type === 'image'
      ? { type: 'image_url', image_url: { url: `data:${part.mediaType};base64,${part.data}` } }
      : { type: 'text', text: part.text },
  );
}

async function complete(messages, { maxTokens, signal }) {
  const body = {
    model: env.MINIMAX_MODEL,
    messages,
    // Thinking tokens count toward this cap, so it must leave room for them.
    max_completion_tokens: maxTokens,
    // Thinking goes to message.reasoning_content, keeping message.content clean.
    reasoning_split: true,
  };
  // reasoning_effort is accepted by MiniMax-M3.1-Flash only (its default is "max").
  if (/flash/i.test(env.MINIMAX_MODEL)) body.reasoning_effort = env.MINIMAX_REASONING_EFFORT;

  const res = await fetch(`${env.MINIMAX_BASE_URL}/chat/completions`, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.MINIMAX_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = new Error(`MiniMax HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  const json = await res.json();
  // MiniMax can return HTTP 200 with an error in base_resp.
  if (json?.base_resp?.status_code) {
    const err = new Error(
      `MiniMax error ${json.base_resp.status_code}: ${json.base_resp.status_msg}`,
    );
    err.status = json.base_resp.status_code === 1002 ? 429 : 400; // 1002 = rate limited
    throw err;
  }
  return json;
}

/**
 * MiniMax M3 models have no structured-output mode, so the JSON Schema goes in the
 * system prompt and the reply is validated with zod. A reply that fails validation
 * is sent back once with the error so the model can correct it.
 * The system message (prompt + schema) is identical for every call of a stage
 * and always first, so the provider's prefix cache can reuse it (./cache.js).
 */
export async function generateJson({ system, content, schema, maxTokens = 8000, signal }) {
  const messages = [
    {
      role: 'system',
      content: `${system}\n\nReply with one JSON object only, no other text, matching this JSON Schema:\n${JSON.stringify(toJsonSchema(schema))}`,
    },
    { role: 'user', content: toParts(content) },
  ];

  let lastError;
  for (let attempt = 1; attempt <= PARSE_ATTEMPTS; attempt += 1) {
    const body = await complete(messages, { maxTokens, signal });
    const message = body?.choices?.[0]?.message;
    const text = message?.content;
    try {
      if (!text) throw new Error('empty content');
      return {
        data: schema.parse(extractJson(text)),
        model: body.model || env.MINIMAX_MODEL,
        usage: openAiUsage(body.usage),
      };
    } catch (err) {
      lastError = err;
      messages.push(
        { role: 'assistant', content: text || '' },
        {
          role: 'user',
          content: `That reply was not valid: ${err.message.slice(0, 500)}. Send the corrected JSON object only.`,
        },
      );
    }
  }
  throw new Error(`MiniMax reply failed validation: ${lastError.message.slice(0, 300)}`);
}

export const name = 'minimax';
