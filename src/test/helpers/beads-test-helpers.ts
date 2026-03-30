/**
 * Test helpers for BeadsProvider.
 *
 * Extracts the pure claim-mapping logic from BeadsProvider so it can be
 * unit-tested without shelling out to `bd`.
 */
import { createHash } from 'node:crypto';
import type { Claim } from '../../v2/types.js';
import { EvidenceStrength, makeSubjectId } from '../../v2/types.js';

interface BeadsIssueFixture {
  id: string;
  title: string;
  status: string;
  issue_type: string;
  spec_id?: string | null;
  ephemeral?: boolean;
  wisp_type?: string | null;
  priority?: number;
  assignee?: string | null;
}

const DONE_STATUSES = new Set(['closed']);
const VERIFIED_BY_TYPES = new Set(['bug']);

/**
 * Map a single Beads issue fixture to a Claim, or null if the issue should be skipped.
 * This mirrors the per-issue logic in BeadsProvider.scan().
 */
export function mapIssueToClaim(issue: BeadsIssueFixture): Claim | null {
  if (issue.ephemeral) return null;
  if (issue.wisp_type) return null;

  const specId = issue.spec_id?.trim();
  if (!specId) return null;

  const subjectId = makeSubjectId('issue', 'beads', issue.id);
  const isDone = DONE_STATUSES.has(issue.status);
  const isVerification = VERIFIED_BY_TYPES.has(issue.issue_type);

  const relation = isVerification ? 'VERIFIED_BY' as const : 'IMPLEMENTS' as const;
  const strength = isDone ? EvidenceStrength.E1 : EvidenceStrength.E0;

  const claimId = createHash('sha256')
    .update(`${specId}\0${relation}\0${subjectId}\0beads`)
    .digest('hex')
    .slice(0, 32);

  return {
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
    timestamp: new Date().toISOString(),
  };
}
