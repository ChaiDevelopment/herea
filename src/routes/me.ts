import { Router } from 'express';
import { z } from 'zod';
import { ENUMS } from '../db/types.js';
import { publicUser } from '../lib/auth.js';
import { isValidTimezone, todayIn } from '../lib/dates.js';
import { assertNotFuture, compact, dateString } from '../lib/validation.js';
import { settingsOf, timezoneOf } from '../services/context.js';
import type { Ctx } from './types.js';

export function meRoutes({ db, auth }: Ctx) {
  const r = Router();
  r.use(auth.requireAuth);

  // ---- users -------------------------------------------------------------
  r.get('/profile', (req, res) => res.json(publicUser(req.user!)));

  r.patch('/profile', (req, res) => {
    const body = z
      .object({
        name: z.string().trim().min(1).max(120).optional(),
        date_of_birth: dateString.nullable().optional(),
        avatar_url: z.string().url().max(2000).nullable().optional(),
      })
      .strict()
      .parse(req.body);
    assertNotFuture(body.date_of_birth, todayIn(timezoneOf(db, req.user!.id)), 'Date of birth cannot be in the future.');
    res.json(publicUser(db.users.update(req.user!.id, compact(body))));
  });

  // ---- health_profiles ---------------------------------------------------
  const emptyProfile = (userId: string) => ({
    id: null, user_id: userId, height_cm: null, weight_kg: null,
    cycle_length_average: null, period_length_average: null, health_goals: [] as string[],
  });

  r.get('/health-profile', (req, res) => {
    const p = db.health_profiles.find((x) => x.user_id === req.user!.id);
    res.json({ ...(p ?? emptyProfile(req.user!.id)), date_of_birth: req.user!.date_of_birth });
  });

  r.patch('/health-profile', (req, res) => {
    const body = z
      .object({
        height_cm: z.number().positive().max(300).nullable().optional(),
        weight_kg: z.number().positive().max(700).nullable().optional(),
        cycle_length_average: z.number().int().min(15).max(90).nullable().optional(),
        period_length_average: z.number().int().min(1).max(20).nullable().optional(),
        health_goals: z.array(z.enum(ENUMS.health_goal)).max(ENUMS.health_goal.length).optional(),
        date_of_birth: dateString.nullable().optional(),
      })
      .strict()
      .parse(req.body);
    const { date_of_birth, ...profileFields } = body;
    if (date_of_birth !== undefined) db.users.update(req.user!.id, { date_of_birth });
    if (profileFields.height_cm != null) profileFields.height_cm = Math.round(profileFields.height_cm * 100) / 100;
    if (profileFields.weight_kg != null) profileFields.weight_kg = Math.round(profileFields.weight_kg * 100) / 100;
    if (profileFields.health_goals) profileFields.health_goals = [...new Set(profileFields.health_goals)];

    const existing = db.health_profiles.find((x) => x.user_id === req.user!.id);
    const saved = existing
      ? db.health_profiles.update(existing.id, compact(profileFields))
      : db.health_profiles.insert({ user_id: req.user!.id, ...compact(profileFields) });
    res.json({ ...saved, date_of_birth: db.users.get(req.user!.id)!.date_of_birth });
  });

  // ---- user_settings -----------------------------------------------------
  r.get('/settings', (req, res) => res.json(settingsOf(db, req.user!.id)));

  r.patch('/settings', (req, res) => {
    const body = z
      .object({
        timezone: z.string().max(64).refine(isValidTimezone, 'must be a valid IANA time zone').optional(),
        language: z.string().min(2).max(10).optional(),
        daily_checkin_enabled: z.boolean().optional(),
        notification_enabled: z.boolean().optional(),
      })
      .strict()
      .parse(req.body);
    const current = settingsOf(db, req.user!.id);
    res.json(db.user_settings.update(current.id, compact(body)));
  });

  // ---- data referensi ----------------------------------------------------
  r.get('/symptoms', (_req, res) => res.json([...db.symptoms.all()].sort((a, b) => a.name.localeCompare(b.name))));
  r.get('/moods', (_req, res) => res.json([...db.moods.all()].sort((a, b) => a.score - b.score)));

  // ---- notifications -----------------------------------------------------
  r.get('/notifications', (req, res) =>
    res.json(db.notifications.filter((n) => n.user_id === req.user!.id).sort((a, b) => b.created_at.localeCompare(a.created_at))),
  );
  r.patch('/notifications/:id/read', (req, res) => {
    const id = String(req.params.id);
    const n = db.notifications.find((x) => x.id === id && x.user_id === req.user!.id);
    if (!n) return res.status(404).json({ error: 'Not found' });
    res.json(n.read_at ? n : db.notifications.update(n.id, { read_at: new Date().toISOString() }));
  });

  return r;
}
