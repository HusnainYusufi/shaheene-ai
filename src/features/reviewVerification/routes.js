import express from 'express';
import { z } from 'zod';
import { QUEUES, getBoss } from '../../queue/boss.js';
import { HttpError } from '../../middlewares/errorHandler.js';
import * as repo from './repository.js';

const router = express.Router();

const JobInput = z.object({
  reviewId: z.string().min(1),
  orderNo: z.string().min(1),
  driverId: z.string().min(1),
  submittedAt: z.iso.datetime({ offset: true }),
  deliveredAt: z.iso.datetime({ offset: true }).nullish(),
  link: z.string().url().nullish(),
  note: z.string().max(200).nullish(),
});

/** Queue a verification. Re-posting while one is open returns the open check. */
router.post('/jobs/review-verification', async (req, res) => {
  const input = JobInput.parse(req.body);

  const open = await repo.findOpenCheck(input.reviewId);
  if (open)
    return res.status(202).json({ checkId: open.id, status: open.status, deduplicated: true });

  const check = await repo.createCheck(input);
  await getBoss().send(QUEUES.REVIEW_VERIFICATION, { checkId: check.id });
  res.status(202).json({ checkId: check.id, status: check.status });
});

router.get('/checks/:id', async (req, res) => {
  const id = z.uuid().safeParse(req.params.id);
  if (!id.success) throw new HttpError(404, 'NOT_FOUND');
  const check = await repo.getCheck(id.data);
  if (!check) throw new HttpError(404, 'NOT_FOUND');
  res.json({
    id: check.id,
    reviewId: check.review_id,
    orderNo: check.order_no,
    status: check.status,
    decision: check.decision,
    reasonCodes: check.reason_codes,
    reasons: check.reasons,
    stages: check.stage_results,
    extraction: check.extraction,
    classification: check.classification,
    llm: { provider: check.llm_provider, model: check.llm_model, prompts: check.prompt_versions },
    error: check.error,
    attempts: check.attempts,
    createdAt: check.created_at,
    finishedAt: check.finished_at,
    reportedAt: check.reported_at,
  });
});

export default router;
