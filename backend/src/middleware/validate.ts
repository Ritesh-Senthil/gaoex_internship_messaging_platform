/**
 * Request validation middleware (SEC-07).
 *
 * Wraps a Zod schema and validates `req.body`. On success the parsed (and
 * coerced/trimmed) value replaces `req.body` so handlers get clean input. On
 * failure a BadRequestError is forwarded to the shared error handler, producing
 * the standard `{ success: false, error: { message } }` shape.
 */

import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { BadRequestError } from './errorHandler';

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const first = result.error.errors[0];
      const field = first?.path.join('.') || 'body';
      const message = first ? `${field}: ${first.message}` : 'Invalid request body';
      return next(new BadRequestError(message));
    }
    req.body = result.data as any;
    next();
  };
}
