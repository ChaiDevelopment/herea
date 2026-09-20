import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { DbError } from '../db/database.js';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ambil parameter path sebagai string; ID yang bukan UUID pasti tidak ada -> 404. */
export function idParam(req: Request, name = 'id'): string {
  const raw = req.params[name];
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v || !UUID_RE.test(v)) throw new HttpError(404, 'Not found');
  return v;
}

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const where = first?.path.length ? ` (${first.path.join('.')})` : '';
    return res.status(400).json({ error: `Please check the information entered${where}: ${first?.message ?? 'invalid value'}.`, details: err.flatten() });
  }
  if (err instanceof DbError) {
    const status = err.code === 'UNIQUE' || err.code === 'RESTRICT' ? 409 : err.code === 'NOT_FOUND' ? 404 : 400;
    return res.status(status).json({ error: err.message });
  }
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON body.' });
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
}
