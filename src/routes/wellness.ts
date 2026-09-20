import { Router } from 'express';
import { z } from 'zod';
import { HttpError, idParam } from '../lib/http.js';
import { serializeCheckin } from '../services/checkins.js';
import { timezoneOf, todayFor } from '../services/context.js';
import { cycleSnapshot } from '../services/cycles.js';
import { activeInsights, daySnapshot, syncInsights, syncWellnessScore } from '../services/wellness.js';
import type { Ctx } from './types.js';

export function wellnessRoutes({ db, auth }: Ctx) {
  const r = Router();
  r.use(auth.requireAuth);

  /** Ringkasan semua catatan hari ini (untuk tile di dashboard). */
  r.get('/today', (req, res) => {
    const userId = req.user!.id;
    const date = todayFor(db, userId);
    const s = daySnapshot(db, userId, date);
    res.json({
      date,
      timezone: timezoneOf(db, userId),
      checkin: s.checkin ? serializeCheckin(db, s.checkin) : null,
      sleep: s.sleep,
      hydration_ml: s.hydration_ml,
      hydration_entries: s.hydration_entries,
      activity_minutes: s.activity_minutes,
      activities: s.activities,
    });
  });

  r.get('/wellness/score', (req, res) => res.json(syncWellnessScore(db, req.user!.id, todayFor(db, req.user!.id))));

  r.get('/wellness', (req, res) => {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(365).default(30) }).parse(req.query);
    res.json(
      db.wellness_scores
        .filter((w) => w.user_id === req.user!.id)
        .sort((a, b) => b.score_date.localeCompare(a.score_date))
        .slice(0, limit),
    );
  });

  r.get('/insights', (req, res) => {
    const userId = req.user!.id;
    const { all } = z.object({ all: z.enum(['1', 'true']).optional() }).parse(req.query);
    syncInsights(db, userId, todayFor(db, userId));
    res.json(activeInsights(db, userId, Boolean(all)));
  });

  r.get('/insights/:id', (req, res) => {
    const insight = db.health_insights.get(idParam(req));
    if (!insight || insight.user_id !== req.user!.id) throw new HttpError(404, 'Not found');
    res.json(insight);
  });

  r.get('/dashboard', (req, res) => {
    const userId = req.user!.id;
    const date = todayFor(db, userId);
    res.json({ date, cycle: cycleSnapshot(db, userId, date), score: syncWellnessScore(db, userId, date) });
  });

  return r;
}
