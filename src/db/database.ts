import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { TABLES, TABLE_BY_NAME, enumValues, type Col, type TableDef } from './schema.js';
import type { Tables, TableName } from './types.js';

export type DbErrorCode = 'UNIQUE' | 'FOREIGN_KEY' | 'RESTRICT' | 'INVALID' | 'NOT_FOUND';

export class DbError extends Error {
  constructor(public code: DbErrorCode, message: string) {
    super(message);
    this.name = 'DbError';
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateValue(table: string, column: string, col: Col, value: unknown): void {
  const where = `${table}.${column}`;
  if (value === null || value === undefined) {
    if (!col.nullable) throw new DbError('INVALID', `${where} must not be null`);
    return;
  }
  switch (col.kind) {
    case 'uuid':
      if (typeof value !== 'string' || !UUID_RE.test(value)) throw new DbError('INVALID', `${where} must be a UUID`);
      break;
    case 'text':
      if (typeof value !== 'string') throw new DbError('INVALID', `${where} must be a string`);
      if (col.max && value.length > col.max) throw new DbError('INVALID', `${where} exceeds ${col.max} characters`);
      break;
    case 'int':
      if (!Number.isInteger(value)) throw new DbError('INVALID', `${where} must be an integer`);
      break;
    case 'numeric':
      if (typeof value !== 'number' || !Number.isFinite(value)) throw new DbError('INVALID', `${where} must be a number`);
      break;
    case 'bool':
      if (typeof value !== 'boolean') throw new DbError('INVALID', `${where} must be a boolean`);
      break;
    case 'date':
      if (typeof value !== 'string' || !DATE_RE.test(value) || Number.isNaN(Date.parse(value + 'T00:00:00Z')) || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value)
        throw new DbError('INVALID', `${where} must be a valid YYYY-MM-DD date`);
      break;
    case 'timestamptz':
      if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new DbError('INVALID', `${where} must be an ISO timestamp`);
      break;
    case 'jsonb':
      break;
    case 'enum':
      if (typeof value !== 'string' || !enumValues(col.enum!).includes(value))
        throw new DbError('INVALID', `${where} must be one of ${enumValues(col.enum!).join(', ')}`);
      break;
    case 'enum[]':
      if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || !enumValues(col.enum!).includes(v)))
        throw new DbError('INVALID', `${where} must be an array of ${col.enum}`);
      break;
  }
}

/** Cek tipe, NOT NULL, enum, panjang, dan CHECK constraint sebuah baris (tanpa FK/UNIQUE). */
export function validateShape(def: TableDef, row: Record<string, unknown>): void {
  for (const key of Object.keys(row)) {
    if (!(key in def.columns)) throw new DbError('INVALID', `Unknown column ${def.name}.${key}`);
  }
  for (const [name, col] of Object.entries(def.columns)) validateValue(def.name, name, col, row[name]);
  for (const check of def.checks) {
    const problem = check(row);
    if (problem) throw new DbError('INVALID', `${def.name}: ${problem}`);
  }
}

function defaultFor(col: Col): unknown {
  if (col.default === undefined) return undefined;
  if (col.default === 'uuid') return randomUUID();
  if (col.default === 'now') return new Date().toISOString();
  return structuredClone(col.default);
}

/** Satu tabel = satu file data/<nama_tabel>.json berisi array baris. */
export class JsonTable<K extends TableName> {
  private rows: Tables[K][] = [];
  readonly file: string;

  constructor(readonly def: TableDef, dir: string, private db: Database) {
    this.file = path.join(dir, `${def.name}.json`);
    this.load();
  }

