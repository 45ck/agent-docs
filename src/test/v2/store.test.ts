import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openStore } from '../../v2/store.js';
import { EvidenceStrength } from '../../v2/types.js';
import type { Spec, Claim, WaiverDef, PolicyResult } from '../../v2/types.js';

async function withTempDir(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sg-store-test-'));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

function makeSpec(id: string): Spec {
  return { id, title: 'Test Spec', state: 'draft', kind: 'feature', sourcePath: `specs/${id}.md`, sourceHash: 'abc123' };
}

function makeClaim(specId: string): Claim {
  return {
    id: `claim-${specId}`,
    src: specId,
    relation: 'IMPLEMENTS',
    dst: 'symbol:annotation:src/foo.ts#bar',
    provider: 'annotation',
    strength: EvidenceStrength.E0,
    provenance: { file: 'src/foo.ts', detail: 'test' },
    timestamp: new Date().toISOString(),
  };
}

// 1. openStore creates DB file
test('openStore creates DB file', async () => {
  await withTempDir(async (root) => {
    const store = openStore(root);
    try {
      const dbPath = path.join(root, '.specgraph', 'specgraph.db');
      const s = await stat(dbPath);
      assert.ok(s.isFile(), 'DB file should exist');
    } finally {
      store.close();
    }
  });
});

// 2. openStore is idempotent
test('openStore is idempotent', async () => {
  await withTempDir(async (root) => {
    const store1 = openStore(root);
    store1.close();
    const store2 = openStore(root);
    store2.close();
    // No error thrown means success
  });
});

// 3. upsertSpec/getSpec round-trip
test('upsertSpec/getSpec round-trip', async () => {
  await withTempDir(async (root) => {
    const store = openStore(root);
    try {
      const spec = makeSpec('SPEC-001');
      store.upsertSpec(spec);
      const got = store.getSpec('SPEC-001');
      assert.ok(got);
      assert.equal(got.id, spec.id);
      assert.equal(got.title, spec.title);
      assert.equal(got.state, spec.state);
      assert.equal(got.kind, spec.kind);
    } finally {
      store.close();
    }
  });
});

// 4. getSpec returns undefined for missing ID
test('getSpec returns undefined for missing ID', async () => {
  await withTempDir(async (root) => {
    const store = openStore(root);
    try {
      assert.equal(store.getSpec('nonexistent'), undefined);
    } finally {
      store.close();
    }
  });
});

// 5. getAllSpecs returns all upserted specs
test('getAllSpecs returns all upserted specs', async () => {
  await withTempDir(async (root) => {
    const store = openStore(root);
    try {
      store.upsertSpec(makeSpec('S1'));
      store.upsertSpec(makeSpec('S2'));
      store.upsertSpec(makeSpec('S3'));
      const all = store.getAllSpecs();
      assert.equal(all.length, 3);
    } finally {
      store.close();
    }
  });
});

// 6. upsertSpec updates existing
test('upsertSpec updates existing', async () => {
  await withTempDir(async (root) => {
    const store = openStore(root);
    try {
      store.upsertSpec(makeSpec('SPEC-UPD'));
      const updated = { ...makeSpec('SPEC-UPD'), title: 'Updated Title' };
      store.upsertSpec(updated);
      const got = store.getSpec('SPEC-UPD');
      assert.ok(got);
      assert.equal(got.title, 'Updated Title');
    } finally {
      store.close();
    }
  });
});

// 7. insertClaim/getActiveClaimsForSpec round-trip
test('insertClaim/getActiveClaimsForSpec round-trip', async () => {
  await withTempDir(async (root) => {
    const store = openStore(root);
    try {
      const claim = makeClaim('SPEC-CL');
      store.insertClaim(claim);
      const claims = store.getActiveClaimsForSpec('SPEC-CL');
      assert.equal(claims.length, 1);
      assert.equal(claims[0].id, claim.id);
      assert.equal(claims[0].src, 'SPEC-CL');
      assert.equal(claims[0].relation, 'IMPLEMENTS');
      assert.equal(claims[0].provider, 'annotation');
      assert.equal(claims[0].strength, EvidenceStrength.E0);
    } finally {
      store.close();
    }
  });
});

// 8. supersedeClaimsForProvider
test('supersedeClaimsForProvider marks claims as superseded', async () => {
  await withTempDir(async (root) => {
    const store = openStore(root);
    try {
      const c1 = makeClaim('SPEC-SS1');
      const c2 = { ...makeClaim('SPEC-SS2'), id: 'claim-SPEC-SS2' };
      store.insertClaim(c1);
      store.insertClaim(c2);
      store.supersedeClaimsForProvider('annotation');
      const active1 = store.getActiveClaimsForSpec('SPEC-SS1');
      const active2 = store.getActiveClaimsForSpec('SPEC-SS2');
      assert.equal(active1.length, 0);
      assert.equal(active2.length, 0);
    } finally {
      store.close();
    }
  });
});

// 9. insertWaiver/getActiveWaiversForSpec
test('insertWaiver/getActiveWaiversForSpec filters by expiry', async () => {
  await withTempDir(async (root) => {
    const store = openStore(root);
    try {
      // Need a spec first due to FK
      store.upsertSpec(makeSpec('SPEC-W'));

      const futureWaiver: WaiverDef = {
        kind: 'implementation',
        target: 'src/foo.ts',
        owner: 'alice',
        reason: 'pending refactor',
        expires: '2099-12-31T23:59:59Z',
      };
      store.insertWaiver('SPEC-W', futureWaiver);

      const expiredWaiver: WaiverDef = {
        kind: 'verification',
        target: 'src/bar.ts',
        owner: 'bob',
        reason: 'old waiver',
        expires: '2000-01-01T00:00:00Z',
      };
      store.insertWaiver('SPEC-W', expiredWaiver);

      const active = store.getActiveWaiversForSpec('SPEC-W');
      assert.equal(active.length, 1);
      assert.equal(active[0].kind, 'implementation');
      assert.equal(active[0].owner, 'alice');
    } finally {
      store.close();
    }
  });
});

// 10. getAllActiveWaivers
test('getAllActiveWaivers returns waivers across specs', async () => {
  await withTempDir(async (root) => {
    const store = openStore(root);
    try {
      store.upsertSpec(makeSpec('SPEC-WA'));
      store.upsertSpec(makeSpec('SPEC-WB'));

      const waiver: WaiverDef = {
        kind: 'implementation',
        target: 'src/x.ts',
        owner: 'alice',
        reason: 'reason',
        expires: '2099-12-31T23:59:59Z',
      };
      store.insertWaiver('SPEC-WA', waiver);
      store.insertWaiver('SPEC-WB', waiver);

      const all = store.getAllActiveWaivers();
      assert.equal(all.length, 2);
      const specIds = all.map(w => w.specId).sort();
      assert.deepEqual(specIds, ['SPEC-WA', 'SPEC-WB']);
    } finally {
      store.close();
    }
  });
});

// 11. startRun/finishRun/getLatestRunId lifecycle
test('startRun/finishRun/getLatestRunId lifecycle', async () => {
  await withTempDir(async (root) => {
    const store = openStore(root);
    try {
      const runId = store.startRun('cli:verify');
      assert.ok(runId, 'startRun should return a run ID');

      const latestId = store.getLatestRunId();
      assert.equal(latestId, runId);

      store.finishRun(runId, 'passed', {
        specsScanned: 1, claimsEmitted: 2,
        passed: 1, warned: 0, failed: 0, waived: 0, insufficientEvidence: 0, durationMs: 100,
      });

      // Latest run ID should still be the same
      assert.equal(store.getLatestRunId(), runId);
    } finally {
      store.close();
    }
  });
});

// 12. insertPolicyResult/getExplainResults
test('insertPolicyResult/getExplainResults round-trip', async () => {
  await withTempDir(async (root) => {
    const store = openStore(root);
    try {
      const runId = store.startRun('cli:verify');
      const result: PolicyResult = {
        specId: 'SPEC-POL',
        obligation: 'implementation',
        requiredStrength: EvidenceStrength.E2,
        bestFoundStrength: EvidenceStrength.E1,
        status: 'fail',
        details: 'Insufficient strength',
        supportingClaims: ['claim-1', 'claim-2'],
      };
      store.insertPolicyResult(runId, result);

      const results = store.getExplainResults(runId, 'SPEC-POL');
      assert.equal(results.length, 1);
      assert.equal(results[0].specId, 'SPEC-POL');
      assert.equal(results[0].obligation, 'implementation');
      assert.equal(results[0].requiredStrength, EvidenceStrength.E2);
      assert.equal(results[0].bestFoundStrength, EvidenceStrength.E1);
      assert.equal(results[0].status, 'fail');
      assert.equal(results[0].details, 'Insufficient strength');
      assert.deepEqual(results[0].supportingClaims, ['claim-1', 'claim-2']);
    } finally {
      store.close();
    }
  });
});

// 13. transaction rollback
test('transaction rollback on error leaves DB unchanged', async () => {
  await withTempDir(async (root) => {
    const store = openStore(root);
    try {
      store.upsertSpec(makeSpec('SPEC-TX'));
      assert.throws(() => {
        store.transaction(() => {
          store.upsertSpec(makeSpec('SPEC-TX-INNER'));
          throw new Error('abort');
        });
      }, { message: 'abort' });

      // SPEC-TX-INNER should not be in the DB
      assert.equal(store.getSpec('SPEC-TX-INNER'), undefined);
      // SPEC-TX should still be there
      assert.ok(store.getSpec('SPEC-TX'));
    } finally {
      store.close();
    }
  });
});
