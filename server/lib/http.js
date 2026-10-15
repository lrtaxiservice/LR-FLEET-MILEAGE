import { ZodError } from 'zod';

/** An error with a message that is safe to show to the user. */
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const bad = (msg, details) => new HttpError(400, msg, details);
export const notFound = (what = 'Not found') => new HttpError(404, what);
export const forbidden = (msg = 'You do not have permission to do this.') => new HttpError(403, msg);

/** Wraps an async route so thrown errors reach the error handler. */
export const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Validates req.body (or another object) with a zod schema. */
export function parse(schema, data) {
  const r = schema.safeParse(data);
  if (!r.success) {
    const first = r.error.issues[0];
    const field = first.path.join('.');
    throw bad(field ? `${field}: ${first.message}` : first.message, r.error.issues);
  }
  return r.data;
}

export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) err = bad(err.issues[0]?.message || 'Invalid input');
  if (err?.code === 'LIMIT_FILE_SIZE') err = bad('The file is too large (10 MB at most).');
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on the server. Please try again.' : err.message, details: err.details });
}
