import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateSpec } from '../../v2/policy.js';
import { EvidenceStrength, DEFAULT_POLICY } from '../../v2/types.js';
import type { Spec, Claim, Waiver, PolicyConfig } from '../../v2/types.js';

function makeSpec(overrides: Partial<Spec> & { id: string }): Spec {
  const defaults: Omit<Spec, 'id'> = {
    title: 'Test',
    state: 'draft',
    kind: 'feature',
    sourcePath: 'specs/test.md',
    sourceHash: 'abc',
  };
  return { ...defaults, ...overrides };
}

function makeClaim(specId: string, strength = EvidenceStrength.E0): Claim {
  return {
    id: 'claim-1',
    src: specId,
    relation: 'IMPLEMENTS',
    dst: 'symbol:annotation:src/foo.ts#bar',
    provider: 'annotation',
    strength,
    provenance: { file: 'src/foo.ts', detail: '@implements' },
    timestamp: new Date().toISOString(),
  };
}

function makeWaiver(kind: string, expires: string): Waiver {
  return {
    id: 'w1',
    specId: 'spec-1',
    kind,
    target: 'implementation',
    owner: 'team',
    reason: 'test waiver',
    expires,
    createdAt: new Date().toISOString(),
  };
}

// --- Unknown state ---

test('unknown state returns pass with no obligations', () => {
  const spec = makeSpec({ id: 'spec-1', state: 'unknown' as any });
  const result = evaluateSpec(spec, [], []);
  assert.equal(result.overallResult, 'pass');
  assert.equal(result.obligations.length, 0);
});

// --- Draft state ---

test('draft state with no claims returns pass', () => {
  const spec = makeSpec({ id: 'spec-1', state: 'draft' });
  const result = evaluateSpec(spec, [], []);
  assert.equal(result.overallResult, 'pass');
});

// --- In-progress state ---

test('in_progress state with no claims returns fail', () => {
  const spec = makeSpec({ id: 'spec-1', state: 'in_progress' });
  const result = evaluateSpec(spec, [], []);
  assert.equal(result.overallResult, 'fail');
});

test('in_progress state with E0 IMPLEMENTS claim returns pass or warn', () => {
  const spec = makeSpec({ id: 'spec-1', state: 'in_progress' });
  const claim = makeClaim('spec-1', EvidenceStrength.E0);
  const result = evaluateSpec(spec, [claim], []);
  // implementation passes (E0 meets E0), but warnMissing verification -> warn
  const implObl = result.obligations.find(o => o.obligation === 'implementation');
  assert.equal(implObl?.status, 'pass');
  // Overall may be warn due to missing verification advisory
  assert.ok(result.overallResult === 'pass' || result.overallResult === 'warn');
});

test('in_progress state with E1 IMPLEMENTS claim passes implementation', () => {
  const spec = makeSpec({ id: 'spec-1', state: 'in_progress' });
  const claim = makeClaim('spec-1', EvidenceStrength.E1);
  const result = evaluateSpec(spec, [claim], []);
  const implObl = result.obligations.find(o => o.obligation === 'implementation');
  assert.equal(implObl?.status, 'pass');
});

// --- Accepted state ---

test('accepted state with no claims returns fail', () => {
  const spec = makeSpec({ id: 'spec-1', state: 'accepted' });
  const result = evaluateSpec(spec, [], []);
  assert.equal(result.overallResult, 'fail');
});

test('accepted state with E0 IMPLEMENTS claim returns insufficient-evidence or fail', () => {
  const spec = makeSpec({ id: 'spec-1', state: 'accepted' });
  const claim = makeClaim('spec-1', EvidenceStrength.E0);
  const result = evaluateSpec(spec, [claim], []);
  // implementation: E0 < E2 required -> insufficient-evidence
  // verification: no claims -> fail, models: no claims -> fail
  // Overall: fail (fail takes priority over insufficient-evidence)
  const implObl = result.obligations.find(o => o.obligation === 'implementation');
  assert.equal(implObl?.status, 'insufficient-evidence');
  assert.equal(result.overallResult, 'fail');
});

test('accepted state with E2 IMPLEMENTS claim still fails without verification and models', () => {
  const spec = makeSpec({ id: 'spec-1', state: 'accepted' });
  const claim = makeClaim('spec-1', EvidenceStrength.E2);
  const result = evaluateSpec(spec, [claim], []);
  // implementation passes (E2 meets E2), but verification and models missing -> fail
  const implObl = result.obligations.find(o => o.obligation === 'implementation');
  assert.equal(implObl?.status, 'pass');
  assert.equal(result.overallResult, 'fail');
});

// --- Waivers ---

test('waiver with future expiry results in waived status', () => {
  // Use a custom policy that requires implementation and allows waivers for it
  const policy: PolicyConfig = {
    states: {
      draft: { require: {}, warnMissing: [], allowWaiverFor: [] },
      proposed: { require: {}, warnMissing: [], allowWaiverFor: [] },
      in_progress: {
        require: { implementation: EvidenceStrength.E0 },
        warnMissing: [],
        allowWaiverFor: ['implementation'],
      },
      accepted: { require: {}, warnMissing: [], allowWaiverFor: [] },
      done: { require: {}, warnMissing: [], allowWaiverFor: [] },
      deprecated: { require: {}, warnMissing: [], allowWaiverFor: [] },
    },
  };
  const spec = makeSpec({ id: 'spec-1', state: 'in_progress' });
  const waiver = makeWaiver('missing-implementation', '2099-01-01T00:00:00.000Z');
  const result = evaluateSpec(spec, [], [waiver], policy);
  const implObl = result.obligations.find(o => o.obligation === 'implementation');
  assert.equal(implObl?.status, 'waived');
  assert.equal(result.overallResult, 'waived');
});

test('waiver with past expiry does not apply', () => {
  const spec = makeSpec({ id: 'spec-1', state: 'in_progress' });
  const waiver = makeWaiver('missing-implementation', '2020-01-01T00:00:00.000Z');
  const result = evaluateSpec(spec, [], [waiver]);
  const implObl = result.obligations.find(o => o.obligation === 'implementation');
  assert.equal(implObl?.status, 'fail');
});

// --- warnMissing ---

test('proposed state with no claims warns about missing implementation', () => {
  const spec = makeSpec({ id: 'spec-1', state: 'proposed' });
  const result = evaluateSpec(spec, [], []);
  // proposed: require={}, warnMissing=['implementation']
  const warnObl = result.obligations.find(o => o.obligation === 'implementation');
  assert.equal(warnObl?.status, 'warn');
  assert.equal(result.overallResult, 'warn');
});

// --- Spec-level requiredEvidence override ---

test('spec-level requiredEvidence overrides policy defaults', () => {
  const spec = makeSpec({
    id: 'spec-1',
    state: 'in_progress',
    requiredEvidence: { implementation: EvidenceStrength.E3 },
  });
  const claim = makeClaim('spec-1', EvidenceStrength.E1);
  const result = evaluateSpec(spec, [claim], []);
  // Spec overrides implementation to E3; E1 < E3 -> insufficient-evidence
  const implObl = result.obligations.find(o => o.obligation === 'implementation');
  assert.equal(implObl?.status, 'insufficient-evidence');
});
