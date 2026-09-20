/** Semua tanggal "hari" disimpan sebagai string YYYY-MM-DD (tipe DATE di PostgreSQL). */

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Tanggal hari ini menurut zona waktu pengguna, bukan UTC server. */
export function todayIn(timezone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export const toDate = (d: string) => new Date(`${d}T00:00:00Z`);
export const toDateString = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(d: string, n: number): string {
  const x = toDate(d);
  x.setUTCDate(x.getUTCDate() + n);
  return toDateString(x);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((+toDate(to) - +toDate(from)) / 86_400_000);
}
