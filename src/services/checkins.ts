import type { Database } from '../db/database.js';
import type { DailyCheckin } from '../db/types.js';

export function checkinSymptoms(db: Database, checkinId: string) {
  return db.checkin_symptoms
    .filter((cs) => cs.daily_checkin_id === checkinId)
    .map((cs) => {
      const s = db.symptoms.get(cs.symptom_id)!;
      return { id: cs.id, symptom_id: s.id, name: s.name, slug: s.slug, severity: cs.severity };
    });
}

export function serializeCheckin(db: Database, c: DailyCheckin) {
  const mood = c.mood_id ? db.moods.get(c.mood_id) : undefined;
  return { ...c, mood: mood ? { id: mood.id, name: mood.name, score: mood.score } : null, symptoms: checkinSymptoms(db, c.id) };
}
