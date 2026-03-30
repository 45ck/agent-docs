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

const SCHEMA_VERSION = 1;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
  if (currentVersion < SCHEMA_VERSION) {
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
    return row ? JSON.parse(row.raw_json) as Spec : undefined;
  }

  getAllSpecs(): Spec[] {
    const rows = this.db.prepare('SELECT raw_json FROM specs ORDER BY spec_id').all() as Array<{ raw_json: string }>;
    return rows.map(r => JSON.parse(r.raw_json) as Spec);
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

    return rows.map(r => ({
      id: r.claim_id,
      src: r.src,
      relation: r.relation as Claim['relation'],
      dst: r.dst,
      provider: r.provider,
      strength: r.strength as EvidenceStrength,
      provenance: JSON.parse(r.provenance),
      metadata: r.meta_json ? JSON.parse(r.meta_json) : undefined,
      timestamp: r.created_at,
    }));
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

    return rows.map(r => ({
      id: r.claim_id,
      src: r.src,
      relation: r.relation as Claim['relation'],
      dst: r.dst,
      provider: r.provider,
      strength: r.strength as EvidenceStrength,
      provenance: JSON.parse(r.provenance),
      metadata: r.meta_json ? JSON.parse(r.meta_json) : undefined,
      timestamp: r.created_at,
    }));
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

    return rows.map(r => ({
      specId: r.spec_id,
      obligation: r.obligation as PolicyResult['obligation'],
      requiredStrength: r.required_strength as EvidenceStrength,
      bestFoundStrength: r.best_found_strength as EvidenceStrength | null,
      status: r.status as PolicyResult['status'],
      details: r.details,
      supportingClaims: JSON.parse(r.supporting_claims),
      waiverId: r.waiver_id ?? undefined,
    }));
  }

  // ── Transaction helper ──────────────────────────────────────

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
}
