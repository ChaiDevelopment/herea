import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { Database, DbError } from '../src/db/database.js';
import { checkDataset, readDataset } from '../src/db/integrity.js';

let dir: string;
let db: Database;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'herea-store-'));
  db = new Database(dir);
  db.seedReferenceData();
});
const user = (email = 'a@example.com') => db.users.insert({ email, password_hash: 'x', name: 'A' });
const code = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as DbError).code; } return 'NO_ERROR'; };

describe('JSON store mirrors PostgreSQL rules', () => {
  it('creates one file per table and seeds symptoms and moods', () => {
    expect(fs.readdirSync(dir).filter((f) => f.endsWith('.json'))).toHaveLength(18);
    expect(db.symptoms.all()).toHaveLength(10);
    expect(db.moods.all().map((m) => m.score)).toEqual([1, 2, 3, 4, 5]);
  });

  it('uses fixed seed ids so re-seeding never duplicates', () => {
    const ids = db.symptoms.all().map((s) => s.id);
    db.seedReferenceData();
    expect(db.symptoms.all().map((s) => s.id)).toEqual(ids);
  });

  it('fills defaults (uuid, timestamps, enum default)', () => {
    const u = user();
    expect(u.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(u.role).toBe('USER');
    expect(Date.parse(u.created_at)).not.toBeNaN();
  });

  it('enforces UNIQUE, NOT NULL, enum and CHECK', () => {
    const u = user();
    expect(code(() => user())).toBe('UNIQUE');
    expect(code(() => db.users.insert({ email: 'b@example.com', password_hash: 'x' }))).toBe('INVALID');
    expect(code(() => db.users.insert({ email: 'c@example.com', password_hash: 'x', name: 'C', role: 'ROOT' as never }))).toBe('INVALID');
    expect(code(() => db.menstrual_cycles.insert({ user_id: u.id, start_date: '2026-01-10', end_date: '2026-01-01' }))).toBe('INVALID');
    expect(code(() => db.hydration_logs.insert({ user_id: u.id, log_date: '2026-02-30', amount_ml: 1 }))).toBe('INVALID');
    expect(code(() => db.hydration_logs.insert({ user_id: u.id, log_date: '2026-01-01', amount_ml: 0 }))).toBe('INVALID');
  });

  it('enforces foreign keys', () => {
    expect(code(() => db.menstrual_cycles.insert({ user_id: '11111111-1111-4111-8111-111111111111', start_date: '2026-01-01' }))).toBe('FOREIGN_KEY');
  });

  it('cascades deletes, restricts symptom deletes, and nulls moods', () => {
    const u = user();
    const cycle = db.menstrual_cycles.insert({ user_id: u.id, start_date: '2026-01-01' });
    db.period_logs.insert({ cycle_id: cycle.id, log_date: '2026-01-01', flow_level: 'LIGHT' });
    const symptom = db.symptoms.all()[0];
    db.cycle_symptoms.insert({ cycle_id: cycle.id, symptom_id: symptom.id, log_date: '2026-01-01', severity: 3 });
    const mood = db.moods.all()[0];
    const checkin = db.daily_checkins.insert({ user_id: u.id, checkin_date: '2026-01-01', energy_score: 3, stress_score: 3, mood_id: mood.id });

    expect(code(() => db.symptoms.remove(symptom.id))).toBe('RESTRICT');
    db.moods.remove(mood.id);
    expect(db.daily_checkins.get(checkin.id)!.mood_id).toBeNull();

    db.users.remove(u.id);
    for (const t of ['menstrual_cycles', 'period_logs', 'cycle_symptoms', 'daily_checkins'] as const) expect(db.table(t).all()).toHaveLength(0);
  });

  it('treats NULLs as distinct in UNIQUE like PostgreSQL', () => {
    const u = user();
    db.auth_tokens.insert({ user_id: u.id, token_hash: 'h1', token_type: 'RESET', expires_at: new Date().toISOString() });
    expect(code(() => db.auth_tokens.insert({ user_id: u.id, token_hash: 'h1', token_type: 'RESET', expires_at: new Date().toISOString() }))).toBe('UNIQUE');
  });

  it('persists to disk and reloads', () => {
    const u = user();
    const again = new Database(dir);
    expect(again.users.get(u.id)?.email).toBe('a@example.com');
    expect(fs.readdirSync(dir).some((f) => f.endsWith('.tmp'))).toBe(false);
  });

  it('refuses to overwrite a corrupted file', () => {
    fs.writeFileSync(path.join(dir, 'users.json'), '{not json');
    expect(() => new Database(dir)).toThrow(/Cannot read/);
    expect(fs.readFileSync(path.join(dir, 'users.json'), 'utf8')).toBe('{not json');
  });

  it('data checker passes on valid data and catches hand-edit mistakes', () => {
    const u = user();
    db.menstrual_cycles.insert({ user_id: u.id, start_date: '2026-01-01' });
    expect(checkDataset(readDataset(dir))).toEqual([]);
    const file = path.join(dir, 'menstrual_cycles.json');
    const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
    rows[0].user_id = '22222222-2222-4222-8222-222222222222';
    rows[0].cycle_length = 500;
    fs.writeFileSync(file, JSON.stringify(rows));
    const problems = checkDataset(readDataset(dir)).join('\n');
    expect(problems).toContain('does not exist');
    expect(problems).toContain('cycle_length');
  });
});