  private load() {
    if (!fs.existsSync(this.file)) {
      this.rows = [];
      this.persist();
      return;
    }
    const raw = fs.readFileSync(this.file, 'utf8');
    try {
      const parsed = raw.trim() ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) throw new Error('root must be an array');
      this.rows = parsed;
    } catch (e) {
      // Jangan menimpa file yang rusak: hentikan agar data tidak hilang.
      throw new Error(`Cannot read ${this.file}: ${(e as Error).message}. Fix or restore the file, then restart.`);
    }
  }

  /** Tulis atomik: file sementara lalu rename, sehingga tidak pernah setengah-tertulis. */
  private persist() {
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.rows, null, 2) + '\n');
    fs.renameSync(tmp, this.file);
  }

  all(): readonly Tables[K][] {
    return this.rows;
  }
  get(id: string): Tables[K] | undefined {
    return this.rows.find((r) => (r as { id: string }).id === id);
  }
  find(pred: (row: Tables[K]) => boolean): Tables[K] | undefined {
    return this.rows.find(pred);
  }
  filter(pred: (row: Tables[K]) => boolean): Tables[K][] {
    return this.rows.filter(pred);
  }

  private checkUnique(row: Record<string, unknown>, ignoreId?: string) {
    for (const cols of this.def.unique) {
      if (cols.some((c) => row[c] === null || row[c] === undefined)) continue; // NULL tidak dianggap sama (perilaku PostgreSQL)
      const clash = this.rows.find((r) => (r as any).id !== ignoreId && cols.every((c) => (r as any)[c] === row[c]));
      if (clash) throw new DbError('UNIQUE', `Duplicate value for ${this.def.name}(${cols.join(', ')})`);
    }
  }

  private validate(row: Record<string, unknown>) {
    validateShape(this.def, row);
    for (const [name, col] of Object.entries(this.def.columns)) {
      if (col.ref && row[name] != null && !this.db.table(col.ref.table).get(row[name] as string)) {
        throw new DbError('FOREIGN_KEY', `${this.def.name}.${name} references a missing ${col.ref.table} row`);
      }
    }
  }

  insert(input: Partial<Tables[K]>): Tables[K] {
    const row: Record<string, unknown> = {};
    for (const [name, col] of Object.entries(this.def.columns)) {
      const given = (input as Record<string, unknown>)[name];
      row[name] = given !== undefined ? given : (defaultFor(col) ?? (col.nullable ? null : undefined));
    }
    for (const key of Object.keys(input)) if (!(key in row)) row[key] = (input as any)[key]; // agar validate() melaporkan kolom asing
    this.validate(row);
    this.checkUnique(row);
    this.rows.push(row as unknown as Tables[K]);
    this.persist();
    return row as unknown as Tables[K];
  }

  update(id: string, patch: Partial<Tables[K]>, opts: { touch?: boolean } = {}): Tables[K] {
    const idx = this.rows.findIndex((r) => (r as any).id === id);
    if (idx < 0) throw new DbError('NOT_FOUND', `${this.def.name} ${id} not found`);
    const next: Record<string, unknown> = { ...(this.rows[idx] as object), ...(patch as object) };
    if (opts.touch !== false && 'updated_at' in this.def.columns && !('updated_at' in patch)) next.updated_at = new Date().toISOString();
    this.validate(next);
    this.checkUnique(next, id);
    this.rows[idx] = next as unknown as Tables[K];
    this.persist();
    return next as unknown as Tables[K];
  }

  /** Setara DELETE ... dengan aturan ON DELETE (CASCADE / RESTRICT / SET NULL) dari FK. */
  remove(id: string): boolean {
    const row = this.get(id);
    if (!row) return false;
    this.db.applyDeleteRules(this.def.name, id);
    this.rows = this.rows.filter((r) => (r as any).id !== id);
    this.persist();
    return true;
  }

  /** Hanya untuk seed/reset. */
  replaceAll(rows: Tables[K][]) {
    this.rows = rows;
    this.persist();
  }
}

type TableMap = { [K in TableName]: JsonTable<K> };

export class Database {
  private tables = {} as TableMap;

  constructor(readonly dir: string) {
    fs.mkdirSync(dir, { recursive: true });
    for (const def of TABLES) (this.tables as any)[def.name] = new JsonTable(def, dir, this);
  }

  table<K extends TableName>(name: K): JsonTable<K> {
    return this.tables[name] as unknown as JsonTable<K>;
  }

  get users() { return this.table('users'); }
  get health_profiles() { return this.table('health_profiles'); }
  get symptoms() { return this.table('symptoms'); }
  get moods() { return this.table('moods'); }
  get menstrual_cycles() { return this.table('menstrual_cycles'); }
  get period_logs() { return this.table('period_logs'); }
  get cycle_symptoms() { return this.table('cycle_symptoms'); }
  get daily_checkins() { return this.table('daily_checkins'); }
  get checkin_symptoms() { return this.table('checkin_symptoms'); }
  get sleep_logs() { return this.table('sleep_logs'); }
  get hydration_logs() { return this.table('hydration_logs'); }
  get activity_logs() { return this.table('activity_logs'); }
  get wellness_scores() { return this.table('wellness_scores'); }
  get health_insights() { return this.table('health_insights'); }
  get journal_entries() { return this.table('journal_entries'); }
  get notifications() { return this.table('notifications'); }
  get user_settings() { return this.table('user_settings'); }
  get auth_tokens() { return this.table('auth_tokens'); }

