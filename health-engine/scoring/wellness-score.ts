export type Signals = {
  sleepHours?: number;
  hydrationMl?: number;
  /** Nama enum lama (VERY_LOW..GREAT). Dipertahankan agar kompatibel. */
  mood?: string;
  /** Skor mood 1–5 (kolom moods.score). Diutamakan bila ada. */
  moodScore?: number;
  energy?: number;
  activityMinutes?: number;
  stress?: number;
};

export type ScoreComponents = Partial<Record<'sleep' | 'hydration' | 'mood' | 'energy' | 'activity' | 'stress', number>>;

/** Jumlah sinyal yang dapat menyumbang skor. */
export const TOTAL_SIGNALS = 6;
export const CALCULATION_VERSION = '1.0';

const clamp = (n: number) => Math.min(100, Math.max(0, n));
const LEGACY_MOOD: Record<string, number> = { VERY_LOW: 20, LOW: 40, NEUTRAL: 60, GOOD: 80, GREAT: 100 };

/** Sinyal yang tidak ada TIDAK dihitung sebagai nol. */
export function calculateWellnessScore(s: Signals) {
  const components: ScoreComponents = {};
  if (s.sleepHours != null) components.sleep = clamp(100 - Math.abs(s.sleepHours - 8) * 16);
  if (s.hydrationMl != null) components.hydration = clamp(s.hydrationMl / 20);
  if (s.moodScore != null) components.mood = clamp(s.moodScore * 20);
  else if (s.mood) components.mood = LEGACY_MOOD[s.mood] ?? 60;
  if (s.energy != null) components.energy = clamp(s.energy * 20);
  if (s.activityMinutes != null) components.activity = clamp(s.activityMinutes * 2);
  if (s.stress != null) components.stress = clamp(120 - s.stress * 20);
  const values = Object.values(components) as number[];
  return {
    score: values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : undefined,
    completeness: values.length,
    components,
  };
}
