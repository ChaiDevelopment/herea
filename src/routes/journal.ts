import { Router } from 'express';
import { z } from 'zod';
import { HttpError, idParam } from '../lib/http.js';
import { assertNotFuture, compact, dateString, ownedRow } from '../lib/validation.js';
import { todayFor } from '../services/context.js';
import type { Ctx } from './types.js';

export function journalRoutes({ db, auth }: Ctx) {
  const r = Router();
  r.use(auth.requireAuth);

  const serialize = (e: ReturnType<typeof db.journal_entries.all>[number]) => {
    const mood = e.mood_id ? db.moods.get(e.mood_id) : undefined;
    return { ...e, mood: mood ? { id: mood.id, name: mood.name, score: mood.score } : null };
  };
  const assertMood = (id?: string | null) => {
    if (id && !db.moods.get(id)) throw new HttpError(400, 'Unknown mood.');
  };
  const fieldsSchema = z.object({
    title: z.string().trim().max(180).nullish(),
    content: z.string().trim().min(1, 'cannot be empty').max(10000),
    mood_id: z.string().uuid().nullish(),
    entry_date: dateString.optional(),
  });

  r.get('/journal', (req, res) =>
    res.json(
      db.journal_entries
        .filter((e) => e.user_id === req.user!.id)
        .sort((a, b) => b.entry_date.localeCompare(a.entry_date) || b.created_at.localeCompare(a.created_at))
        .map(serialize),
    ),
  );

  r.post('/journal', (req, res) => {
    const userId = req.user!.id;
    const body = fieldsSchema.strict().parse(req.body);
    const date = body.entry_date ?? todayFor(db, userId);
    assertNotFuture(date, todayFor(db, userId), 'Tanggal tidak boleh di masa depan.');
    assertMood(body.mood_id);
    res.status(201).json(serialize(db.journal_entries.insert({ user_id: userId, title: body.title || null, content: body.content, mood_id: body.mood_id ?? null, entry_date: date })));
  });

  r.patch('/journal/:id', (req, res) => {
    const row = ownedRow(db.journal_entries, idParam(req), req.user!.id);
    const body = fieldsSchema.partial().strict().parse(req.body);
    assertMood(body.mood_id);
    if (body.entry_date) assertNotFuture(body.entry_date, todayFor(db, req.user!.id), 'Tanggal tidak boleh di masa depan.');
    const patch = compact(body);
    if ('title' in patch) patch.title = patch.title || null;
    res.json(serialize(db.journal_entries.update(row.id, patch as any)));
  });

  r.delete('/journal/:id', (req, res) => {
    db.journal_entries.remove(ownedRow(db.journal_entries, idParam(req), req.user!.id).id);
    res.status(204).end();
  });

  return r;
}
