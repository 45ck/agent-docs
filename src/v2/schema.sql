-- SpecGraph v2 SQLite schema (v1)
-- All times are ISO 8601 text. IDs are text.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ── SPECS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS specs (
  spec_id       TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  state         TEXT NOT NULL,
  kind          TEXT NOT NULL,
  owner         TEXT,
  priority      TEXT,
  source_path   TEXT NOT NULL,
  source_hash   TEXT NOT NULL,
  raw_json      TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_specs_source ON specs(source_path);
CREATE INDEX IF NOT EXISTS idx_specs_state ON specs(state);
CREATE INDEX IF NOT EXISTS idx_specs_kind ON specs(kind);

-- ── SUBJECTS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subjects (
  subject_id    TEXT PRIMARY KEY,
  kind          TEXT NOT NULL,
  provider      TEXT NOT NULL,
  identity      TEXT NOT NULL,
  file_path     TEXT,
  line_number   INTEGER,
  meta_json     TEXT,
  first_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_subjects_kind ON subjects(kind);
CREATE INDEX IF NOT EXISTS idx_subjects_provider ON subjects(provider);
CREATE INDEX IF NOT EXISTS idx_subjects_file ON subjects(file_path);

-- ── CLAIMS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS claims (
  claim_id      TEXT PRIMARY KEY,
  src           TEXT NOT NULL,
  relation      TEXT NOT NULL,
  dst           TEXT NOT NULL,
  provider      TEXT NOT NULL,
  strength      INTEGER NOT NULL DEFAULT 0,
  provenance    TEXT NOT NULL,
  meta_json     TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  superseded_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_claims_src ON claims(src);
CREATE INDEX IF NOT EXISTS idx_claims_dst ON claims(dst);
CREATE INDEX IF NOT EXISTS idx_claims_relation ON claims(relation);
CREATE INDEX IF NOT EXISTS idx_claims_provider ON claims(provider);
CREATE INDEX IF NOT EXISTS idx_claims_active ON claims(superseded_at) WHERE superseded_at IS NULL;

-- ── EVIDENCE ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS evidence (
  evidence_id   TEXT PRIMARY KEY,
  claim_id      TEXT NOT NULL REFERENCES claims(claim_id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,
  detail        TEXT NOT NULL,
  raw_json      TEXT,
  captured_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_evidence_claim ON evidence(claim_id);

-- ── WAIVERS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS waivers (
  waiver_id     TEXT PRIMARY KEY,
  spec_id       TEXT NOT NULL REFERENCES specs(spec_id),
  kind          TEXT NOT NULL,
  target        TEXT NOT NULL,
  owner         TEXT NOT NULL,
  reason        TEXT NOT NULL,
  issue_ref     TEXT,
  expires_at    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  revoked_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_waivers_spec ON waivers(spec_id) WHERE revoked_at IS NULL;

-- ── POLICY RESULTS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS policy_results (
  result_id     TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL,
  spec_id       TEXT NOT NULL,
  obligation    TEXT NOT NULL,
  required_strength INTEGER NOT NULL,
  best_found_strength INTEGER,
  status        TEXT NOT NULL,
  details       TEXT NOT NULL,
  supporting_claims TEXT,
  waiver_id     TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_policy_results_run ON policy_results(run_id);
CREATE INDEX IF NOT EXISTS idx_policy_results_spec ON policy_results(spec_id);
CREATE INDEX IF NOT EXISTS idx_policy_results_explain ON policy_results(run_id, spec_id, status);

-- ── PROVIDER RUNS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_runs (
  run_id        TEXT PRIMARY KEY,
  started_at    TEXT NOT NULL,
  finished_at   TEXT,
  trigger       TEXT NOT NULL,
  git_sha       TEXT,
  config_hash   TEXT,
  status        TEXT NOT NULL DEFAULT 'running',
  summary_json  TEXT
);

CREATE INDEX IF NOT EXISTS idx_runs_status ON provider_runs(status);
CREATE INDEX IF NOT EXISTS idx_runs_started ON provider_runs(started_at);
