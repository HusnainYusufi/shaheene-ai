const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class TimeoutError extends Error {
  constructor(ms) {
    super(`Timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * Runs fn(signal) and aborts it after `ms`. fn should pass the signal to fetch/SDK
 * calls so the underlying request is really cancelled.
 */
async function withTimeout(fn, ms) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new TimeoutError(ms)), ms);
  try {
    return await fn(ac.signal);
  } catch (err) {
    if (ac.signal.aborted) throw ac.signal.reason;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Default: retry timeouts, network errors, 408/409/429 and 5xx. */
function isRetryable(err) {
  if (!err) return false;
  if (err.name === 'TimeoutError' || err.name === 'AbortError') return true;
  const status = err.status ?? err.statusCode;
  if (typeof status === 'number')
    return status === 408 || status === 409 || status === 429 || status >= 500;
  return ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_SOCKET'].includes(
    err.code,
  );
}

/**
 * Exponential backoff with full jitter.
 * retry(fn, { retries: 3, baseMs: 500, maxMs: 8000, timeoutMs: 30000 })
 */
async function retry(fn, opts = {}) {
  const { retries = 3, baseMs = 500, maxMs = 8000, timeoutMs, shouldRetry = isRetryable } = opts;
  let attempt = 0;
  for (;;) {
    try {
      return timeoutMs ? await withTimeout(fn, timeoutMs) : await fn();
    } catch (err) {
      if (attempt >= retries || !shouldRetry(err)) throw err;
      const cap = Math.min(maxMs, baseMs * 2 ** attempt);
      await sleep(Math.floor(Math.random() * cap));
      attempt += 1;
    }
  }
}

export { retry, withTimeout, isRetryable, TimeoutError, sleep };
