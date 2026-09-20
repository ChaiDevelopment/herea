import type { NextFunction, Request, Response } from 'express';
import { SignJWT, jwtVerify } from 'jose';
import type { Database } from '../db/database.js';
import type { User } from '../db/types.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export function createAuth(db: Database, secret: string) {
  const key = new TextEncoder().encode(secret);

  const signToken = (userId: string) =>
    new SignJWT({ sub: userId }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('7d').sign(key);

  async function requireAuth(req: Request, res: Response, next: NextFunction) {
    try {
      const header = req.headers.authorization ?? '';
      if (!header.startsWith('Bearer ')) throw new Error('missing');
      const { payload } = await jwtVerify(header.slice(7), key, { algorithms: ['HS256'] });
      const user = payload.sub ? db.users.get(payload.sub) : undefined;
      if (!user) throw new Error('unknown user');
      req.user = user;
      next();
    } catch {
      res.status(401).json({ error: 'Authentication required' });
    }
  }

  return { signToken, requireAuth };
}

/** Bentuk user yang aman dikirim ke klien (tanpa password_hash). */
export function publicUser(u: User) {
  const { password_hash: _omit, ...rest } = u;
  return rest;
}
