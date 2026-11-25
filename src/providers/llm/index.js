import env from '../../config/env.js';

/**
 * The only place that knows which LLM company is in use. Features call
 * llm.generateJson(...) and never import an adapter directly.
 * Every adapter caches the system prompt as a stable prefix and reports
 * cache usage the same way: see ./cache.js before adding one (e.g. gemini).
 */
const adapters = {
  anthropic: () => import('./anthropic.js'),
  minimax: () => import('./minimax.js'),
};

const llm = await adapters[env.LLM_PROVIDER]();

export default llm;
