'use strict';
const { Pool } = require('pg');
const env = require('../config/env');

const pool = new Pool({ connectionString: env.DATABASE_URL, max: 10 });

pool.on('error', (err) => console.error('[pg] idle client error', err.message));

/** Run fn(client) inside BEGIN/COMMIT, rolling back on error. */
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query: (text, params) => pool.query(text, params), tx };
