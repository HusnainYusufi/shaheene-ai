import { ZodError } from 'zod';

class HttpError extends Error {
  constructor(status, code, message) {
    super(message || code);
    this.status = status;
    this.code = code;
  }
}

function notFound(req, res) {
  res.status(404).json({ error: 'NOT_FOUND' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'VALIDATION', issues: err.issues });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.code, message: err.message });
  }
  console.error('[error]', err);
  res.status(500).json({ error: 'INTERNAL' });
}

export { HttpError, notFound, errorHandler };
