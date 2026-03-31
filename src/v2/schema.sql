-- specgraph SQLite schema v2
-- All timestamps are ISO 8601 text (UTC). All IDs are TEXT.
-- Evidence strength integers map to: 0=E0 (declarative), 1=E1 (structural),
--   2=E2 (indexed), 3=E3 (automated), 4=E4 (runtime).
-- Active claims have superseded_at IS NULL.

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

-- ── GENERATED OUTPUTS ─────────────────────────────────────────
-- Replaces .specgraph/manifest.json
CREATE TABLE IF NOT EXISTS generated_outputs (
  id            TEXT PRIMARY KEY,
  spec_id       TEXT NOT NULL DEFAULT '',
  source_path   TEXT NOT NULL,
  source_hash   TEXT NOT NULL,
  output_path   TEXT NOT NULL,
  format        TEXT NOT NULL DEFAULT 'markdown',
  generated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  run_id        TEXT,
  FOREIGN KEY (run_id) REFERENCES provider_runs(run_id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_generated_outputs_spec ON generated_outputs(spec_id);
CREATE INDEX IF NOT EXISTS idx_generated_outputs_source ON generated_outputs(source_path);

-- ── GATE REPORTS ──────────────────────────────────────────────
-- Replaces .specgraph/reports/check-report.json
CREATE TABLE IF NOT EXISTS gate_reports (
  id             TEXT PRIMARY KEY,
  run_id         TEXT,
  generated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  source_root    TEXT NOT NULL,
  total_errors   INTEGER NOT NULL DEFAULT 0,
  total_warnings INTEGER NOT NULL DEFAULT 0,
  total_info     INTEGER NOT NULL DEFAULT 0,
  files_checked  INTEGER NOT NULL DEFAULT 0,
  docs_checked   INTEGER NOT NULL DEFAULT 0,
  raw_json       TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES provider_runs(run_id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_gate_reports_run ON gate_reports(run_id);
CREATE INDEX IF NOT EXISTS idx_gate_reports_root ON gate_reports(source_root, generated_at);

-- ── CONTRADICTIONS ────────────────────────────────────────────
-- Replaces .specgraph/contradiction-matrix.json entries
CREATE TABLE IF NOT EXISTS contradictions (
  id               TEXT PRIMARY KEY,
  spec_ids_json    TEXT NOT NULL,
  severity         TEXT NOT NULL CHECK(severity IN ('low','medium','high','critical')),
  status           TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','mitigated','resolved')),
  rationale        TEXT,
  mitigations_json TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  run_id           TEXT,
  FOREIGN KEY (run_id) REFERENCES provider_runs(run_id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_contradictions_status ON contradictions(status);
CREATE INDEX IF NOT EXISTS idx_contradictions_severity ON contradictions(severity);
