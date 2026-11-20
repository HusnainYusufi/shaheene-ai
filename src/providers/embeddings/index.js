'use strict';
const env = require('../../config/env');

const adapters = {
  voyage: () => require('./voyage'),
};

module.exports = adapters[env.EMBEDDINGS_PROVIDER]();
