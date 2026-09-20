import type { Database } from '../db/database.js';
import type { MenstrualCycle } from '../db/types.js';
import { analyzeCycleHistory, averageCycleLength, cycleDay, detectPhase, predictNextPeriod } from '../../health-engine/index.js';
import { daysBetween, toDate, toDateString } from '../lib/dates.js';

export const cyclesOf = (db: Database, userId: string) =>
  db.menstrual_cycles.filter((c) => c.user_id === userId).sort((a, b) => a.start_date.localeCompare(b.start_date));

/**
 * cycle_length = jarak hari dari tanggal mulai siklus ini ke tanggal mulai siklus berikutnya.
 * Siklus terakhir belum punya panjang (NULL). Nilai di luar 1..120 (batas CHECK) disimpan NULL.
 */
export function recomputeCycleLengths(db: Database, userId: string) {
  const sorted = cyclesOf(db, userId);
  sorted.forEach((c: MenstrualCycle, i) => {
    const next = sorted[i + 1];
    const gap = next ? daysBetween(c.start_date, next.start_date) : null;
    const value = gap !== null && gap >= 1 && gap <= 120 ? gap : null;
    if (c.cycle_length !== value) db.menstrual_cycles.update(c.id, { cycle_length: value }, { touch: false });
  });
}

const iso = (d?: Date) => (d ? toDateString(d) : null);

export function cycleAnalysis(db: Database, userId: string, today: string) {
  const starts = cyclesOf(db, userId).map((c) => toDate(c.start_date));
  const profile = db.health_profiles.find((p) => p.user_id === userId);
  const a = analyzeCycleHistory(starts, profile?.cycle_length_average ?? undefined, toDate(today));
  return {
    average_length: a.averageLength ?? null,
    last_start: iso(a.lastStart),
    next_period: iso(a.nextPeriod),
    delay_days: a.delayDays,
    irregular: a.irregular,
    status: a.status,
    message: a.message,
    guidance: a.guidance,
  };
}

export function cycleSnapshot(db: Database, userId: string, today: string) {
  const cycles = cyclesOf(db, userId);
  const latest = cycles.at(-1);
  const profile = db.health_profiles.find((p) => p.user_id === userId);
  const average = averageCycleLength(cycles.map((c) => toDate(c.start_date))) ?? profile?.cycle_length_average ?? undefined;
  const start = latest ? toDate(latest.start_date) : undefined;
  const day = cycleDay(start, toDate(today));
  return {
    day: day ?? null,
    average_length: average ?? null,
    phase: detectPhase(day, average),
    next_period: iso(predictNextPeriod(start, average)),
  };
}
