'use strict';
const env = require('../../config/env');

/**
 * Voyage AI embeddings over HTTP.
 * inputType: 'document' when storing, 'query' when searching.
 */
async function embed(texts, { inputType = 'document', signal } = {}) {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.VOYAGE_MODEL,
      input: texts,
      input_type: inputType,
      output_dimension: env.EMBEDDING_DIM,
    }),
  });
  if (!res.ok) {
    const err = new Error(`Voyage HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const body = await res.json();
  const vectors = body.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
  for (const v of vectors) {
    if (v.length !== env.EMBEDDING_DIM) {
      throw new Error(`Embedding has ${v.length} dims, EMBEDDING_DIM is ${env.EMBEDDING_DIM}`);
    }
  }
  return { vectors, model: env.VOYAGE_MODEL };
}

module.exports = { name: 'voyage', embed };
