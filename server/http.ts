import type { ErrorRequestHandler } from 'express';
import multer from 'multer';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { fieldErrors } from '../shared/schemas';

/** An error with a message that's safe to show to people. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const notFound = (what = 'That') => new HttpError(404, `${what} couldn’t be found. It may have been deleted.`);

/** Check input against a schema; throws a 400 with per-field messages if it fails. */
export function validate<S extends ZodTypeAny>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new HttpError(400, 'Please check the highlighted fields.', fieldErrors(result.error));
  }
  return result.data;
}

/** Parse a numeric route parameter like /customers/:id. */
export function idParam(value: unknown): number {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw notFound();
  return id;
}

/** Convert 0/1 columns to true/false for the API. */
export function withBools<T extends Record<string, unknown>>(row: T, keys: (keyof T)[]): T {
  const out = { ...row };
  for (const key of keys) (out as Record<string, unknown>)[key as string] = Boolean(row[key]);
  return out;
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message, fields: err.fields });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Please check the highlighted fields.', fields: fieldErrors(err) });
    return;
  }
  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE' ? 'That photo is too big (10 MB max).' : 'That upload didn’t work. Please try again.';
    res.status(400).json({ error: message });
    return;
  }
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'The request couldn’t be read.' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
};
