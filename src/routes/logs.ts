import { Router } from 'express';
import { z } from 'zod';
import { ENUMS } from '../db/types.js';
import { HttpError, idParam } from '../lib/http.js';
import { assertNotFuture, compact, dateString, inRange, isoTimestamp, ownedRow, rangeQuery, score1to5 } from '../lib/validation.js';
import { todayFor } from '../services/context.js';
import type { Ctx } from './types.js';

const FUTURE = 'Tanggal tidak boleh di masa depan.';

export function logRoutes({ db, auth }: Ctx) {
  const r = Router();
  r.use(auth.requireAuth);
  const mine = <T extends { user_id: string }>(rows: readonly T[], userId: string) => rows.filter((x) => x.user_id === userId);

  // ---- sleep_logs (unik per user per tanggal -> POST bersifat upsert) -----
  const sleepBody = z
    .object({
      sleep_date: dateString.optional(),
      duration_minutes: z.number().int().min(0).max(1440).optional(),
      bedtime: isoTimestamp.nullish(),
      wake_time: isoTimestamp.nullish(),
      quality_score: score1to5.nullish(),
      notes: z.string().max(2000).nullish(),
    })
    .strict();

  r.get('/sleep', (req, res) => res.json(inRange(mine(db.sleep_logs.all(), req.user!.id), 'sleep_date', rangeQuery.parse(req.query))));

  r.post('/sleep', (req, res) => {
    const userId = req.user!.id;
    const body = sleepBody.parse(req.body);
    const date = body.sleep_date ?? todayFor(db, userId);
    assertNotFuture(date, todayFor(db, userId), FUTURE);
    let minutes = body.duration_minutes;
    if (minutes === undefined && body.bedtime && body.wake_time) minutes = Math.round((Date.parse(body.wake_time) - Date.parse(body.bedtime)) / 60_000);
    if (minutes === undefined) throw new HttpError(400, 'Please provide the sleep duration.');
    const fields = compact({ duration_minutes: minutes, bedtime: body.bedtime, wake_time: body.wake_time, quality_score: body.quality_score, notes: body.notes });
    const existing = db.sleep_logs.find((s) => s.user_id === userId && s.sleep_date === date);
    if (existing) return res.json(db.sleep_logs.update(existing.id, fields));
    res.status(201).json(db.sleep_logs.insert({ user_id: userId, sleep_date: date, ...fields }));
  });

  r.patch('/sleep/:id', (req, res) => {
    const row = ownedRow(db.sleep_logs, idParam(req), req.user!.id);
    const body = sleepBody.omit({ sleep_date: true }).parse(req.body);
    res.json(db.sleep_logs.update(row.id, compact(body)));
  });

  r.delete('/sleep/:id', (req, res) => {
    db.sleep_logs.remove(ownedRow(db.sleep_logs, idParam(req), req.user!.id).id);
    res.status(204).end();
  });

  // ---- hydration_logs (banyak entri per hari; total harian = jumlah) ------
  r.get('/hydration', (req, res) => res.json(inRange(mine(db.hydration_logs.all(), req.user!.id), 'log_date', rangeQuery.parse(req.query))));

  r.post('/hydration', (req, res) => {
    const userId = req.user!.id;
    const body = z.object({ amount_ml: z.number().int().min(1).max(10000), log_date: dateString.optional() }).strict().parse(req.body);
    const date = body.log_date ?? todayFor(db, userId);
    assertNotFuture(date, todayFor(db, userId), FUTURE);
    res.status(201).json(db.hydration_logs.insert({ user_id: userId, log_date: date, amount_ml: body.amount_ml }));
  });

  r.delete('/hydration/:id', (req, res) => {
    db.hydration_logs.remove(ownedRow(db.hydration_logs, idParam(req), req.user!.id).id);
    res.status(204).end();
  });

  // ---- activity_logs -----------------------------------------------------
  const activityBody = z
    .object({
      activity_date: dateString.optional(),
      activity_type: z.enum(ENUMS.activity_type),
      duration_minutes: z.number().int().min(1).max(1440),
      intensity: z.enum(ENUMS.activity_intensity).nullish(),
      notes: z.string().max(2000).nullish(),
    })
    .strict();

  r.get('/activity', (req, res) => res.json(inRange(mine(db.activity_logs.all(), req.user!.id), 'activity_date', rangeQuery.parse(req.query))));

  r.post('/activity', (req, res) => {
    const userId = req.user!.id;
    const body = activityBody.parse(req.body);
    const date = body.activity_date ?? todayFor(db, userId);
    assertNotFuture(date, todayFor(db, userId), FUTURE);
    res.status(201).json(
      db.activity_logs.insert({
        user_id: userId, activity_date: date, activity_type: body.activity_type, duration_minutes: body.duration_minutes,
        intensity: body.intensity ?? null, notes: body.notes ?? null,
      }),
    );
  });

  r.patch('/activity/:id', (req, res) => {
    const row = ownedRow(db.activity_logs, idParam(req), req.user!.id);
    const body = activityBody.partial().omit({ activity_date: true }).parse(req.body);
    res.json(db.activity_logs.update(row.id, compact(body)));
  });

  r.delete('/activity/:id', (req, res) => {
    db.activity_logs.remove(ownedRow(db.activity_logs, idParam(req), req.user!.id).id);
    res.status(204).end();
  });

  return r;
}
