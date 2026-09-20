import { ENUMS, type EnumName, type TableName } from './types.js';

/**
 * Metadata skema yang mengikuti db/schema.sql. Dipakai oleh:
 *  - JsonTable  : default kolom, validasi tipe/NOT NULL/enum/CHECK, UNIQUE, FK
 *  - export SQL : urutan tabel, urutan kolom, cast enum/jsonb
 *  - tests      : memastikan nama tabel & kolom identik dengan schema.sql
 */

export type ColKind = 'uuid' | 'text' | 'int' | 'numeric' | 'bool' | 'date' | 'timestamptz' | 'jsonb' | 'enum' | 'enum[]';
export type OnDelete = 'CASCADE' | 'RESTRICT' | 'SET NULL';

export interface Col {
  kind: ColKind;
  nullable?: boolean;
  enum?: EnumName;
  max?: number; // panjang maksimum VARCHAR(n)
  ref?: { table: TableName; onDelete: OnDelete };
  /** 'uuid' | 'now' | nilai literal (array/objek akan disalin) */
  default?: unknown;
}

export interface TableDef {
  name: TableName;
  columns: Record<string, Col>;
  unique: string[][];
  checks: Array<(row: any) => string | null>;
}

const id: Col = { kind: 'uuid', default: 'uuid' };
const createdAt: Col = { kind: 'timestamptz', default: 'now' };
const updatedAt: Col = { kind: 'timestamptz', default: 'now' };
const fk = (table: TableName, onDelete: OnDelete, nullable = false): Col => ({ kind: 'uuid', nullable, ref: { table, onDelete } });
const text = (o: Partial<Col> = {}): Col => ({ kind: 'text', ...o });
const int = (o: Partial<Col> = {}): Col => ({ kind: 'int', ...o });
const date = (o: Partial<Col> = {}): Col => ({ kind: 'date', ...o });
const ts = (o: Partial<Col> = {}): Col => ({ kind: 'timestamptz', ...o });
const en = (e: EnumName, o: Partial<Col> = {}): Col => ({ kind: 'enum', enum: e, ...o });

const isNull = (v: unknown) => v === null || v === undefined;
const between = (label: string, v: unknown, lo: number, hi: number) =>
  isNull(v) || (typeof v === 'number' && v >= lo && v <= hi) ? null : `${label} must be between ${lo} and ${hi}`;

