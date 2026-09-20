import type { Database } from '../db/database.js';
import { todayIn } from '../lib/dates.js';

export const DEFAULT_TIMEZONE = 'Asia/Jakarta';

export function timezoneOf(db: Database, userId: string): string {
  return db.user_settings.find((s) => s.user_id === userId)?.timezone ?? DEFAULT_TIMEZONE;
}

/** "Hari ini" menurut zona waktu pengguna. */
export function todayFor(db: Database, userId: string): string {
  return todayIn(timezoneOf(db, userId));
}

/** Pengaturan pengguna; dibuat otomatis bila belum ada (mis. data yang dibuat manual). */
export function settingsOf(db: Database, userId: string) {
  return db.user_settings.find((s) => s.user_id === userId) ?? db.user_settings.insert({ user_id: userId });
}
