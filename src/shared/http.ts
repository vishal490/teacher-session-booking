import { randomUUID } from 'node:crypto';
import { RequestHandler, ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export const asyncRoute = (handler: RequestHandler): RequestHandler => async (req, res, next) => {
  try { await handler(req, res, next); } catch (error) { next(error); }
};
export const requestContext: RequestHandler = (req, res, next) => {
  const requestId = randomUUID();
  res.locals.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  const started = Date.now();
  res.on('finish', () => console.log(JSON.stringify({ requestId, method: req.method, path: req.path, status: res.statusCode, durationMs: Date.now() - started })));
  next();
};
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  let status = 500, code = 'INTERNAL_ERROR', message = 'An unexpected error occurred.';
  let details: unknown;
  if (error instanceof AppError) ({ status, code, message } = error);
  else if (error instanceof ZodError) { status = 400; code = 'VALIDATION_ERROR'; message = 'Invalid request.'; details = error.issues.map(i => ({ path: i.path.join('.'), message: i.message })); }
  else if (error?.code === 11000) { status = 409; code = 'DUPLICATE_EMAIL'; message = 'Email already exists.'; }
  else if (error?.type === 'entity.parse.failed') { status = 400; code = 'INVALID_JSON'; message = 'Malformed JSON body.'; }
  else if (error?.type === 'entity.too.large') { status = 413; code = 'BODY_TOO_LARGE'; message = 'Request body exceeds 16 KB.'; }
  if (status === 500) console.error(JSON.stringify({ requestId: res.locals.requestId, error: String(error) }));
  res.status(status).json({ error: { code, message, ...(details ? { details } : {}), requestId: res.locals.requestId } });
};
