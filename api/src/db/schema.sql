-- Central Adaptor Service — Database Schema
-- PostgreSQL (compatible with Supabase)

-- Adaptor definitions
CREATE TABLE adaptors (
  id          TEXT PRIMARY KEY,           -- e.g. 'budget-direct-home'
  version     INTEGER NOT NULL DEFAULT 1,
  provider    TEXT NOT NULL,
  product_type TEXT NOT NULL,
  logo_url    TEXT NOT NULL DEFAULT '',
  start_url   TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  definition  JSONB NOT NULL,             -- full AdaptorDefinition JSON
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Individual step confidence tracking
CREATE TABLE step_health (
  id              SERIAL PRIMARY KEY,
  adaptor_id      TEXT NOT NULL REFERENCES adaptors(id),
  step_id         TEXT NOT NULL,
  field_path      TEXT,                   -- profilePath of the field, null for step-level
  primary_selector TEXT,
  success_count   INTEGER NOT NULL DEFAULT 0,
  failure_count   INTEGER NOT NULL DEFAULT 0,
  last_success    TIMESTAMPTZ,
  last_failure    TIMESTAMPTZ,
  confidence      REAL NOT NULL DEFAULT 0.5,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(adaptor_id, step_id, field_path)
);

-- User contributions
CREATE TABLE contributions (
  id              SERIAL PRIMARY KEY,
  adaptor_id      TEXT NOT NULL REFERENCES adaptors(id),
  step_id         TEXT,                   -- null for new steps
  type            TEXT NOT NULL,          -- verification, update, new_step, failure_report
  plugin_version  TEXT NOT NULL,
  page_url        TEXT,
  page_title      TEXT,
  payload         JSONB NOT NULL,         -- full StepContribution JSON
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending, processed, rejected
  processed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_contributions_adaptor ON contributions(adaptor_id, status);
CREATE INDEX idx_contributions_type ON contributions(type, status);
CREATE INDEX idx_step_health_adaptor ON step_health(adaptor_id);
CREATE INDEX idx_step_health_confidence ON step_health(confidence);

-- View: adaptor health summary
CREATE VIEW adaptor_health_summary AS
SELECT
  a.id AS adaptor_id,
  a.provider,
  a.version,
  a.enabled,
  COUNT(sh.id) AS tracked_selectors,
  AVG(sh.confidence) AS avg_confidence,
  MIN(sh.confidence) AS min_confidence,
  SUM(sh.success_count) AS total_successes,
  SUM(sh.failure_count) AS total_failures,
  MAX(sh.last_success) AS last_success,
  MAX(sh.last_failure) AS last_failure
FROM adaptors a
LEFT JOIN step_health sh ON sh.adaptor_id = a.id
GROUP BY a.id, a.provider, a.version, a.enabled;

-- View: pending contributions to review
CREATE VIEW pending_contributions AS
SELECT
  c.*,
  a.provider,
  a.version AS current_adaptor_version
FROM contributions c
JOIN adaptors a ON a.id = c.adaptor_id
WHERE c.status = 'pending'
ORDER BY c.created_at DESC;
