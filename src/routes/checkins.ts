import { Router } from 'express';
import { z } from 'zod';
import { HttpError, idParam } from '../lib/http.js';
import { assertNotFuture, compact, dateString, inRange, ownedRow, rangeQuery, score1to5 } from '../lib/validation.js';
import { todayFor } from '../services/context.js';
import { serializeCheckin } from '../services/checkins.js';
import type { Ctx } from './types.js';

const symptomList = z.array(z.object({ symptom_id: z.string().uuid(), severity: score1to5 }).strict()).max(50);

export function checkinRoutes({ db, auth }: Ctx) {
  const r = Router();
  r.use(auth.requireAuth);

  /** Ganti seluruh gejala pada satu check-in. Validasi dulu supaya tidak terjadi perubahan setengah jalan. */
  function replaceSymptoms(checkinId: string, list: z.infer<typeof symptomList>) {
    const unique = [...new Map(list.map((s) => [s.symptom_id, s])).values()]; // duplikat: entri terakhir menang
    for (const s of unique) if (!db.symptoms.get(s.symptom_id)) throw new HttpError(400, 'Unknown symptom.');
    for (const old of db.checkin_symptoms.filter((x) => x.daily_checkin_id === checkinId)) db.checkin_symptoms.remove(old.id);
    for (const s of unique) db.checkin_symptoms.insert({ daily_checkin_id: checkinId, symptom_id: s.symptom_id, severity: s.severity });
  }

  const assertMood = (id?: string | null) => {
    if (id && !db.moods.get(id)) throw new HttpError(400, 'Unknown mood.');
  };

  r.get('/checkins', (req, res) => {
    const rows = db.daily_checkins.filter((c) => c.user_id === req.user!.id);
    res.json(inRange(rows, 'checkin_date', rangeQuery.parse(req.query)).map((c) => serializeCheckin(db, c)));
  });

  // Satu check-in per hari: mengirim ulang pada tanggal yang sama memperbarui check-in itu.
  r.post('/checkins', (req, res) => {
    const userId = req.user!.id;
    const body = z
      .object({
        checkin_date: dateString.optional(),
        mood_id: z.string().uuid().nullish(),
        energy_score: score1to5,
        stress_score: score1to5,
        notes: z.string().max(2000).nullish(),
        symptoms: symptomList.optional(),
      })
      .strict()
      .parse(req.body);
    const date = body.checkin_date ?? todayFor(db, userId);
    assertNotFuture(date, todayFor(db, userId), 'Tanggal tidak boleh di masa depan.');
    assertMood(body.mood_id);
    const fields = { mood_id: body.mood_id ?? null, energy_score: body.energy_score, stress_score: body.stress_score, notes: body.notes ?? null };

    const existing = db.daily_checkins.find((c) => c.user_id === userId && c.checkin_date === date);
    const row = existing ? db.daily_checkins.update(existing.id, fields) : db.daily_checkins.insert({ user_id: userId, checkin_date: date, ...fields });
    if (body.symptoms) replaceSymptoms(row.id, body.symptoms);
    res.status(existing ? 200 : 201).json(serializeCheckin(db, row));
  });

  r.patch('/checkins/:id', (req, res) => {
    const row = ownedRow(db.daily_checkins, idParam(req), req.user!.id);
    const body = z
      .object({ mood_id: z.string().uuid().nullable().optional(), energy_score: score1to5.optional(), stress_score: score1to5.optional(), notes: z.string().max(2000).nullable().optional(), symptoms: symptomList.optional() })
      .strict()
      .parse(req.body);
    assertMood(body.mood_id);
    const { symptoms, ...fields } = body;
    const updated = db.daily_checkins.update(row.id, compact(fields));
    if (symptoms) replaceSymptoms(row.id, symptoms);
    res.json(serializeCheckin(db, updated));
  });

  r.delete('/checkins/:id', (req, res) => {
    db.daily_checkins.remove(ownedRow(db.daily_checkins, idParam(req), req.user!.id).id); // checkin_symptoms ikut terhapus
    res.status(204).end();
  });

  return r;
}
