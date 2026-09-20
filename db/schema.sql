-- HERÉA Women's Health & Wellness
-- PostgreSQL schema
-- Safe to execute on a fresh database.
-- This schema stores wellness/health tracking data; clinical diagnosis is intentionally
-- NOT represented as a database concept.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('USER', 'ADMIN');
CREATE TYPE symptom_category AS ENUM (
  'MENSTRUAL', 'DIGESTIVE', 'NEUROLOGICAL', 'EMOTIONAL',
  'SKIN', 'ENERGY', 'REPRODUCTIVE', 'GENERAL'
);
CREATE TYPE flow_level AS ENUM ('SPOTTING', 'LIGHT', 'MEDIUM', 'HEAVY');
CREATE TYPE insight_type AS ENUM (
  'CYCLE', 'SLEEP', 'HYDRATION', 'ACTIVITY', 'MOOD',
  'SYMPTOM', 'WELLNESS', 'PATTERN', 'RECOMMENDATION', 'RED_FLAG'
);
CREATE TYPE insight_severity AS ENUM ('INFO', 'LOW', 'MODERATE', 'HIGH');
CREATE TYPE insight_source AS ENUM ('RULE_ENGINE', 'HEALTH_ENGINE', 'SYSTEM');
CREATE TYPE activity_type AS ENUM (
  'WALKING', 'RUNNING', 'WORKOUT', 'STRETCHING',
  'YOGA', 'CYCLING', 'OTHER'
);
CREATE TYPE activity_intensity AS ENUM ('LOW', 'MODERATE', 'HIGH');
CREATE TYPE notification_type AS ENUM (
  'REMINDER', 'INSIGHT', 'CYCLE', 'CHECKIN', 'SYSTEM'
);
CREATE TYPE health_goal AS ENUM (
  'BETTER_SLEEP', 'WEIGHT_MANAGEMENT', 'HORMONAL_WELLNESS',
  'MENSTRUAL_HEALTH', 'STRESS_MANAGEMENT', 'NUTRITION',
  'GENERAL_WELLNESS', 'FITNESS'
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(320) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name VARCHAR(120) NOT NULL,
  avatar_url TEXT,
  date_of_birth DATE,
  role user_role NOT NULL DEFAULT 'USER',
  email_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE health_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  height_cm NUMERIC(5,2),
  weight_kg NUMERIC(6,2),
  cycle_length_average SMALLINT,
  period_length_average SMALLINT,
  health_goals health_goal[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT health_profile_height_chk CHECK (height_cm IS NULL OR height_cm > 0),
  CONSTRAINT health_profile_weight_chk CHECK (weight_kg IS NULL OR weight_kg > 0),
  CONSTRAINT health_profile_cycle_chk CHECK (
    cycle_length_average IS NULL OR cycle_length_average BETWEEN 15 AND 90
  ),
  CONSTRAINT health_profile_period_chk CHECK (
    period_length_average IS NULL OR period_length_average BETWEEN 1 AND 20
  )
);

CREATE TABLE symptoms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(120) NOT NULL UNIQUE,
  category symptom_category NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE moods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL UNIQUE,
  score SMALLINT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT mood_score_chk CHECK (score BETWEEN 1 AND 5)
);

CREATE TABLE menstrual_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE,
  cycle_length SMALLINT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cycle_dates_chk CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT cycle_length_chk CHECK (cycle_length IS NULL OR cycle_length BETWEEN 1 AND 120)
);

CREATE TABLE period_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES menstrual_cycles(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  flow_level flow_level NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cycle_id, log_date)
);

CREATE TABLE cycle_symptoms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES menstrual_cycles(id) ON DELETE CASCADE,
  symptom_id UUID NOT NULL REFERENCES symptoms(id) ON DELETE RESTRICT,
  log_date DATE NOT NULL,
  severity SMALLINT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cycle_symptom_severity_chk CHECK (severity BETWEEN 1 AND 5),
  UNIQUE (cycle_id, symptom_id, log_date)
);

CREATE TABLE daily_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  checkin_date DATE NOT NULL,
  energy_score SMALLINT NOT NULL,
  stress_score SMALLINT NOT NULL,
  mood_id UUID REFERENCES moods(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT checkin_energy_chk CHECK (energy_score BETWEEN 1 AND 5),
  CONSTRAINT checkin_stress_chk CHECK (stress_score BETWEEN 1 AND 5),
  UNIQUE (user_id, checkin_date)
);

CREATE TABLE checkin_symptoms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  daily_checkin_id UUID NOT NULL REFERENCES daily_checkins(id) ON DELETE CASCADE,
  symptom_id UUID NOT NULL REFERENCES symptoms(id) ON DELETE RESTRICT,
  severity SMALLINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT checkin_symptom_severity_chk CHECK (severity BETWEEN 1 AND 5),
  UNIQUE (daily_checkin_id, symptom_id)
);

CREATE TABLE sleep_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sleep_date DATE NOT NULL,
  bedtime TIMESTAMPTZ,
  wake_time TIMESTAMPTZ,
  duration_minutes INTEGER NOT NULL,
  quality_score SMALLINT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT sleep_duration_chk CHECK (duration_minutes BETWEEN 0 AND 1440),
  CONSTRAINT sleep_quality_chk CHECK (quality_score IS NULL OR quality_score BETWEEN 1 AND 5),
  CONSTRAINT sleep_times_chk CHECK (wake_time IS NULL OR bedtime IS NULL OR wake_time > bedtime),
  UNIQUE (user_id, sleep_date)
);

