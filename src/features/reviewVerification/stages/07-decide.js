/**
 * approve        -> no reasons at all
 * manual_review  -> only manual_review reasons
 * reject         -> at least one reject reason
 * The AI never pays out on its own: legend-delivery decides what to do with each verdict.
 */
function decide(reasons) {
  if (reasons.some((r) => r.effect === 'reject')) return 'reject';
  if (reasons.some((r) => r.effect === 'manual_review')) return 'manual_review';
  return 'approve';
}

async function run(ctx) {
  ctx.decision = decide(ctx.reasons);
  return { decision: ctx.decision, reasons: ctx.reasons.map((r) => r.code) };
}

export const name = 'decide';
export { run, decide };
