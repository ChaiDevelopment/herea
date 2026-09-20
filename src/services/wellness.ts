import type { Database } from '../db/database.js';
import type { WellnessScore } from '../db/types.js';
import { CALCULATION_VERSION, TOTAL_SIGNALS, calculateWellnessScore, generateInsights } from '../../health-engine/index.js';
import { cycleAnalysis } from './cycles.js';
import { checkinSymptoms } from './checkins.js';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const round = (n: number | undefined) => (n === undefined ? null : Math.round(n));

/** Semua catatan pengguna pada satu tanggal — dasar untuk tile dashboard, skor, dan insight. */
export function daySnapshot(db: Database, userId: string, date: string) {
  const checkin = db.daily_checkins.find((c) => c.user_id === userId && c.checkin_date === date) ?? null;
  const mood = checkin?.mood_id ? (db.moods.get(checkin.mood_id) ?? null) : null;
  const symptoms = checkin ? checkinSymptoms(db, checkin.id) : [];
  const sleep = db.sleep_logs.find((s) => s.user_id === userId && s.sleep_date === date) ?? null;
  const hydrationLogs = db.hydration_logs.filter((h) => h.user_id === userId && h.log_date === date);
  const activities = db.activity_logs.filter((a) => a.user_id === userId && a.activity_date === date);
  return {
    date,
    checkin,
    mood,
    symptoms,
    sleep,
    hydration_ml: hydrationLogs.length ? sum(hydrationLogs.map((h) => h.amount_ml)) : null,
    hydration_entries: hydrationLogs.length,
    activity_minutes: activities.length ? sum(activities.map((a) => a.duration_minutes)) : null,
    activities,
  };
}

export type DaySnapshot = ReturnType<typeof daySnapshot>;

/** Hitung skor hari itu dan simpan/perbarui di wellness_scores (1 baris per user per tanggal). */
export function syncWellnessScore(db: Database, userId: string, date: string) {
  const s = daySnapshot(db, userId, date);
  const r = calculateWellnessScore({
    sleepHours: s.sleep ? s.sleep.duration_minutes / 60 : undefined,
    hydrationMl: s.hydration_ml ?? undefined,
    moodScore: s.mood?.score,
    energy: s.checkin?.energy_score,
    stress: s.checkin?.stress_score,
    activityMinutes: s.activity_minutes ?? undefined,
  });
  const existing = db.wellness_scores.find((w) => w.user_id === userId && w.score_date === date);

  if (r.score === undefined) {
    if (existing) db.wellness_scores.remove(existing.id);
    return { date, overall_score: null, signals: 0, total_signals: TOTAL_SIGNALS, data_completeness: 0, components: {}, calculation_version: CALCULATION_VERSION };
  }

  const c = r.components;
  const fields: Omit<WellnessScore, 'id' | 'user_id' | 'score_date' | 'created_at'> = {
    overall_score: r.score,
    energy_score: round(c.energy),
    sleep_score: round(c.sleep),
    mood_score: round(c.mood),
    hydration_score: round(c.hydration),
    activity_score: round(c.activity),
    cycle_score: null,
    data_completeness: Math.round((r.completeness / TOTAL_SIGNALS) * 100),
    calculation_version: CALCULATION_VERSION,
  };
  const changed = !existing || (Object.keys(fields) as (keyof typeof fields)[]).some((k) => existing[k] !== fields[k]);
  if (changed) {
    if (existing) db.wellness_scores.update(existing.id, fields);
    else db.wellness_scores.insert({ user_id: userId, score_date: date, ...fields });
  }
  return {
    date,
    overall_score: r.score,
    signals: r.completeness,
    total_signals: TOTAL_SIGNALS,
    data_completeness: fields.data_completeness,
    components: {
      sleep: round(c.sleep), hydration: round(c.hydration), mood: round(c.mood),
      energy: round(c.energy), activity: round(c.activity), stress: round(c.stress),
    },
    calculation_version: CALCULATION_VERSION,
  };
}

const SEVERITY_RANK = { HIGH: 3, MODERATE: 2, LOW: 1, INFO: 0 } as const;

/**
 * Buat ulang insight hari ini dari health-engine dan simpan di health_insights.
 * metadata = {key, date} dipakai untuk memperbarui (bukan menggandakan) insight yang sama.
 */
export function syncInsights(db: Database, userId: string, date: string) {
  const snap = daySnapshot(db, userId, date);
  const score = syncWellnessScore(db, userId, date);
  const cycle = cycleAnalysis(db, userId, date);
  const drafts = generateInsights({
    symptoms: snap.symptoms.map((x) => ({ name: x.name, severity: x.severity })),
    score: score.overall_score ?? undefined,
    cycle: { status: cycle.status, delayDays: cycle.delay_days, irregular: cycle.irregular, message: cycle.message, guidance: cycle.guidance },
  });

  const mine = db.health_insights.filter(
    (i) => i.user_id === userId && i.source === 'HEALTH_ENGINE' && (i.metadata as any)?.date === date && typeof (i.metadata as any)?.key === 'string',
  );
  const keyOf = (i: { metadata: unknown }) => (i.metadata as any).key as string;

  for (const stale of mine.filter((i) => !drafts.some((d) => d.key === keyOf(i)))) db.health_insights.remove(stale.id);

  const now = new Date();
  const generatedAt = now.toISOString();
  const expiresAt = new Date(+now + 24 * 3_600_000).toISOString();
  for (const d of drafts) {
    const existing = mine.find((i) => keyOf(i) === d.key);
    const content = { type: d.type, title: d.title, description: d.description, recommendation: d.recommendation, severity: d.severity };
    if (!existing) {
      db.health_insights.insert({ user_id: userId, ...content, source: d.source, metadata: { key: d.key, date }, generated_at: generatedAt, expires_at: expiresAt });
    } else if ((Object.keys(content) as (keyof typeof content)[]).some((k) => existing[k] !== content[k])) {
      db.health_insights.update(existing.id, { ...content, generated_at: generatedAt, expires_at: expiresAt });
    }
  }
}

/** Insight aktif (belum kedaluwarsa), urut dari yang paling penting lalu terbaru. */
export function activeInsights(db: Database, userId: string, includeExpired = false, limit = 50) {
  const now = Date.now();
  return db.health_insights
    .filter((i) => i.user_id === userId && (includeExpired || !i.expires_at || Date.parse(i.expires_at) > now))
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.generated_at.localeCompare(a.generated_at))
    .slice(0, limit);
}
