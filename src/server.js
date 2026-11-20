'use strict';
const express = require('express');
const env = require('./config/env');
const { pool } = require('./db/pool');
const { migrate } = require('./db/migrate');
const { startBoss, stopBoss } = require('./queue/boss');
const { serviceAuth } = require('./middlewares/serviceAuth');
const { notFound, errorHandler } = require('./middlewares/errorHandler');
const reviewVerificationRoutes = require('./features/reviewVerification/routes');
const { startReviewVerificationWorker } = require('./features/reviewVerification/worker');

function buildApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  // Liveness only, no data: open so Docker / PM2 can probe it.
  app.get('/health', (req, res) => res.json({ ok: true }));

  app.use(serviceAuth);
  app.use(reviewVerificationRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

async function main() {
  await migrate();
  await startBoss();
  await startReviewVerificationWorker();

  const server = buildApp().listen(env.PORT, () => {
    console.log(`[shaheen-ai] listening on :${env.PORT} (llm=${env.LLM_PROVIDER})`);
  });

  const shutdown = async (signal) => {
    console.log(`[shaheen-ai] ${signal}, shutting down`);
    server.close();
    await stopBoss();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[shaheen-ai] failed to start:', err.message);
    process.exit(1);
  });
}

module.exports = { buildApp };
