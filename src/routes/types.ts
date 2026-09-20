import type { RequestHandler } from 'express';
import type { Database } from '../db/database.js';
import type { createAuth } from '../lib/auth.js';

export interface Ctx {
  db: Database;
  auth: ReturnType<typeof createAuth>;
  authLimiter: RequestHandler;
}
