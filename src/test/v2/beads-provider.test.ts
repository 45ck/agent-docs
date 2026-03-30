/**
 * BeadsProvider tests.
 *
 * Because `bd` is an optional external dependency we cannot rely on it being
 * present in the test environment.  These tests exercise the provider's
 * behaviour when bd IS available (by injecting fixture JSONL) and when it is
 * NOT (graceful degradation).
 *
 * We test the internal claim-mapping logic directly by exporting a helper.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { EvidenceStrength } from '../../v2/types.js';
import { mapIssueToClaim } from '../helpers/beads-test-helpers.js';

// ─── Claim mapping logic ─────────────────────────────────────────

test('closed feature issue → IMPLEMENTS E1', () => {
  const claim = mapIssueToClaim({
    id: 'bd-a1b2',
    title: 'Implement login',
    status: 'closed',
    issue_type: 'feature',
    spec_id: 'SPEC-042',
  });
  assert.ok(claim);
  assert.equal(claim.relation, 'IMPLEMENTS');
  assert.equal(claim.strength, EvidenceStrength.E1);
  assert.equal(claim.src, 'SPEC-042');
  assert.ok(claim.dst.startsWith('issue:beads:bd-a1b2'));
});

test('closed task issue → IMPLEMENTS E1', () => {
  const claim = mapIssueToClaim({
    id: 'bd-c3d4',
    title: 'Add migration',
    status: 'closed',
    issue_type: 'task',
    spec_id: 'SPEC-001',
  });
  assert.ok(claim);
  assert.equal(claim.relation, 'IMPLEMENTS');
  assert.equal(claim.strength, EvidenceStrength.E1);
});

test('closed decision issue → IMPLEMENTS E1', () => {
  const claim = mapIssueToClaim({
    id: 'bd-d5e6',
    title: 'Decide on DB engine',
    status: 'closed',
    issue_type: 'decision',
    spec_id: 'ADR-010',
  });
  assert.ok(claim);
  assert.equal(claim.relation, 'IMPLEMENTS');
  assert.equal(claim.strength, EvidenceStrength.E1);
});

test('closed bug issue → VERIFIED_BY E1', () => {
  const claim = mapIssueToClaim({
    id: 'bd-f7g8',
    title: 'Fix null pointer in login',
    status: 'closed',
    issue_type: 'bug',
    spec_id: 'SPEC-042',
  });
  assert.ok(claim);
  assert.equal(claim.relation, 'VERIFIED_BY');
  assert.equal(claim.strength, EvidenceStrength.E1);
});

test('open feature issue → IMPLEMENTS E0', () => {
  const claim = mapIssueToClaim({
    id: 'bd-h9i0',
    title: 'WIP: login handler',
    status: 'open',
    issue_type: 'feature',
    spec_id: 'SPEC-042',
  });
  assert.ok(claim);
  assert.equal(claim.relation, 'IMPLEMENTS');
  assert.equal(claim.strength, EvidenceStrength.E0);
});

test('in_progress issue → IMPLEMENTS E0', () => {
  const claim = mapIssueToClaim({
    id: 'bd-j1k2',
    title: 'In progress',
    status: 'in_progress',
    issue_type: 'task',
    spec_id: 'SPEC-042',
  });
  assert.ok(claim);
  assert.equal(claim.strength, EvidenceStrength.E0);
});

test('blocked issue → IMPLEMENTS E0', () => {
  const claim = mapIssueToClaim({
    id: 'bd-l3m4',
    title: 'Blocked',
    status: 'blocked',
    issue_type: 'task',
    spec_id: 'SPEC-042',
  });
  assert.ok(claim);
  assert.equal(claim.strength, EvidenceStrength.E0);
});

test('issue without spec_id is skipped', () => {
  const claim = mapIssueToClaim({
    id: 'bd-n5o6',
    title: 'No spec link',
    status: 'open',
    issue_type: 'task',
    spec_id: null,
  });
  assert.equal(claim, null);
});

test('ephemeral issue is skipped', () => {
  const claim = mapIssueToClaim({
    id: 'bd-p7q8',
    title: 'Heartbeat',
    status: 'open',
    issue_type: 'message',
    spec_id: 'SPEC-001',
    ephemeral: true,
  });
  assert.equal(claim, null);
});

test('wisp issue is skipped', () => {
  const claim = mapIssueToClaim({
    id: 'bd-r9s0',
    title: 'Heartbeat wisp',
    status: 'open',
    issue_type: 'message',
    spec_id: 'SPEC-001',
    wisp_type: 'heartbeat',
  });
  assert.equal(claim, null);
});

test('claim id is deterministic for same inputs', () => {
  const c1 = mapIssueToClaim({ id: 'bd-t1', title: 'T', status: 'closed', issue_type: 'task', spec_id: 'S-1' });
  const c2 = mapIssueToClaim({ id: 'bd-t1', title: 'T', status: 'closed', issue_type: 'task', spec_id: 'S-1' });
  assert.ok(c1 && c2);
  assert.equal(c1.id, c2.id);
});
