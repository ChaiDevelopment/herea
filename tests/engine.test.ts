import { describe, it, expect } from 'vitest';
import { averageCycleLength, cycleDay, detectPhase, predictNextPeriod, calculateWellnessScore, detectRedFlags, analyzeCycleHistory, generateInsights } from '../health-engine/index.js';

describe('health intelligence engine', () => {
  it('calculates cycle history safely', () => {
    expect(averageCycleLength([new Date('2025-01-01'), new Date('2025-01-29')])).toBe(28);
    expect(cycleDay(new Date('2025-01-01'), new Date('2025-01-05'))).toBe(5);
    expect(detectPhase(14, 28)).toBe('Likely ovulatory window');
    expect(predictNextPeriod(new Date('2025-01-01'), 28)?.toISOString().slice(0, 10)).toBe('2025-01-29');
  });
  it('does not score missing signals as zero', () => expect(calculateWellnessScore({}).score).toBeUndefined());
  it('detects conservative red flags', () => expect(detectRedFlags([{ name: 'chest pain', severity: 1 }]).length).toBe(1));
});

describe('red flags with the app symptom list', () => {
  it('flags high dizziness but not mild symptoms', () => {
    expect(detectRedFlags([{ name: 'Dizziness', severity: 4 }])).toHaveLength(1);
    expect(detectRedFlags([{ name: 'Dizziness', severity: 2 }])).toHaveLength(0);
    expect(detectRedFlags([{ name: 'Cramps', severity: 3 }, { name: 'Bloating', severity: 5 }])).toHaveLength(0);
  });
  it('flags pain only at the top of the scale', () => {
    expect(detectRedFlags([{ name: 'Cramps', severity: 4 }])).toHaveLength(0);
    expect(detectRedFlags([{ name: 'Cramps', severity: 5 }])).toHaveLength(1);
  });
});

describe('wellness score components', () => {
  it('returns per-signal components and a completeness count', () => {
    const r = calculateWellnessScore({ sleepHours: 8, moodScore: 4, energy: 3, stress: 1 });
    expect(r.completeness).toBe(4);
    expect(r.components).toEqual({ sleep: 100, mood: 80, energy: 60, stress: 100 });
    expect(r.score).toBe(85);
  });
});

describe('cycle analysis', () => {
  it('flags a period seven days beyond its estimate', () => {
    const result = analyzeCycleHistory([new Date('2025-01-01'), new Date('2025-01-29')], undefined, new Date('2025-03-06'));
    expect(result.status).toBe('LATE');
    expect(result.delayDays).toBe(8);
  });
});

describe('insight generator', () => {
  it('produces drafts shaped like health_insights rows', () => {
    const [flag, snapshot] = generateInsights({ symptoms: [{ name: 'Dizziness', severity: 5 }], score: 70 });
    expect(flag).toMatchObject({ type: 'RED_FLAG', severity: 'HIGH', source: 'HEALTH_ENGINE' });
    expect(snapshot).toMatchObject({ type: 'WELLNESS', severity: 'INFO' });
    expect(snapshot.description).toContain('70/100');
  });
  it('adds a cycle insight when late', () => {
    const out = generateInsights({ symptoms: [], cycle: { status: 'LATE', delayDays: 9, irregular: false, message: 'm', guidance: 'g' } });
    expect(out.map((i) => i.type)).toEqual(['CYCLE']);
  });
  it('returns nothing without data', () => expect(generateInsights({ symptoms: [] })).toEqual([]));
});
