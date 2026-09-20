import { Router } from 'express';
import { z } from 'zod';
import { ENUMS, type MenstrualCycle } from '../db/types.js';
import { HttpError, idParam } from '../lib/http.js';
import { assertNotFuture, compact, dateString, ownedRow, score1to5 } from '../lib/validation.js';
import { cycleAnalysis, cyclesOf, recomputeCycleLengths } from '../services/cycles.js';
import { todayFor } from '../services/context.js';
import type { Ctx } from './types.js';

export function cycleRoutes({ db, auth }: Ctx) {
  const r = Router();
  r.use(auth.requireAuth);

  const serialize = (c: MenstrualCycle) => ({
    ...c,
    period_logs: db.period_logs.filter((p) => p.cycle_id === c.id).sort((a, b) => a.log_date.localeCompare(b.log_date)),
    symptoms: db.cycle_symptoms
      .filter((s) => s.cycle_id === c.id)
      .sort((a, b) => a.log_date.localeCompare(b.log_date))
      .map((s) => {
        const sym = db.symptoms.get(s.symptom_id)!;
        return { ...s, symptom: { id: sym.id, name: sym.name, slug: sym.slug } };
      }),
  });

  const messages = {
    future: 'Tanggal haid tidak boleh di masa depan.',
    order: 'Tanggal selesai tidak boleh sebelum tanggal mulai.',
    duplicate: 'Tanggal mulai haid ini sudah tercatat.',
  };

  function checkDates(userId: string, start: string, end: string | null, ignoreId?: string) {
    const today = todayFor(db, userId);
    assertNotFuture(start, today, messages.future);
    assertNotFuture(end, today, messages.future);
    if (end && end < start) throw new HttpError(400, messages.order);
    if (db.menstrual_cycles.find((c) => c.user_id === userId && c.start_date === start && c.id !== ignoreId)) throw new HttpError(409, messages.duplicate);
  }

  // ---- menstrual_cycles --------------------------------------------------
  r.get('/cycles', (req, res) => res.json(cyclesOf(db, req.user!.id).reverse().map(serialize)));

  r.post('/cycles', (req, res) => {
    const userId = req.user!.id;
    const body = z
      .object({ start_date: dateString, end_date: dateString.nullish(), notes: z.string().max(2000).nullish() })
      .strict()
      .parse(req.body);
    checkDates(userId, body.start_date, body.end_date ?? null);
    const cycle = db.menstrual_cycles.insert({ user_id: userId, start_date: body.start_date, end_date: body.end_date ?? null, notes: body.notes ?? null });
    recomputeCycleLengths(db, userId);
    res.status(201).json(serialize(db.menstrual_cycles.get(cycle.id)!));
  });

  r.get('/cycles/:id', (req, res) => res.json(serialize(ownedRow(db.menstrual_cycles, idParam(req), req.user!.id))));

  r.patch('/cycles/:id', (req, res) => {
    const userId = req.user!.id;
    const found = ownedRow(db.menstrual_cycles, idParam(req), userId);
    const body = z
      .object({ start_date: dateString.optional(), end_date: dateString.nullable().optional(), notes: z.string().max(2000).nullable().optional() })
      .strict()
      .parse(req.body);
    checkDates(userId, body.start_date ?? found.start_date, body.end_date === undefined ? found.end_date : body.end_date, found.id);
    db.menstrual_cycles.update(found.id, compact(body));
    recomputeCycleLengths(db, userId);
    res.json(serialize(db.menstrual_cycles.get(found.id)!));
  });

  r.delete('/cycles/:id', (req, res) => {
    const found = ownedRow(db.menstrual_cycles, idParam(req), req.user!.id);
    db.menstrual_cycles.remove(found.id); // period_logs & cycle_symptoms ikut terhapus (ON DELETE CASCADE)
    recomputeCycleLengths(db, req.user!.id);
    res.status(204).end();
  });

  r.get('/cycle-analysis', (req, res) => res.json(cycleAnalysis(db, req.user!.id, todayFor(db, req.user!.id))));

  // ---- period_logs -------------------------------------------------------
  const ownedPeriodLog = (id: string, userId: string) => {
    const log = db.period_logs.get(id);
    const cycle = log && db.menstrual_cycles.get(log.cycle_id);
    if (!log || !cycle || cycle.user_id !== userId) throw new HttpError(404, 'Not found');
    return { log, cycle };
  };

  r.post('/period', (req, res) => {
    const body = z
      .object({ cycle_id: z.string().uuid(), log_date: dateString, flow_level: z.enum(ENUMS.flow_level), notes: z.string().max(2000).nullish() })
      .strict()
      .parse(req.body);
    const cycle = ownedRow(db.menstrual_cycles, body.cycle_id, req.user!.id);
    assertNotFuture(body.log_date, todayFor(db, req.user!.id), 'Tanggal catatan tidak boleh di masa depan.');
    if (body.log_date < cycle.start_date) throw new HttpError(400, 'Tanggal catatan tidak boleh sebelum tanggal mulai haid.');
    if (db.period_logs.find((p) => p.cycle_id === cycle.id && p.log_date === body.log_date)) throw new HttpError(409, 'Catatan untuk tanggal ini sudah ada.');
    res.status(201).json(db.period_logs.insert({ cycle_id: cycle.id, log_date: body.log_date, flow_level: body.flow_level, notes: body.notes ?? null }));
  });

  r.patch('/period/:id', (req, res) => {
    const { log } = ownedPeriodLog(idParam(req), req.user!.id);
    const body = z.object({ flow_level: z.enum(ENUMS.flow_level).optional(), notes: z.string().max(2000).nullable().optional() }).strict().parse(req.body);
    res.json(db.period_logs.update(log.id, compact(body)));
  });

  r.delete('/period/:id', (req, res) => {
    const { log } = ownedPeriodLog(idParam(req), req.user!.id);
    db.period_logs.remove(log.id);
    res.status(204).end();
  });

  // ---- cycle_symptoms ----------------------------------------------------
  r.post('/cycles/:id/symptoms', (req, res) => {
    const cycle = ownedRow(db.menstrual_cycles, idParam(req), req.user!.id);
    const body = z
      .object({ symptom_id: z.string().uuid(), log_date: dateString, severity: score1to5, notes: z.string().max(2000).nullish() })
      .strict()
      .parse(req.body);
    if (!db.symptoms.get(body.symptom_id)) throw new HttpError(400, 'Unknown symptom.');
    assertNotFuture(body.log_date, todayFor(db, req.user!.id), 'Tanggal catatan tidak boleh di masa depan.');
    const existing = db.cycle_symptoms.find((s) => s.cycle_id === cycle.id && s.symptom_id === body.symptom_id && s.log_date === body.log_date);
    if (existing) return res.json(db.cycle_symptoms.update(existing.id, { severity: body.severity, notes: body.notes ?? null }));
    res.status(201).json(db.cycle_symptoms.insert({ cycle_id: cycle.id, symptom_id: body.symptom_id, log_date: body.log_date, severity: body.severity, notes: body.notes ?? null }));
  });

  r.delete('/cycle-symptoms/:id', (req, res) => {
    const row = db.cycle_symptoms.get(idParam(req));
    const cycle = row && db.menstrual_cycles.get(row.cycle_id);
    if (!row || !cycle || cycle.user_id !== req.user!.id) throw new HttpError(404, 'Not found');
    db.cycle_symptoms.remove(row.id);
    res.status(204).end();
  });

  return r;
}
