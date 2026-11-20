import env from '../config/env.js';
import { retry } from '../utils/retry.js';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

async function call(path, init = {}, signal) {
  const res = await fetch(`${env.LEGEND_DELIVERY_URL}${path}`, {
    ...init,
    signal,
    headers: { 'x-service-token': env.LEGEND_DELIVERY_TOKEN, ...(init.headers || {}) },
  });
  if (!res.ok) {
    const err = new Error(`legend-delivery ${init.method || 'GET'} ${path} -> HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res;
}

/** Downloads the private review screenshot. Returns { buffer, mediaType }. */
async function fetchScreenshot(reviewId) {
  return retry(
    async (signal) => {
      const res = await call(
        `/internal/reviews/${encodeURIComponent(reviewId)}/screenshot`,
        {},
        signal,
      );
      const mediaType = (res.headers.get('content-type') || '').split(';')[0].trim();
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length > MAX_IMAGE_BYTES) throw new Error('Screenshot larger than 10 MB');
      return { buffer, mediaType };
    },
    { retries: 3, timeoutMs: 20_000 },
  );
}

/** Writes the AI verdict back onto the Review in legend-delivery. */
async function writeResult(reviewId, result) {
  return retry(
    (signal) =>
      call(
        `/internal/reviews/${encodeURIComponent(reviewId)}/ai-check`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(result),
        },
        signal,
      ),
    { retries: 5, timeoutMs: 10_000 },
  );
}

export { fetchScreenshot, writeResult };
