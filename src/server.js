import { fileURLToPath } from 'node:url';
import express from 'express';
import env from './config/env.js';
import { pool } from './db/pool.js';
import { migrate } from './db/migrate.js';
import embeddings from './providers/embeddings/index.js';
import { startBoss, stopBoss } from './queue/boss.js';
import { serviceAuth } from './middlewares/serviceAuth.js';
import { notFound, errorHandler } from './middlewares/errorHandler.js';
import reviewVerificationRoutes from './features/reviewVerification/routes.js';
import { startReviewVerificationWorker } from './features/reviewVerification/worker.js';

function buildApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));

  // Open so Docker / PM2 can probe it. Returns no data beyond up/down.
  app.get('/health', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ ok: true, db: 'up' });
    } catch {
      res.status(503).json({ ok: false, db: 'down' });
    }
  });

  app.use(serviceAuth);
  app.use(reviewVerificationRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

async function main() {
  await migrate();
  if (embeddings.warmup) {
    console.log('[shaheen-ai] loading embeddings model (first run downloads it)');
    await embeddings.warmup();
  }
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('[shaheen-ai] failed to start:', err.message);
    process.exit(1);
  });
}

export { buildApp };
