'use strict';
const env = require('../../config/env');
const { QUEUES, getBoss } = require('../../queue/boss');
const { runPipeline } = require('./pipeline');

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

module.exports = { startReviewVerificationWorker };
