/**
 * BeadsProvider — integrates with the Beads issue tracker (https://github.com/steveyegge/beads).
 *
 * Assumptions:
 * - The project uses `bd` (Beads CLI) for issue tracking.
 * - Issues link back to specs via their `spec_id` field, set at creation time:
 *     bd create "Implement login handler" --spec-id SPEC-042
 * - `bd` is an optional peer dependency; if not available the provider returns empty.
 *
 * Evidence mapping:
 *   open|in_progress|blocked + spec_id  → IMPLEMENTS E0 (work declared, not yet done)
 *   closed + type feature|task|chore    → IMPLEMENTS E1 (work completed)
 *   closed + type decision              → IMPLEMENTS E1 (decision confirmed)
 *   closed + type bug                   → VERIFIED_BY E1 (defect verified fixed)
 *
 * Each beads issue also becomes a subject: `issue:beads:{issue_id}`
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import type { Provider, ScanContext, ScanResult, Subject, Claim, Evidence } from '../v2/types.js';
import { EvidenceStrength, makeSubjectId } from '../v2/types.js';

// Beads issue statuses that represent completed work
const DONE_STATUSES = new Set(['closed']);

// Issue types that map to IMPLEMENTS vs VERIFIED_BY
const VERIFIED_BY_TYPES = new Set(['bug']);

interface BeadsIssue {
  id: string;
  title: string;
  status: string;
  issue_type: string;
  spec_id?: string | null;
  priority?: number;
  assignee?: string | null;
  created_at?: string;
  updated_at?: string;
  ephemeral?: boolean;
  wisp_type?: string | null;
}

export class BeadsProvider implements Provider {
  readonly name = 'beads';
  readonly description = 'Maps Beads issues (spec_id field) to implementation and verification evidence';

  supports(): string[] {
    return ['issue'];
  }

  strengthFor(relation: string): EvidenceStrength {
    // Closed issues give structural evidence (E1); open give declarative (E0)
    return EvidenceStrength.E1;
  }

  async scan(ctx: ScanContext): Promise<ScanResult> {
    const issues = exportIssues(ctx.root);
    if (issues === null) {
      // bd not available or not initialised — skip silently
      return { subjects: [], claims: [], evidence: [] };
    }

    const subjects: Subject[] = [];
    const claims: Claim[] = [];
    const evidence: Evidence[] = [];
    const now = new Date().toISOString();

    for (const issue of issues) {
      // Skip ephemeral messages and system wisps — they're not traceability evidence
      if (issue.ephemeral) continue;
      if (issue.wisp_type) continue;

      const specId = issue.spec_id?.trim();
      if (!specId) continue;

      const subjectId = makeSubjectId('issue', 'beads', issue.id);

      // Register the issue as a subject
      subjects.push({
        id: subjectId,
        kind: 'issue',
        provider: 'beads',
        identity: issue.id,
        metadata: {
          title: issue.title,
          status: issue.status,
          issue_type: issue.issue_type,
          priority: issue.priority,
          assignee: issue.assignee ?? null,
        },
      });

      const isDone = DONE_STATUSES.has(issue.status);
      const isVerification = VERIFIED_BY_TYPES.has(issue.issue_type);

      const relation = isVerification ? 'VERIFIED_BY' as const : 'IMPLEMENTS' as const;
      const strength = isDone ? EvidenceStrength.E1 : EvidenceStrength.E0;

      const claimId = deterministicClaimId(specId, relation, subjectId, 'beads');

      claims.push({
        id: claimId,
        src: specId,
        relation,
        dst: subjectId,
        provider: 'beads',
        strength,
        provenance: {
          detail: `beads issue ${issue.id}: ${issue.title} [${issue.status}]`,
        },
        metadata: {
          beads_id: issue.id,
          status: issue.status,
          issue_type: issue.issue_type,
        },
        timestamp: now,
      });

      // Attach evidence when work is done (E1)
      if (isDone) {
        evidence.push({
          id: `${claimId}:closed`,
          claimId,
          kind: 'issue_closed',
          detail: `Beads issue ${issue.id} is closed — ${isVerification ? 'defect verified fixed' : 'implementation work completed'}`,
          capturedAt: now,
        });
      }
    }

    return { subjects, claims, evidence };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────

/**
 * Shell out to `bd export` and return parsed issues.
 * Returns null if bd is not available or the project has no Beads database.
 */
function exportIssues(root: string): BeadsIssue[] | null {
  // First check bd is available
  const versionCheck = spawnSync('bd', ['--version'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 5000,
    windowsHide: true,
  });
  if (versionCheck.error || versionCheck.status !== 0) {
    return null;
  }

  // Export all issues as JSONL
  const result = spawnSync('bd', ['export'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30000,
    windowsHide: true,
  });

  if (result.error || result.status !== 0) {
    // Beads may not be initialised in this project — that's fine
    return null;
  }

  const issues: BeadsIssue[] = [];
  for (const line of result.stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const issue = JSON.parse(trimmed) as BeadsIssue;
      issues.push(issue);
    } catch {
      // Skip malformed lines
    }
  }

  return issues;
}

function deterministicClaimId(src: string, relation: string, dst: string, provider: string): string {
  return createHash('sha256')
    .update(`${src}\0${relation}\0${dst}\0${provider}`)
    .digest('hex')
    .slice(0, 32);
}
