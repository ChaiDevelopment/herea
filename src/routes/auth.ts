import { Router } from 'express';
import argon2 from 'argon2';
import { z } from 'zod';
import { DbError } from '../db/database.js';
import { publicUser } from '../lib/auth.js';
import { HttpError } from '../lib/http.js';
import { isValidTimezone } from '../lib/dates.js';
import { DEFAULT_TIMEZONE } from '../services/context.js';
import type { Ctx } from './types.js';

// Hash palsu agar waktu respons login tidak membedakan email terdaftar / tidak.
const DUMMY_HASH = await argon2.hash('herea-dummy-password');

export function authRoutes({ db, auth, authLimiter }: Ctx) {
  const r = Router();

  r.post('/register', authLimiter, async (req, res) => {
    const body = z
      .object({
        email: z.string().trim().email().max(320),
        password: z.string().min(8).max(128),
        name: z.string().trim().min(1).max(120),
        timezone: z.string().refine(isValidTimezone).optional(),
      })
      .safeParse(req.body);
    if (!body.success) throw new HttpError(400, 'Please provide your name, a valid email and a password (8+ characters).');
    const { email, password, name, timezone } = body.data;
    const normalized = email.toLowerCase();
    if (db.users.find((u) => u.email === normalized)) throw new HttpError(409, 'This email is already registered.');

    const password_hash = await argon2.hash(password);
    try {
      const user = db.users.insert({ email: normalized, password_hash, name });
      db.user_settings.insert({ user_id: user.id, timezone: timezone ?? DEFAULT_TIMEZONE });
      res.status(201).json({ token: await auth.signToken(user.id), user: { id: user.id, email: user.email, name: user.name } });
    } catch (e) {
      if (e instanceof DbError && e.code === 'UNIQUE') throw new HttpError(409, 'This email is already registered.');
      throw e;
    }
  });

  r.post('/login', authLimiter, async (req, res) => {
    const body = z.object({ email: z.string().trim().email(), password: z.string().min(1) }).safeParse(req.body);
    if (!body.success) throw new HttpError(400, 'Invalid credentials.');
    const user = db.users.find((u) => u.email === body.data.email.toLowerCase());
    const ok = await argon2.verify(user?.password_hash ?? DUMMY_HASH, body.data.password).catch(() => false);
    if (!user || !ok) throw new HttpError(401, 'Invalid credentials.');
    res.json({ token: await auth.signToken(user.id), user: { id: user.id, email: user.email, name: user.name } });
  });

  // Token bersifat stateless (JWT 7 hari): logout dilakukan klien dengan membuang token.
  r.post('/logout', auth.requireAuth, (_req, res) => res.status(204).end());
  r.post('/forgot-password', authLimiter, (_req, res) => res.status(202).json({ message: 'If the address exists, reset instructions will be sent.' }));
  r.post('/reset-password', authLimiter, (_req, res) => res.status(501).json({ error: 'Email delivery is not configured.' }));

  // Dipakai klien untuk memvalidasi token yang tersimpan.
  r.get('/me', auth.requireAuth, (req, res) => res.json(publicUser(req.user!)));

  return r;
}
