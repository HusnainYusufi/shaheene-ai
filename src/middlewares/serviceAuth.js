'use strict';
const crypto = require('crypto');
const env = require('../config/env');

const expected = Buffer.from(env.SERVICE_TOKEN);

/** Only legend-delivery may call this service: it sends the shared x-service-token. */
function serviceAuth(req, res, next) {
  const given = Buffer.from(String(req.get('x-service-token') || ''));
  const ok = given.length === expected.length && crypto.timingSafeEqual(given, expected);
  if (!ok) return res.status(401).json({ error: 'UNAUTHORIZED' });
  next();
}

module.exports = { serviceAuth };
