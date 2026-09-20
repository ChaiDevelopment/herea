/**
 * Tipe data yang mencerminkan db/schema.sql (PostgreSQL) 1:1.
 * Nama tabel, nama kolom (snake_case), dan nilai enum sama persis dengan SQL,
 * sehingga file JSON di data/ bisa langsung dipindahkan ke PostgreSQL.
 *
 * Konvensi format nilai di file JSON:
 *   UUID         -> string (crypto.randomUUID)
 *   DATE         -> "YYYY-MM-DD"
 *   TIMESTAMPTZ  -> ISO-8601 UTC, mis. "2026-09-19T10:15:00.000Z"
 *   NUMERIC/INT  -> number
 *   enum[]       -> array of string
 *   JSONB        -> object
 */

export const ENUMS = {
  user_role: ['USER', 'ADMIN'],
  symptom_category: ['MENSTRUAL', 'DIGESTIVE', 'NEUROLOGICAL', 'EMOTIONAL', 'SKIN', 'ENERGY', 'REPRODUCTIVE', 'GENERAL'],
  flow_level: ['SPOTTING', 'LIGHT', 'MEDIUM', 'HEAVY'],
  insight_type: ['CYCLE', 'SLEEP', 'HYDRATION', 'ACTIVITY', 'MOOD', 'SYMPTOM', 'WELLNESS', 'PATTERN', 'RECOMMENDATION', 'RED_FLAG'],
  insight_severity: ['INFO', 'LOW', 'MODERATE', 'HIGH'],
  insight_source: ['RULE_ENGINE', 'HEALTH_ENGINE', 'SYSTEM'],
  activity_type: ['WALKING', 'RUNNING', 'WORKOUT', 'STRETCHING', 'YOGA', 'CYCLING', 'OTHER'],
  activity_intensity: ['LOW', 'MODERATE', 'HIGH'],
  notification_type: ['REMINDER', 'INSIGHT', 'CYCLE', 'CHECKIN', 'SYSTEM'],
  health_goal: ['BETTER_SLEEP', 'WEIGHT_MANAGEMENT', 'HORMONAL_WELLNESS', 'MENSTRUAL_HEALTH', 'STRESS_MANAGEMENT', 'NUTRITION', 'GENERAL_WELLNESS', 'FITNESS'],
} as const;

export type EnumName = keyof typeof ENUMS;
export type EnumValue<N extends EnumName> = (typeof ENUMS)[N][number];

export type UserRole = EnumValue<'user_role'>;
export type SymptomCategory = EnumValue<'symptom_category'>;
export type FlowLevel = EnumValue<'flow_level'>;
export type InsightType = EnumValue<'insight_type'>;
export type InsightSeverity = EnumValue<'insight_severity'>;
export type InsightSource = EnumValue<'insight_source'>;
export type ActivityType = EnumValue<'activity_type'>;
export type ActivityIntensity = EnumValue<'activity_intensity'>;
export type NotificationType = EnumValue<'notification_type'>;
export type HealthGoal = EnumValue<'health_goal'>;

export interface User {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  avatar_url: string | null;
  date_of_birth: string | null;
  role: UserRole;
  email_verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface HealthProfile {
  id: string;
  user_id: string;
  height_cm: number | null;
  weight_kg: number | null;
  cycle_length_average: number | null;
  period_length_average: number | null;
  health_goals: HealthGoal[];
  created_at: string;
  updated_at: string;
}

export interface Symptom {
  id: string;
  name: string;
  slug: string;
  category: SymptomCategory;
  description: string | null;
  created_at: string;
}

export interface Mood {
  id: string;
  name: string;
  score: number;
  created_at: string;
}

export interface MenstrualCycle {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string | null;
  cycle_length: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface PeriodLog {
  id: string;
  cycle_id: string;
  log_date: string;
  flow_level: FlowLevel;
  notes: string | null;
  created_at: string;
}

export interface CycleSymptom {
  id: string;
  cycle_id: string;
  symptom_id: string;
  log_date: string;
  severity: number;
  notes: string | null;
  created_at: string;
}

export interface DailyCheckin {
  id: string;
  user_id: string;
  checkin_date: string;
  energy_score: number;
  stress_score: number;
  mood_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CheckinSymptom {
  id: string;
  daily_checkin_id: string;
  symptom_id: string;
  severity: number;
  created_at: string;
}

export interface SleepLog {
  id: string;
  user_id: string;
  sleep_date: string;
  bedtime: string | null;
  wake_time: string | null;
  duration_minutes: number;
  quality_score: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface HydrationLog {
  id: string;
  user_id: string;
  log_date: string;
  amount_ml: number;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  user_id: string;
  activity_date: string;
  activity_type: ActivityType;
  duration_minutes: number;
  intensity: ActivityIntensity | null;
  notes: string | null;
  created_at: string;
}

export interface WellnessScore {
  id: string;
  user_id: string;
  score_date: string;
  overall_score: number;
  energy_score: number | null;
  sleep_score: number | null;
  mood_score: number | null;
  hydration_score: number | null;
  activity_score: number | null;
  cycle_score: number | null;
  data_completeness: number;
  calculation_version: string;
  created_at: string;
}

export interface HealthInsight {
  id: string;
  user_id: string;
  type: InsightType;
  title: string;
  description: string;
  recommendation: string | null;
  severity: InsightSeverity;
  source: InsightSource;
  confidence: number | null;
  metadata: Record<string, unknown> | null;
  generated_at: string;
  expires_at: string | null;
  created_at: string;
}

export interface JournalEntry {
  id: string;
  user_id: string;
  title: string | null;
  content: string;
  mood_id: string | null;
  entry_date: string;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  read_at: string | null;
  scheduled_at: string | null;
  created_at: string;
}

export interface UserSettings {
  id: string;
  user_id: string;
  timezone: string;
  language: string;
  daily_checkin_enabled: boolean;
  notification_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuthToken {
  id: string;
  user_id: string;
  token_hash: string;
  token_type: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface Tables {
  users: User;
  health_profiles: HealthProfile;
  symptoms: Symptom;
  moods: Mood;
  menstrual_cycles: MenstrualCycle;
  period_logs: PeriodLog;
  cycle_symptoms: CycleSymptom;
  daily_checkins: DailyCheckin;
  checkin_symptoms: CheckinSymptom;
  sleep_logs: SleepLog;
  hydration_logs: HydrationLog;
  activity_logs: ActivityLog;
  wellness_scores: WellnessScore;
  health_insights: HealthInsight;
  journal_entries: JournalEntry;
  notifications: Notification;
  user_settings: UserSettings;
  auth_tokens: AuthToken;
}

export type TableName = keyof Tables;
