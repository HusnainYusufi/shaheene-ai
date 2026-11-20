import { PgBoss } from 'pg-boss';
import env from '../config/env.js';

const QUEUES = Object.freeze({ REVIEW_VERIFICATION: 'review-verification' });

let boss;

/** Starts pg-boss (it creates its own `pgboss` schema) and the queues. */
async function startBoss() {
  if (boss) return boss;
  boss = new PgBoss({ connectionString: env.DATABASE_URL });
  boss.on('error', (err) => console.error('[pg-boss]', err.message));
  await boss.start();
  for (const name of Object.values(QUEUES)) {
    await boss.createQueue(name, {
      retryLimit: 3,
      retryDelay: 30,
      retryBackoff: true,
      expireInSeconds: 15 * 60,
    });
  }
  return boss;
}

function getBoss() {
  if (!boss) throw new Error('pg-boss not started');
  return boss;
}

async function stopBoss() {
  if (boss) await boss.stop({ graceful: true });
  boss = undefined;
}

export { QUEUES, startBoss, getBoss, stopBoss };
