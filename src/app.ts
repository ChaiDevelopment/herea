import express from 'express';
import cors from 'cors';
import { rateLimit } from 'express-rate-limit';
import type { Database } from './db/database.js';
import { createAuth } from './lib/auth.js';
import { errorHandler } from './lib/http.js';
import { authRoutes } from './routes/auth.js';
import { checkinRoutes } from './routes/checkins.js';
import { cycleRoutes } from './routes/cycles.js';
import { journalRoutes } from './routes/journal.js';
import { logRoutes } from './routes/logs.js';
import { meRoutes } from './routes/me.js';
import { wellnessRoutes } from './routes/wellness.js';
import type { Ctx } from './routes/types.js';

export interface AppOptions {
  jwtSecret: string;
  publicDir: string;
  /** Matikan pembatas laju (dipakai di test). */
  disableRateLimit?: boolean;
}

export function createApp(db: Database, opts: AppOptions) {
  const app = express();
  // Di belakang proxy (Railway), percayai header X-Forwarded-For agar pembatas laju menghitung per pengunjung.
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY));
  const auth = createAuth(db, opts.jwtSecret);
  const authLimiter = opts.disableRateLimit
    ? (_q: unknown, _s: unknown, next: () => void) => next()
    : rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many attempts. Please try again later.' } });
  const ctx: Ctx = { db, auth, authLimiter: authLimiter as Ctx['authLimiter'] };

  app.use(cors());
  app.use(express.json({ limit: '100kb' }));
  app.use(express.static(opts.publicDir));

  app.use('/api/auth', authRoutes(ctx));
  for (const build of [meRoutes, cycleRoutes, logRoutes, checkinRoutes, wellnessRoutes, journalRoutes]) app.use('/api', build(ctx));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  app.use(errorHandler);
  return app;
}