import { z } from 'zod';
import { HttpError } from './http.js';
import type { JsonTable } from '../db/database.js';
import type { TableName } from '../db/types.js';

export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date in YYYY-MM-DD format')
  .refine((v) => new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v, 'must be a real calendar date');

export const uuid = z.string().uuid();
export const score1to5 = z.number().int().min(1).max(5);
export const isoTimestamp = z.string().datetime({ offset: true }).transform((v) => new Date(v).toISOString());

export const rangeQuery = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

/** Buang key bernilai undefined agar tidak menimpa kolom yang tidak dikirim. */
export function compact<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export function assertNotFuture(date: string | null | undefined, today: string, message: string) {
  if (date && date > today) throw new HttpError(400, message);
}

/** Ambil baris milik pengguna, atau 404 (tidak membocorkan keberadaan data milik orang lain). */
export function ownedRow<K extends 'sleep_logs' | 'hydration_logs' | 'activity_logs' | 'daily_checkins' | 'journal_entries' | 'notifications' | 'menstrual_cycles'>(
  table: JsonTable<K>,
  id: string,
  userId: string,
) {
  const row = table.get(id);
  if (!row || (row as { user_id: string }).user_id !== userId) throw new HttpError(404, 'Not found');
  return row;
}

export function inRange<T extends object>(rows: readonly T[], col: keyof T, q: z.infer<typeof rangeQuery>): T[] {
  return rows
    .filter((r) => {
      const d = r[col] as unknown as string;
      return (!q.from || d >= q.from) && (!q.to || d <= q.to);
    })
    .sort((a, b) => String(b[col]).localeCompare(String(a[col])) || String((b as any).created_at).localeCompare(String((a as any).created_at)))
    .slice(0, q.limit);
}

export type { TableName };
