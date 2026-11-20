import env from '../../config/env.js';

/**
 * EMBEDDINGS_PROVIDER=local  -> on-machine model, free (default)
 * EMBEDDINGS_PROVIDER=voyage -> Voyage AI API
 * MiniMax has no embeddings API, so the LLM and the embeddings are separate choices.
 * Switching provider changes the vector size: add a migration for the new vector(N).
 */
const adapters = {
  local: () => import('./local.js'),
  voyage: () => import('./voyage.js'),
};

const embeddings = await adapters[env.EMBEDDINGS_PROVIDER]();

export default embeddings;
