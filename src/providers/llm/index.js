'use strict';
const env = require('../../config/env');

/**
 * The only place that knows which LLM company is in use. Features call
 * llm.generateJson(...) and never import an adapter directly.
 */
const adapters = {
  anthropic: () => require('./anthropic'),
  minimax: () => require('./minimax'),
};

module.exports = adapters[env.LLM_PROVIDER]();
