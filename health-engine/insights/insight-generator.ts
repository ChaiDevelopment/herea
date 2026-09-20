import { detectRedFlags } from '../symptoms/red-flag-detector.js';
import { gentleRecommendation } from './recommendation-engine.js';

export type InsightSeverity = 'INFO' | 'LOW' | 'MODERATE' | 'HIGH';
export type InsightType = 'RED_FLAG' | 'CYCLE' | 'PATTERN' | 'WELLNESS';

/** Bentuk draft ini cocok dengan kolom tabel health_insights. */
export type InsightDraft = {
  /** Kunci stabil untuk mencegah duplikasi insight pada hari yang sama. */
  key: string;
  type: InsightType;
  title: string;
  description: string;
  recommendation: string | null;
  severity: InsightSeverity;
  source: 'HEALTH_ENGINE';
};

export type CycleSummary = {
  status: 'LATE' | 'ON_TRACK' | 'NEED_HISTORY';
  delayDays: number;
  irregular: boolean;
  message: string;
  guidance: string;
};

export function generateInsights(input: { symptoms: { name: string; severity: number }[]; score?: number; cycle?: CycleSummary }): InsightDraft[] {
  const out: InsightDraft[] = [];

  if (detectRedFlags(input.symptoms).length) {
    out.push({
      key: 'red_flag',
      type: 'RED_FLAG',
      title: 'A gentle safety note',
      description: 'Some symptoms you logged may warrant professional medical attention. If this feels urgent, seek local emergency care.',
      recommendation: 'Consider speaking with a qualified healthcare professional about these symptoms.',
      severity: 'HIGH',
      source: 'HEALTH_ENGINE',
    });
  }

  if (input.cycle?.status === 'LATE') {
    out.push({
      key: 'cycle_late',
      type: 'CYCLE',
      title: 'Periode mungkin terlambat',
      description: input.cycle.message,
      recommendation: input.cycle.guidance,
      severity: 'MODERATE',
      source: 'HEALTH_ENGINE',
    });
  } else if (input.cycle?.irregular) {
    out.push({
      key: 'cycle_irregular',
      type: 'PATTERN',
      title: 'Pola siklus bervariasi',
      description: 'Panjang siklus yang tercatat cukup bervariasi.',
      recommendation: input.cycle.guidance,
      severity: 'LOW',
      source: 'HEALTH_ENGINE',
    });
  }

  if (input.score !== undefined) {
    out.push({
      key: 'wellness_snapshot',
      type: 'WELLNESS',
      title: 'Your wellness snapshot',
      description: `Based on your logged data, your wellness indicator is ${input.score}/100. This is a wellness signal, not a medical assessment.`,
      recommendation: gentleRecommendation(input.score),
      severity: 'INFO',
      source: 'HEALTH_ENGINE',
    });
  }

  return out;
}
