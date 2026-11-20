import env from '../../config/env.js';

const adapters = {
  voyage: () => import('./voyage.js'),
};

const embeddings = await adapters[env.EMBEDDINGS_PROVIDER]();

export default embeddings;