CREATE TABLE hydration_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  amount_ml INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT hydration_amount_chk CHECK (amount_ml BETWEEN 1 AND 10000)
);

CREATE TABLE activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_date DATE NOT NULL,
  activity_type activity_type NOT NULL,
  duration_minutes INTEGER NOT NULL,
  intensity activity_intensity,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT activity_duration_chk CHECK (duration_minutes BETWEEN 1 AND 1440)
);

CREATE TABLE wellness_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score_date DATE NOT NULL,
  overall_score SMALLINT NOT NULL,
  energy_score SMALLINT,
  sleep_score SMALLINT,
  mood_score SMALLINT,
  hydration_score SMALLINT,
  activity_score SMALLINT,
  cycle_score SMALLINT,
  data_completeness SMALLINT NOT NULL DEFAULT 0,
  calculation_version VARCHAR(30) NOT NULL DEFAULT '1.0',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT wellness_overall_chk CHECK (overall_score BETWEEN 0 AND 100),
  CONSTRAINT wellness_component_chk CHECK (
    (energy_score IS NULL OR energy_score BETWEEN 0 AND 100) AND
    (sleep_score IS NULL OR sleep_score BETWEEN 0 AND 100) AND
    (mood_score IS NULL OR mood_score BETWEEN 0 AND 100) AND
    (hydration_score IS NULL OR hydration_score BETWEEN 0 AND 100) AND
    (activity_score IS NULL OR activity_score BETWEEN 0 AND 100) AND
    (cycle_score IS NULL OR cycle_score BETWEEN 0 AND 100)
  ),
  CONSTRAINT wellness_completeness_chk CHECK (data_completeness BETWEEN 0 AND 100),
  UNIQUE (user_id, score_date)
);

CREATE TABLE health_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type insight_type NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  recommendation TEXT,
  severity insight_severity NOT NULL DEFAULT 'INFO',
  source insight_source NOT NULL DEFAULT 'HEALTH_ENGINE',
  confidence NUMERIC(4,3),
  metadata JSONB,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT insight_confidence_chk CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  CONSTRAINT insight_expiry_chk CHECK (expires_at IS NULL OR expires_at >= generated_at)
);

CREATE TABLE journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(180),
  content TEXT NOT NULL,
  mood_id UUID REFERENCES moods(id) ON DELETE SET NULL,
  entry_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Jakarta',
  language VARCHAR(10) NOT NULL DEFAULT 'id-ID',
  daily_checkin_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  notification_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE auth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  token_type VARCHAR(30) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cycles_user_start ON menstrual_cycles(user_id, start_date DESC);
CREATE INDEX idx_period_logs_cycle_date ON period_logs(cycle_id, log_date);
CREATE INDEX idx_cycle_symptoms_cycle_date ON cycle_symptoms(cycle_id, log_date);
CREATE INDEX idx_cycle_symptoms_symptom ON cycle_symptoms(symptom_id);
CREATE INDEX idx_checkins_user_date ON daily_checkins(user_id, checkin_date DESC);
CREATE INDEX idx_checkin_symptoms_checkin ON checkin_symptoms(daily_checkin_id);
CREATE INDEX idx_sleep_user_date ON sleep_logs(user_id, sleep_date DESC);
CREATE INDEX idx_hydration_user_date ON hydration_logs(user_id, log_date DESC);
CREATE INDEX idx_activity_user_date ON activity_logs(user_id, activity_date DESC);
CREATE INDEX idx_wellness_user_date ON wellness_scores(user_id, score_date DESC);
CREATE INDEX idx_insights_user_generated ON health_insights(user_id, generated_at DESC);
CREATE INDEX idx_insights_user_active ON health_insights(user_id, expires_at);
CREATE INDEX idx_journal_user_date ON journal_entries(user_id, entry_date DESC);
CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX idx_auth_tokens_user_type ON auth_tokens(user_id, token_type);

INSERT INTO symptoms (name, slug, category, description) VALUES
('Cramps', 'cramps', 'MENSTRUAL', 'Menstrual or pelvic cramping'),
('Headache', 'headache', 'NEUROLOGICAL', 'Head or tension discomfort'),
('Bloating', 'bloating', 'DIGESTIVE', 'Feeling of abdominal fullness or swelling'),
('Nausea', 'nausea', 'DIGESTIVE', 'Feeling of nausea'),
('Fatigue', 'fatigue', 'ENERGY', 'Feeling unusually tired or low in energy'),
('Acne', 'acne', 'SKIN', 'Acne or skin breakout'),
('Breast tenderness', 'breast_tenderness', 'REPRODUCTIVE', 'Breast tenderness or sensitivity'),
('Back pain', 'back_pain', 'GENERAL', 'Back discomfort'),
('Dizziness', 'dizziness', 'NEUROLOGICAL', 'Feeling dizzy or lightheaded'),
('Appetite change', 'appetite_change', 'GENERAL', 'Change in appetite')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO moods (name, score) VALUES
('Very low', 1),
('Low', 2),
('Neutral', 3),
('Good', 4),
('Excellent', 5)
ON CONFLICT (name) DO NOTHING;

COMMIT;
