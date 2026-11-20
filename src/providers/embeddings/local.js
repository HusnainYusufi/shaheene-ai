import path from 'node:path';
import { pipeline, env as hf } from '@huggingface/transformers';
import env from '../../config/env.js';

// Model files are downloaded once (~120 MB) into ./.models, then run fully offline.
hf.cacheDir = path.resolve(import.meta.dirname, '../../../.models');

let extractorPromise;
const extractor = () =>
  (extractorPromise ??= pipeline('feature-extraction', env.LOCAL_EMBEDDING_MODEL, { dtype: 'q8' }));

/**
 * Local multilingual embeddings (default: multilingual-e5-small, 384 dims, Arabic + English).
 * Runs on this machine: no API key, no cost, review text never leaves the server.
 *
 * e5 models expect a prefix. Review-vs-review comparison is symmetric, so every
 * text gets "query: " (the e5 authors' advice for similarity tasks).
 */
export async function embed(texts) {
  const fe = await extractor();
  const out = await fe(
    texts.map((t) => `query: ${t}`),
    { pooling: 'mean', normalize: true },
  );
  const vectors = out.tolist();
  for (const v of vectors) {
    if (v.length !== env.EMBEDDING_DIM) {
      throw new Error(`Embedding has ${v.length} dims, EMBEDDING_DIM is ${env.EMBEDDING_DIM}`);
    }
  }
  return { vectors, model: env.LOCAL_EMBEDDING_MODEL };
}

/** Load the model at startup so the first job does not wait for the download. */
export async function warmup() {
  await extractor();
}

export const name = 'local';
