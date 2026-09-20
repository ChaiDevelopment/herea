import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { Database } from '../src/db/database.js';
import { checkDataset, readDataset } from '../src/db/integrity.js';
import { todayIn, addDays } from '../src/lib/dates.js';

let server: Server;
let base: string;
let dir: string;
let db: Database;

beforeAll(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'herea-api-'));
  db = new Database(dir);
  db.seedReferenceData();
  const app = createApp(db, { jwtSecret: 'test-secret-test-secret', publicDir: path.resolve('public'), disableRateLimit: true });
  await new Promise<void>((ok) => { server = app.listen(0, () => ok()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(() => server.close());

async function call(method: string, url: string, token?: string, body?: unknown) {
  const res = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
async function signup(email: string) {
  const r = await call('POST', '/auth/register', undefined, { name: 'Test', email, password: 'password123', timezone: 'Asia/Jakarta' });
  expect(r.status).toBe(201);
  return r.body.token as string;
}
const today = () => todayIn('Asia/Jakarta');

describe('auth', () => {
  it('registers, rejects duplicates, logs in, and hides the password hash', async () => {
    const token = await signup('Auth@Example.com');
    expect((await call('POST', '/auth/register', undefined, { name: 'X', email: 'auth@example.com', password: 'password123' })).status).toBe(409);
    expect((await call('POST', '/auth/login', undefined, { email: 'auth@example.com', password: 'wrong-password' })).status).toBe(401);
    expect((await call('POST', '/auth/login', undefined, { email: 'AUTH@example.com', password: 'password123' })).status).toBe(200);
    const me = await call('GET', '/profile', token);
    expect(me.body.email).toBe('auth@example.com');
    expect(me.body.password_hash).toBeUndefined();
    expect((await call('GET', '/profile')).status).toBe(401);
    expect((await call('GET', '/profile', 'garbage')).status).toBe(401);
  });
  it('requires a name and an 8+ character password', async () => {
    expect((await call('POST', '/auth/register', undefined, { email: 'n@example.com', password: 'password123' })).status).toBe(400);
    expect((await call('POST', '/auth/register', undefined, { name: 'N', email: 'n@example.com', password: 'short' })).status).toBe(400);
  });
});

describe('tracking flow', () => {
  let token: string;
  beforeAll(async () => { token = await signup('flow@example.com'); });

  it('derives cycle_length from consecutive start dates and rejects bad dates', async () => {
    const t = today();
    for (const d of [addDays(t, -60), addDays(t, -31), addDays(t, -3)]) expect((await call('POST', '/cycles', token, { start_date: d })).status).toBe(201);
    expect((await call('POST', '/cycles', token, { start_date: addDays(t, -3) })).status).toBe(409);
    expect((await call('POST', '/cycles', token, { start_date: addDays(t, 2) })).status).toBe(400);
    expect((await call('POST', '/cycles', token, { start_date: addDays(t, -10), end_date: addDays(t, -12) })).status).toBe(400);
    const list = (await call('GET', '/cycles', token)).body;
    expect(list.map((c: any) => c.cycle_length)).toEqual([null, 28, 29]);
    const analysis = (await call('GET', '/cycle-analysis', token)).body;
    expect(analysis.average_length).toBe(29);
    expect(analysis.status).toBe('ON_TRACK');
    // menghapus siklus tengah menghitung ulang panjang
    await call('DELETE', `/cycles/${list[1].id}`, token);
    expect((await call('GET', '/cycles', token)).body.map((c: any) => c.cycle_length)).toEqual([null, 57]);
  });

  it('logs sleep (upsert), hydration (sum), activity (enum) and a check-in with symptoms', async () => {
    const moods = (await call('GET', '/moods', token)).body;
    const symptoms = (await call('GET', '/symptoms', token)).body;
    const dizzy = symptoms.find((s: any) => s.slug === 'dizziness');
    expect((await call('POST', '/sleep', token, { duration_minutes: 450 })).status).toBe(201);
    expect((await call('POST', '/sleep', token, { duration_minutes: 480 })).status).toBe(200);
    await call('POST', '/hydration', token, { amount_ml: 500 });
    await call('POST', '/hydration', token, { amount_ml: 700 });
    expect((await call('POST', '/activity', token, { activity_type: 'jogging', duration_minutes: 20 })).status).toBe(400);
    expect((await call('POST', '/activity', token, { activity_type: 'YOGA', duration_minutes: 20, intensity: 'LOW' })).status).toBe(201);
    const ci = await call('POST', '/checkins', token, { mood_id: moods[3].id, energy_score: 4, stress_score: 2, symptoms: [{ symptom_id: dizzy.id, severity: 4 }] });
    expect(ci.status).toBe(201);
    expect((await call('POST', '/checkins', token, { mood_id: moods[3].id, energy_score: 5, stress_score: 2, symptoms: [] })).status).toBe(200); // upsert per hari

    const t = (await call('GET', '/today', token)).body;
    expect(t.hydration_ml).toBe(1200);
    expect(t.sleep.duration_minutes).toBe(480);
    expect(t.checkin.energy_score).toBe(5);
    expect(t.checkin.symptoms).toEqual([]);
    const score = (await call('GET', '/wellness/score', token)).body;
    expect(score.signals).toBe(6);
    expect(db.wellness_scores.all().filter((w) => w.score_date === today())).toHaveLength(1);
  });

  it('generates a red-flag insight from severe symptoms and clears it when the symptom is removed', async () => {
    const symptoms = (await call('GET', '/symptoms', token)).body;
    const dizzy = symptoms.find((s: any) => s.slug === 'dizziness');
    await call('POST', '/checkins', token, { energy_score: 3, stress_score: 3, symptoms: [{ symptom_id: dizzy.id, severity: 5 }] });
    let insights = (await call('GET', '/insights', token)).body;
    expect(insights[0]).toMatchObject({ type: 'RED_FLAG', severity: 'HIGH', source: 'HEALTH_ENGINE' });
    expect((await call('GET', '/insights', token)).body.filter((i: any) => i.type === 'RED_FLAG')).toHaveLength(1); // tidak menggandakan
    await call('POST', '/checkins', token, { energy_score: 3, stress_score: 3, symptoms: [] });
    insights = (await call('GET', '/insights', token)).body;
    expect(insights.some((i: any) => i.type === 'RED_FLAG')).toBe(false);
  });

  it('stores journal entries with content and mood', async () => {
    const moods = (await call('GET', '/moods', token)).body;
    const j = await call('POST', '/journal', token, { title: '', content: 'hello', mood_id: moods[0].id });
    expect(j.status).toBe(201);
    expect(j.body.title).toBeNull();
    expect((await call('POST', '/journal', token, { content: '   ' })).status).toBe(400);
    expect((await call('DELETE', `/journal/${j.body.id}`, token)).status).toBe(204);
  });

  it('never leaves data that violates schema.sql', () => {
    expect(checkDataset(readDataset(dir))).toEqual([]);
  });
});

describe('ownership and input safety', () => {
  it('hides other users’ rows and ignores mass-assignment', async () => {
    const a = await signup('owner-a@example.com');
    const b = await signup('owner-b@example.com');
    const sleep = (await call('POST', '/sleep', a, { duration_minutes: 400 })).body;
    expect((await call('PATCH', `/sleep/${sleep.id}`, b, { duration_minutes: 1 })).status).toBe(404);
    expect((await call('DELETE', `/sleep/${sleep.id}`, b)).status).toBe(404);
    expect((await call('PATCH', `/sleep/${sleep.id}`, a, { user_id: '11111111-1111-4111-8111-111111111111' })).status).toBe(400);
    expect((await call('GET', '/sleep', b)).body).toEqual([]);
    const cycle = (await call('POST', '/cycles', a, { start_date: addDays(today(), -5) })).body;
    expect((await call('GET', `/cycles/${cycle.id}`, b)).status).toBe(404);
    expect((await call('GET', '/cycles/not-a-uuid', a)).status).toBe(404);
  });
  it('returns JSON errors for malformed bodies and unknown routes', async () => {
    const t = await signup('bad@example.com');
    const res = await fetch(`${base}/cycles`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` }, body: '{oops' });
    expect(res.status).toBe(400);
    expect((await call('GET', '/nope', t)).status).toBe(404);
  });
});