export const TABLES: TableDef[] = [
  {
    name: 'users',
    columns: {
      id,
      email: text({ max: 320 }),
      password_hash: text(),
      name: text({ max: 120 }),
      avatar_url: text({ nullable: true }),
      date_of_birth: date({ nullable: true }),
      role: en('user_role', { default: 'USER' }),
      email_verified_at: ts({ nullable: true }),
      created_at: createdAt,
      updated_at: updatedAt,
    },
    unique: [['email']],
    checks: [],
  },
  {
    name: 'health_profiles',
    columns: {
      id,
      user_id: fk('users', 'CASCADE'),
      height_cm: { kind: 'numeric', nullable: true },
      weight_kg: { kind: 'numeric', nullable: true },
      cycle_length_average: int({ nullable: true }),
      period_length_average: int({ nullable: true }),
      health_goals: { kind: 'enum[]', enum: 'health_goal', default: [] },
      created_at: createdAt,
      updated_at: updatedAt,
    },
    unique: [['user_id']],
    checks: [
      (r) => (isNull(r.height_cm) || r.height_cm > 0 ? null : 'height_cm must be > 0'),
      (r) => (isNull(r.weight_kg) || r.weight_kg > 0 ? null : 'weight_kg must be > 0'),
      (r) => between('cycle_length_average', r.cycle_length_average, 15, 90),
      (r) => between('period_length_average', r.period_length_average, 1, 20),
    ],
  },
  {
    name: 'symptoms',
    columns: {
      id,
      name: text({ max: 100 }),
      slug: text({ max: 120 }),
      category: en('symptom_category'),
      description: text({ nullable: true }),
      created_at: createdAt,
    },
    unique: [['name'], ['slug']],
    checks: [],
  },
  {
    name: 'moods',
    columns: { id, name: text({ max: 50 }), score: int(), created_at: createdAt },
    unique: [['name'], ['score']],
    checks: [(r) => between('score', r.score, 1, 5)],
  },
  {
    name: 'menstrual_cycles',
    columns: {
      id,
      user_id: fk('users', 'CASCADE'),
      start_date: date(),
      end_date: date({ nullable: true }),
      cycle_length: int({ nullable: true }),
      notes: text({ nullable: true }),
      created_at: createdAt,
      updated_at: updatedAt,
    },
    unique: [],
    checks: [
      (r) => (isNull(r.end_date) || r.end_date >= r.start_date ? null : 'end_date must be >= start_date'),
      (r) => between('cycle_length', r.cycle_length, 1, 120),
    ],
  },
  {
    name: 'period_logs',
    columns: {
      id,
      cycle_id: fk('menstrual_cycles', 'CASCADE'),
      log_date: date(),
      flow_level: en('flow_level'),
      notes: text({ nullable: true }),
      created_at: createdAt,
    },
    unique: [['cycle_id', 'log_date']],
    checks: [],
  },
  {
    name: 'cycle_symptoms',
    columns: {
      id,
      cycle_id: fk('menstrual_cycles', 'CASCADE'),
      symptom_id: fk('symptoms', 'RESTRICT'),
      log_date: date(),
      severity: int(),
      notes: text({ nullable: true }),
      created_at: createdAt,
    },
    unique: [['cycle_id', 'symptom_id', 'log_date']],
    checks: [(r) => between('severity', r.severity, 1, 5)],
  },
  {
    name: 'daily_checkins',
    columns: {
      id,
      user_id: fk('users', 'CASCADE'),
      checkin_date: date(),
      energy_score: int(),
      stress_score: int(),
      mood_id: fk('moods', 'SET NULL', true),
      notes: text({ nullable: true }),
      created_at: createdAt,
      updated_at: updatedAt,
    },
    unique: [['user_id', 'checkin_date']],
    checks: [(r) => between('energy_score', r.energy_score, 1, 5), (r) => between('stress_score', r.stress_score, 1, 5)],
  },
  {
    name: 'checkin_symptoms',
    columns: {
      id,
      daily_checkin_id: fk('daily_checkins', 'CASCADE'),
      symptom_id: fk('symptoms', 'RESTRICT'),
      severity: int(),
      created_at: createdAt,
    },
    unique: [['daily_checkin_id', 'symptom_id']],
    checks: [(r) => between('severity', r.severity, 1, 5)],
  },
  {
    name: 'sleep_logs',
    columns: {
      id,
      user_id: fk('users', 'CASCADE'),
      sleep_date: date(),
      bedtime: ts({ nullable: true }),
      wake_time: ts({ nullable: true }),
      duration_minutes: int(),
      quality_score: int({ nullable: true }),
      notes: text({ nullable: true }),
      created_at: createdAt,
      updated_at: updatedAt,
    },
    unique: [['user_id', 'sleep_date']],
    checks: [
      (r) => between('duration_minutes', r.duration_minutes, 0, 1440),
      (r) => between('quality_score', r.quality_score, 1, 5),
      (r) => (isNull(r.wake_time) || isNull(r.bedtime) || Date.parse(r.wake_time) > Date.parse(r.bedtime) ? null : 'wake_time must be after bedtime'),
    ],
  },
  {
    name: 'hydration_logs',
    columns: { id, user_id: fk('users', 'CASCADE'), log_date: date(), amount_ml: int(), created_at: createdAt },
    unique: [],
    checks: [(r) => between('amount_ml', r.amount_ml, 1, 10000)],
  },
  {
    name: 'activity_logs',
    columns: {
      id,
      user_id: fk('users', 'CASCADE'),
      activity_date: date(),
      activity_type: en('activity_type'),
      duration_minutes: int(),
      intensity: en('activity_intensity', { nullable: true }),
      notes: text({ nullable: true }),
      created_at: createdAt,
    },
    unique: [],
    checks: [(r) => between('duration_minutes', r.duration_minutes, 1, 1440)],
  },
  {
    name: 'wellness_scores',
    columns: {
      id,
      user_id: fk('users', 'CASCADE'),
      score_date: date(),
      overall_score: int(),
      energy_score: int({ nullable: true }),
      sleep_score: int({ nullable: true }),
      mood_score: int({ nullable: true }),
      hydration_score: int({ nullable: true }),
      activity_score: int({ nullable: true }),
      cycle_score: int({ nullable: true }),
      data_completeness: int({ default: 0 }),
      calculation_version: text({ max: 30, default: '1.0' }),
      created_at: createdAt,
    },
    unique: [['user_id', 'score_date']],
    checks: [
      (r) => between('overall_score', r.overall_score, 0, 100),
      (r) => between('energy_score', r.energy_score, 0, 100),
      (r) => between('sleep_score', r.sleep_score, 0, 100),
      (r) => between('mood_score', r.mood_score, 0, 100),
      (r) => between('hydration_score', r.hydration_score, 0, 100),
      (r) => between('activity_score', r.activity_score, 0, 100),
      (r) => between('cycle_score', r.cycle_score, 0, 100),
      (r) => between('data_completeness', r.data_completeness, 0, 100),
    ],
  },
  {
    name: 'health_insights',
    columns: {
      id,
      user_id: fk('users', 'CASCADE'),
      type: en('insight_type'),
      title: text({ max: 180 }),
      description: text(),
      recommendation: text({ nullable: true }),
      severity: en('insight_severity', { default: 'INFO' }),
      source: en('insight_source', { default: 'HEALTH_ENGINE' }),
      confidence: { kind: 'numeric', nullable: true },
      metadata: { kind: 'jsonb', nullable: true },
      generated_at: { kind: 'timestamptz', default: 'now' },
      expires_at: ts({ nullable: true }),
      created_at: createdAt,
    },
    unique: [],
    checks: [
      (r) => between('confidence', r.confidence, 0, 1),
      (r) => (isNull(r.expires_at) || Date.parse(r.expires_at) >= Date.parse(r.generated_at) ? null : 'expires_at must be >= generated_at'),
    ],
  },
  {
    name: 'journal_entries',
    columns: {
      id,
      user_id: fk('users', 'CASCADE'),
      title: text({ max: 180, nullable: true }),
      content: text(),
      mood_id: fk('moods', 'SET NULL', true),
      entry_date: date(),
      created_at: createdAt,
      updated_at: updatedAt,
    },
    unique: [],
    checks: [],
  },
  {
    name: 'notifications',
    columns: {
      id,
      user_id: fk('users', 'CASCADE'),
      type: en('notification_type'),
      title: text({ max: 180 }),
      message: text(),
      read_at: ts({ nullable: true }),
      scheduled_at: ts({ nullable: true }),
      created_at: createdAt,
    },
    unique: [],
    checks: [],
  },
  {
    name: 'user_settings',
    columns: {
      id,
      user_id: fk('users', 'CASCADE'),
      timezone: text({ max: 64, default: 'Asia/Jakarta' }),
      language: text({ max: 10, default: 'id-ID' }),
      daily_checkin_enabled: { kind: 'bool', default: true },
      notification_enabled: { kind: 'bool', default: true },
      created_at: createdAt,
      updated_at: updatedAt,
    },
    unique: [['user_id']],
    checks: [],
  },
  {
    name: 'auth_tokens',
    columns: {
      id,
      user_id: fk('users', 'CASCADE'),
      token_hash: text(),
      token_type: text({ max: 30 }),
      expires_at: ts(),
      used_at: ts({ nullable: true }),
      created_at: createdAt,
    },
    unique: [['token_hash']],
    checks: [],
  },
];

/** Urutan di atas sudah aman untuk INSERT (induk sebelum anak). */
export const TABLE_ORDER: TableName[] = TABLES.map((t) => t.name);
export const TABLE_BY_NAME = Object.fromEntries(TABLES.map((t) => [t.name, t])) as Record<TableName, TableDef>;

export const enumValues = (name: EnumName): readonly string[] => ENUMS[name];