  /** Dipanggil sebelum baris induk dihapus: terapkan ON DELETE pada semua tabel anak. */
  applyDeleteRules(parent: TableName, id: string) {
    // Pass 1: RESTRICT harus dicek dulu supaya tidak ada penghapusan setengah jalan.
    this.assertNoRestrict(parent, id);
    for (const def of TABLES) {
      for (const [colName, col] of Object.entries(def.columns)) {
        if (col.ref?.table !== parent) continue;
        const child = this.table(def.name) as JsonTable<TableName>;
        const kids = child.filter((r) => (r as any)[colName] === id);
        for (const kid of kids) {
          if (col.ref.onDelete === 'CASCADE') child.remove((kid as any).id);
          else if (col.ref.onDelete === 'SET NULL') child.update((kid as any).id, { [colName]: null } as any, { touch: false });
        }
      }
    }
  }

  private assertNoRestrict(parent: TableName, id: string) {
    for (const def of TABLES) {
      for (const [colName, col] of Object.entries(def.columns)) {
        if (col.ref?.table === parent && col.ref.onDelete === 'RESTRICT') {
          const used = (this.table(def.name) as JsonTable<TableName>).find((r) => (r as any)[colName] === id);
          if (used) throw new DbError('RESTRICT', `Cannot delete ${parent} ${id}: still referenced by ${def.name}.${colName}`);
        }
        if (col.ref?.table === parent && col.ref.onDelete === 'CASCADE') {
          // Cascade bisa menyentuh tabel cucu yang RESTRICT.
          const kids = (this.table(def.name) as JsonTable<TableName>).filter((r) => (r as any)[colName] === id);
          for (const kid of kids) this.assertNoRestrict(def.name, (kid as any).id);
        }
      }
    }
  }

  /** Memastikan data referensi (symptoms & moods) ada — sama dengan INSERT seed di schema.sql. */
  seedReferenceData() {
    for (const s of SYMPTOM_SEED) {
      if (!this.symptoms.find((r) => r.slug === s.slug)) this.symptoms.insert({ id: stableUuid(`symptom:${s.slug}`), ...s });
    }
    for (const m of MOOD_SEED) {
      if (!this.moods.find((r) => r.score === m.score)) this.moods.insert({ id: stableUuid(`mood:${m.score}`), ...m });
    }
  }
}

/** UUID deterministik (bentuk v5) agar ID seed sama di setiap instalasi. */
export function stableUuid(name: string): string {
  const h = createHash('sha1').update(`herea:${name}`).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

// Identik dengan INSERT seed pada db/schema.sql
export const SYMPTOM_SEED = [
  { name: 'Cramps', slug: 'cramps', category: 'MENSTRUAL', description: 'Menstrual or pelvic cramping' },
  { name: 'Headache', slug: 'headache', category: 'NEUROLOGICAL', description: 'Head or tension discomfort' },
  { name: 'Bloating', slug: 'bloating', category: 'DIGESTIVE', description: 'Feeling of abdominal fullness or swelling' },
  { name: 'Nausea', slug: 'nausea', category: 'DIGESTIVE', description: 'Feeling of nausea' },
  { name: 'Fatigue', slug: 'fatigue', category: 'ENERGY', description: 'Feeling unusually tired or low in energy' },
  { name: 'Acne', slug: 'acne', category: 'SKIN', description: 'Acne or skin breakout' },
  { name: 'Breast tenderness', slug: 'breast_tenderness', category: 'REPRODUCTIVE', description: 'Breast tenderness or sensitivity' },
  { name: 'Back pain', slug: 'back_pain', category: 'GENERAL', description: 'Back discomfort' },
  { name: 'Dizziness', slug: 'dizziness', category: 'NEUROLOGICAL', description: 'Feeling dizzy or lightheaded' },
  { name: 'Appetite change', slug: 'appetite_change', category: 'GENERAL', description: 'Change in appetite' },
] as const;

export const MOOD_SEED = [
  { name: 'Very low', score: 1 },
  { name: 'Low', score: 2 },
  { name: 'Neutral', score: 3 },
  { name: 'Good', score: 4 },
  { name: 'Excellent', score: 5 },
] as const;

export { TABLE_BY_NAME };
