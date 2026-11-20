import env from '../../config/env.js';
import { QUEUES, getBoss } from '../../queue/boss.js';
import { runPipeline } from './pipeline.js';

/** Pulls review-verification jobs from pg-boss and runs the pipeline for each. */
async function startReviewVerificationWorker() {
  const boss = getBoss();
  await boss.work(
    QUEUES.REVIEW_VERIFICATION,
    { batchSize: 1, localConcurrency: env.WORKER_CONCURRENCY },
    async ([job]) => {
      const started = Date.now();
      const result = await runPipeline(job.data.checkId);
      console.log(
        `[review-verification] check=${job.data.checkId} decision=${result?.decision ?? 'reported'} ${Date.now() - started}ms`,
      );
    },
  );
  console.log(`[review-verification] worker started (concurrency ${env.WORKER_CONCURRENCY})`);
}

export { startReviewVerificationWorker };
