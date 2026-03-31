/**
 * SpecGraph v2 — SQLite store layer.
 *
 * All persistence goes through this module. The database lives at
 * `.specgraph/specgraph.db` in the project root.
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type {
  Spec, Subject, Claim, Evidence, Waiver, WaiverDef,
  ProviderRun, RunSummary, PolicyResult, SpecVerificationResult,
  EvidenceStrength, SpecState, PolicyResultStatus,
} from './types.js';
import { uuid } from './id.js';

const SCHEMA_VERSION = 2;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MIGRATION_V1_TO_V2 = `
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
`;

// ─── Open / Migrate ─────────────────────────────────────────────

export function openStore(root: string): SpecGraphStore {
  const dbDir = path.join(root, '.specgraph');
  mkdirSync(dbDir, { recursive: true });

  const dbPath = path.join(dbDir, 'specgraph.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  const currentVersion = (db.pragma('user_version', { simple: true }) as number) ?? 0;

  if (currentVersion < 1) {
    // Fresh install: apply full schema
    const schemaSql = readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(schemaSql);
      db.pragma(`user_version = ${SCHEMA_VERSION}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  } else if (currentVersion < 2) {
    // Existing v1 DB: apply only the new tables
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(MIGRATION_V1_TO_V2);
      db.pragma(`user_version = ${SCHEMA_VERSION}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  return new SpecGraphStore(db);
}

// ─── Store Class ────────────────────────────────────────────────

export class SpecGraphStore {
  constructor(public readonly db: Database.Database) {}

  close(): void {
    this.db.close();
  }

  // ── Specs ───────────────────────────────────────────────────

  upsertSpec(spec: Spec): void {
    this.db.prepare(`
      INSERT INTO specs (spec_id, title, state, kind, owner, priority, source_path, source_hash, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(spec_id) DO UPDATE SET
        title = excluded.title,
        state = excluded.state,
        kind = excluded.kind,
        owner = excluded.owner,
        priority = excluded.priority,
        source_path = excluded.source_path,
        source_hash = excluded.source_hash,
        raw_json = excluded.raw_json,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    `).run(
      spec.id, spec.title, spec.state, spec.kind,
      spec.owner ?? null, spec.priority ?? null,
      spec.sourcePath, spec.sourceHash,
      JSON.stringify(spec),
    );
  }

  getSpec(specId: string): Spec | undefined {
    const row = this.db.prepare('SELECT raw_json FROM specs WHERE spec_id = ?').get(specId) as { raw_json: string } | undefined;
    if (!row) return undefined;
    try {
      return JSON.parse(row.raw_json) as Spec;
    } catch {
      return undefined;
    }
  }

  getAllSpecs(): Spec[] {
    const rows = this.db.prepare('SELECT raw_json FROM specs ORDER BY spec_id').all() as Array<{ raw_json: string }>;
    const specs: Spec[] = [];
    for (const r of rows) {
      try {
        specs.push(JSON.parse(r.raw_json) as Spec);
      } catch {
        // Skip rows with corrupted JSON
      }
    }
    return specs;
  }

  // ── Subjects ────────────────────────────────────────────────

  upsertSubject(subject: Subject): void {
    this.db.prepare(`
      INSERT INTO subjects (subject_id, kind, provider, identity, file_path, line_number, meta_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(subject_id) DO UPDATE SET
        kind = excluded.kind,
        provider = excluded.provider,
        identity = excluded.identity,
        file_path = excluded.file_path,
        line_number = excluded.line_number,
        meta_json = excluded.meta_json,
        last_seen_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    `).run(
      subject.id, subject.kind, subject.provider, subject.identity,
      subject.file ?? null, subject.line ?? null,
      subject.metadata ? JSON.stringify(subject.metadata) : null,
    );
  }

  // ── Claims ──────────────────────────────────────────────────

  insertClaim(claim: Claim): void {
    if (claim.strength < 0 || claim.strength > 4) {
      throw new Error(`Invalid claim strength ${claim.strength} for claim ${claim.id}`);
    }
    this.db.prepare(`
      INSERT OR REPLACE INTO claims (claim_id, src, relation, dst, provider, strength, provenance, meta_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      claim.id, claim.src, claim.relation, claim.dst,
      claim.provider, claim.strength,
      JSON.stringify(claim.provenance),
      claim.metadata ? JSON.stringify(claim.metadata) : null,
      claim.timestamp,
    );
  }

  supersedeClaimsForProvider(provider: string): void {
    this.db.prepare(`
      UPDATE claims SET superseded_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE provider = ? AND superseded_at IS NULL
    `).run(provider);
  }

  getActiveClaimsForSpec(specId: string): Claim[] {
    const rows = this.db.prepare(`
      SELECT claim_id, src, relation, dst, provider, strength, provenance, meta_json, created_at
      FROM claims
      WHERE src = ? AND superseded_at IS NULL
      ORDER BY strength DESC
    `).all(specId) as Array<{
      claim_id: string; src: string; relation: string; dst: string;
      provider: string; strength: number; provenance: string;
      meta_json: string | null; created_at: string;
    }>;

    const claims: Claim[] = [];
    for (const r of rows) {
      try {
        claims.push({
          id: r.claim_id,
          src: r.src,
          relation: r.relation as Claim['relation'],
          dst: r.dst,
          provider: r.provider,
          strength: r.strength as EvidenceStrength,
          provenance: JSON.parse(r.provenance),
          metadata: r.meta_json ? JSON.parse(r.meta_json) : undefined,
          timestamp: r.created_at,
        });
      } catch {
        // Skip claims with corrupted JSON
      }
    }
    return claims;
  }

  getAllActiveClaims(): Claim[] {
    const rows = this.db.prepare(`
      SELECT claim_id, src, relation, dst, provider, strength, provenance, meta_json, created_at
      FROM claims WHERE superseded_at IS NULL ORDER BY src, relation
    `).all() as Array<{
      claim_id: string; src: string; relation: string; dst: string;
      provider: string; strength: number; provenance: string;
      meta_json: string | null; created_at: string;
    }>;

    const claims: Claim[] = [];
    for (const r of rows) {
      try {
        claims.push({
          id: r.claim_id,
          src: r.src,
          relation: r.relation as Claim['relation'],
          dst: r.dst,
          provider: r.provider,
          strength: r.strength as EvidenceStrength,
          provenance: JSON.parse(r.provenance),
          metadata: r.meta_json ? JSON.parse(r.meta_json) : undefined,
          timestamp: r.created_at,
        });
      } catch {
        // Skip claims with corrupted JSON
      }
    }
    return claims;
  }

  // ── Evidence ────────────────────────────────────────────────

  insertEvidence(evidence: Evidence): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO evidence (evidence_id, claim_id, kind, detail, raw_json, captured_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      evidence.id, evidence.claimId, evidence.kind, evidence.detail,
      evidence.raw ? JSON.stringify(evidence.raw) : null,
      evidence.capturedAt,
    );
  }

  // ── Waivers ─────────────────────────────────────────────────

  insertWaiver(specId: string, def: WaiverDef): string {
    const waiverId = uuid();
    this.db.prepare(`
      INSERT INTO waivers (waiver_id, spec_id, kind, target, owner, reason, issue_ref, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(waiverId, specId, def.kind, def.target, def.owner, def.reason, def.issueRef ?? null, def.expires);
    return waiverId;
  }

  getActiveWaiversForSpec(specId: string): Waiver[] {
    const now = new Date().toISOString();
    const rows = this.db.prepare(`
      SELECT waiver_id, spec_id, kind, target, owner, reason, issue_ref, expires_at, created_at, revoked_at
      FROM waivers
      WHERE spec_id = ? AND revoked_at IS NULL AND expires_at > ?
      ORDER BY created_at
    `).all(specId, now) as Array<{
      waiver_id: string; spec_id: string; kind: string; target: string;
      owner: string; reason: string; issue_ref: string | null;
      expires_at: string; created_at: string; revoked_at: string | null;
    }>;

    return rows.map(r => ({
      id: r.waiver_id,
      specId: r.spec_id,
      kind: r.kind,
      target: r.target,
      owner: r.owner,
      reason: r.reason,
      issueRef: r.issue_ref ?? undefined,
      expires: r.expires_at,
      createdAt: r.created_at,
      revokedAt: r.revoked_at ?? undefined,
    }));
  }

  getAllActiveWaivers(): Waiver[] {
    const now = new Date().toISOString();
    const rows = this.db.prepare(`
      SELECT waiver_id, spec_id, kind, target, owner, reason, issue_ref, expires_at, created_at, revoked_at
      FROM waivers
      WHERE revoked_at IS NULL AND expires_at > ?
      ORDER BY spec_id, created_at
    `).all(now) as Array<{
      waiver_id: string; spec_id: string; kind: string; target: string;
      owner: string; reason: string; issue_ref: string | null;
      expires_at: string; created_at: string; revoked_at: string | null;
    }>;

    return rows.map(r => ({
      id: r.waiver_id,
      specId: r.spec_id,
      kind: r.kind,
      target: r.target,
      owner: r.owner,
      reason: r.reason,
      issueRef: r.issue_ref ?? undefined,
      expires: r.expires_at,
      createdAt: r.created_at,
      revokedAt: r.revoked_at ?? undefined,
    }));
  }

  // ── Provider Runs ───────────────────────────────────────────

  startRun(trigger: string, gitSha?: string): string {
    const runId = uuid();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO provider_runs (run_id, started_at, trigger, git_sha, status)
      VALUES (?, ?, ?, ?, 'running')
    `).run(runId, now, trigger, gitSha ?? null);
    return runId;
  }

  finishRun(runId: string, status: 'passed' | 'failed' | 'error', summary: RunSummary): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE provider_runs
      SET finished_at = ?, status = ?, summary_json = ?
      WHERE run_id = ?
    `).run(now, status, JSON.stringify(summary), runId);
  }

  getLatestRunId(): string | undefined {
    const row = this.db.prepare(`
      SELECT run_id FROM provider_runs ORDER BY started_at DESC LIMIT 1
    `).get() as { run_id: string } | undefined;
    return row?.run_id;
  }

  // ── Policy Results ──────────────────────────────────────────

  insertPolicyResult(runId: string, result: PolicyResult): void {
    const resultId = uuid();
    this.db.prepare(`
      INSERT INTO policy_results
        (result_id, run_id, spec_id, obligation, required_strength, best_found_strength, status, details, supporting_claims, waiver_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      resultId, runId, result.specId, result.obligation,
      result.requiredStrength, result.bestFoundStrength ?? null,
      result.status, result.details,
      JSON.stringify(result.supportingClaims),
      result.waiverId ?? null,
    );
  }

  getExplainResults(runId: string, specId: string): PolicyResult[] {
    const rows = this.db.prepare(`
      SELECT spec_id, obligation, required_strength, best_found_strength, status, details, supporting_claims, waiver_id
      FROM policy_results
      WHERE run_id = ? AND spec_id = ?
      ORDER BY
        CASE status WHEN 'fail' THEN 0 WHEN 'insufficient-evidence' THEN 1 WHEN 'warn' THEN 2 WHEN 'waived' THEN 3 ELSE 4 END,
        obligation
    `).all(runId, specId) as Array<{
      spec_id: string; obligation: string; required_strength: number;
      best_found_strength: number | null; status: string; details: string;
      supporting_claims: string; waiver_id: string | null;
    }>;

    return rows.map(r => {
      let supportingClaims: string[];
      try {
        supportingClaims = JSON.parse(r.supporting_claims);
      } catch {
        supportingClaims = [];
      }
      return {
        specId: r.spec_id,
        obligation: r.obligation as PolicyResult['obligation'],
        requiredStrength: r.required_strength as EvidenceStrength,
        bestFoundStrength: r.best_found_strength as EvidenceStrength | null,
        status: r.status as PolicyResult['status'],
        details: r.details,
        supportingClaims,
        waiverId: r.waiver_id ?? undefined,
      };
    });
  }

  // ── Generated Outputs ───────────────────────────────────────

  insertGeneratedOutput(entry: {
    id: string; specId: string; sourcePath: string;
    sourceHash: string; outputPath: string; format: string; runId?: string;
  }): void {
    this.db.prepare(`
      INSERT OR REPLACE INTO generated_outputs
        (id, spec_id, source_path, source_hash, output_path, format, run_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(entry.id, entry.specId, entry.sourcePath, entry.sourceHash, entry.outputPath, entry.format, entry.runId ?? null);
  }

  listGeneratedOutputs(specId?: string): Array<{
    id: string; specId: string; sourcePath: string; sourceHash: string;
    outputPath: string; format: string; generatedAt: string;
  }> {
    const rows = specId
      ? this.db.prepare(`SELECT * FROM generated_outputs WHERE spec_id = ? ORDER BY generated_at DESC`).all(specId)
      : this.db.prepare(`SELECT * FROM generated_outputs ORDER BY generated_at DESC`).all();
    return (rows as Array<Record<string, unknown>>).map(r => ({
      id: r.id as string,
      specId: r.spec_id as string,
      sourcePath: r.source_path as string,
      sourceHash: r.source_hash as string,
      outputPath: r.output_path as string,
      format: r.format as string,
      generatedAt: r.generated_at as string,
    }));
  }

  // ── Gate Reports ────────────────────────────────────────────

  insertGateReport(report: {
    id: string; runId?: string; sourceRoot: string;
    totalErrors: number; totalWarnings: number; totalInfo: number;
    filesChecked: number; docsChecked: number; rawJson: string;
  }): void {
    this.db.prepare(`
      INSERT INTO gate_reports
        (id, run_id, source_root, total_errors, total_warnings, total_info, files_checked, docs_checked, raw_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(report.id, report.runId ?? null, report.sourceRoot, report.totalErrors, report.totalWarnings, report.totalInfo, report.filesChecked, report.docsChecked, report.rawJson);
  }

  getLatestGateReport(sourceRoot: string): {
    id: string; generatedAt: string; sourceRoot: string;
    totalErrors: number; totalWarnings: number; totalInfo: number;
    filesChecked: number; docsChecked: number; rawJson: string;
  } | null {
    const row = this.db.prepare(`
      SELECT * FROM gate_reports WHERE source_root = ? ORDER BY generated_at DESC LIMIT 1
    `).get(sourceRoot) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: row.id as string,
      generatedAt: row.generated_at as string,
      sourceRoot: row.source_root as string,
      totalErrors: row.total_errors as number,
      totalWarnings: row.total_warnings as number,
      totalInfo: row.total_info as number,
      filesChecked: row.files_checked as number,
      docsChecked: row.docs_checked as number,
      rawJson: row.raw_json as string,
    };
  }

  // ── Contradictions ──────────────────────────────────────────

  upsertContradiction(entry: {
    id: string; specIds: string[]; severity: string;
    status: string; rationale?: string; mitigations?: string[]; runId?: string;
  }): void {
    this.db.prepare(`
      INSERT INTO contradictions
        (id, spec_ids_json, severity, status, rationale, mitigations_json, run_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        spec_ids_json = excluded.spec_ids_json,
        severity = excluded.severity,
        status = excluded.status,
        rationale = excluded.rationale,
        mitigations_json = excluded.mitigations_json,
        run_id = excluded.run_id,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    `).run(
      entry.id, JSON.stringify(entry.specIds), entry.severity, entry.status,
      entry.rationale ?? null, entry.mitigations ? JSON.stringify(entry.mitigations) : null,
      entry.runId ?? null,
    );
  }

  listContradictions(status?: string): Array<{
    id: string; specIds: string[]; severity: string; status: string;
    rationale?: string; mitigations?: string[]; createdAt: string; updatedAt: string;
  }> {
    const rows = status
      ? this.db.prepare(`SELECT * FROM contradictions WHERE status = ? ORDER BY created_at DESC`).all(status)
      : this.db.prepare(`SELECT * FROM contradictions ORDER BY created_at DESC`).all();
    return (rows as Array<Record<string, unknown>>).map(r => ({
      id: r.id as string,
      specIds: JSON.parse(r.spec_ids_json as string) as string[],
      severity: r.severity as string,
      status: r.status as string,
      rationale: r.rationale as string | undefined,
      mitigations: r.mitigations_json ? JSON.parse(r.mitigations_json as string) as string[] : undefined,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    }));
  }

  // ── Transaction helper ──────────────────────────────────────

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
}
