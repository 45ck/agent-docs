import assert from 'node:assert/strict';
import test from 'node:test';
import type { ParsedArtifact, ArtifactInput } from '../types.js';
import {
  generateTraceabilityMatrix,
  generateDefectMatrix,
  generateCoverageMatrix,
  generateImpactMatrix,
} from '../lib/reports.js';

function makeArtifact(overrides: Partial<ParsedArtifact> & { id: string; kind: string }): ParsedArtifact {
  const raw: ArtifactInput = {
    id: overrides.id,
    kind: overrides.kind,
    title: overrides.title ?? overrides.id,
    status: (overrides.status ?? 'draft') as ArtifactInput['status'],
    metadata: (overrides.raw?.metadata ?? {}) as Record<string, unknown>,
  };
  return {
    path: `docs/${overrides.id}.toon`,
    title: overrides.id,
    status: 'draft',
    scope: 'platform',
    implements: [],
    dependsOn: [],
    supersedes: [],
    supersededBy: [],
    conflictsWith: [],
    references: [],
    specRefs: [],
    tags: [],
    sections: [],
    ...overrides,
    raw,
  };
}

// --- Traceability Matrix ---

test('traceability matrix shows covered requirement', () => {
  const srd = makeArtifact({ id: 'SRD-001', kind: 'SRD', implements: [{ path: 'src/foo.ts' }] });
  const adr = makeArtifact({ id: 'ADR-001', kind: 'ADR', dependsOn: ['SRD-001'] });
  const tc = makeArtifact({
    id: 'TC-001',
    kind: 'TESTCASE',
    dependsOn: ['SRD-001'],
    raw: { id: 'TC-001', kind: 'TESTCASE', title: 'TC-001', status: 'draft', metadata: { testType: 'unit', verifies: ['SRD-001'] } },
  });

  const result = generateTraceabilityMatrix([srd, adr, tc]);
  assert.match(result, /SRD-001/);
  assert.match(result, /ADR-001/);
  assert.match(result, /TC-001/);
  assert.match(result, /covered/);
  assert.match(result, /Coverage: 100%/);
});

test('traceability matrix shows gaps when no test', () => {
  const srd = makeArtifact({ id: 'SRD-002', kind: 'SRD' });
  const result = generateTraceabilityMatrix([srd]);
  assert.match(result, /no design/);
  assert.match(result, /no test/);
  assert.match(result, /Coverage: 0%/);
});

test('traceability matrix handles empty artifacts', () => {
  const result = generateTraceabilityMatrix([]);
  assert.match(result, /no requirements found/);
  assert.match(result, /Total requirements: 0/);
});

// --- Defect Matrix ---

test('defect matrix groups by severity and status', () => {
  const d1 = makeArtifact({
    id: 'DEF-001',
    kind: 'DEFECT',
    status: 'open',
    raw: { id: 'DEF-001', kind: 'DEFECT', title: 'DEF-001', status: 'open', metadata: { severity: 'critical', priority: 'P0' } },
  });
  const d2 = makeArtifact({
    id: 'DEF-002',
    kind: 'DEFECT',
    status: 'closed',
    raw: { id: 'DEF-002', kind: 'DEFECT', title: 'DEF-002', status: 'closed', metadata: { severity: 'low' } },
  });

  const result = generateDefectMatrix([d1, d2]);
  assert.match(result, /critical/);
  assert.match(result, /low/);
  assert.match(result, /Total defects: 2/);
  assert.match(result, /Open: 1/);
});

test('defect matrix shows open defects detail', () => {
  const d1 = makeArtifact({
    id: 'DEF-003',
    kind: 'DEFECT',
    title: 'Login fails',
    status: 'triaged',
    raw: { id: 'DEF-003', kind: 'DEFECT', title: 'Login fails', status: 'triaged', metadata: { severity: 'high', priority: 'P1' } },
  });

  const result = generateDefectMatrix([d1]);
  assert.match(result, /Open Defects/);
  assert.match(result, /DEF-003/);
  assert.match(result, /Login fails/);
});

test('defect matrix handles no defects', () => {
  const result = generateDefectMatrix([]);
  assert.match(result, /Total defects: 0/);
});

// --- Coverage Matrix ---

test('coverage matrix shows per-requirement coverage', () => {
  const prd = makeArtifact({ id: 'PRD-001', kind: 'PRD', implements: [{ path: 'src/bar.ts' }] });
  const cmp = makeArtifact({ id: 'CMP-001', kind: 'COMPONENT', dependsOn: ['PRD-001'] });
  const tc = makeArtifact({
    id: 'TC-010',
    kind: 'TESTCASE',
    dependsOn: ['PRD-001'],
    raw: { id: 'TC-010', kind: 'TESTCASE', title: 'TC-010', status: 'draft', metadata: { testType: 'e2e', verifies: ['PRD-001'] } },
  });

  const result = generateCoverageMatrix([prd, cmp, tc]);
  assert.match(result, /PRD-001/);
  assert.match(result, /yes/);
  assert.match(result, /With design link: 1/);
  assert.match(result, /With code link: 1/);
  assert.match(result, /With test link: 1/);
});

test('coverage matrix handles empty', () => {
  const result = generateCoverageMatrix([]);
  assert.match(result, /no requirements found/);
  assert.match(result, /Total requirements: 0/);
});

// --- Impact Matrix ---

test('impact matrix shows dependency counts', () => {
  const a = makeArtifact({ id: 'A-001', kind: 'ADR' });
  const b = makeArtifact({ id: 'B-001', kind: 'SRD', dependsOn: ['A-001'] });
  const c = makeArtifact({ id: 'C-001', kind: 'PRD', dependsOn: ['B-001'] });

  const result = generateImpactMatrix([a, b, c]);
  assert.match(result, /A-001/);
  assert.match(result, /B-001/);
  assert.match(result, /C-001/);
  assert.match(result, /Total artifacts: 3/);
});

test('impact matrix handles empty artifacts', () => {
  const result = generateImpactMatrix([]);
  assert.match(result, /no artifacts found/);
  assert.match(result, /Total artifacts: 0/);
});

test('impact matrix shows transitive dependents', () => {
  const root = makeArtifact({ id: 'ROOT', kind: 'ADR' });
  const mid = makeArtifact({ id: 'MID', kind: 'SRD', dependsOn: ['ROOT'] });
  const leaf1 = makeArtifact({ id: 'LEAF-1', kind: 'PRD', dependsOn: ['MID'] });
  const leaf2 = makeArtifact({ id: 'LEAF-2', kind: 'PRD', dependsOn: ['MID'] });
  const leaf3 = makeArtifact({ id: 'LEAF-3', kind: 'TESTCASE', dependsOn: ['ROOT'] });

  const result = generateImpactMatrix([root, mid, leaf1, leaf2, leaf3]);
  // ROOT has transitive dependents: MID, LEAF-1, LEAF-2, LEAF-3
  assert.match(result, /High-Impact Artifacts/);
  assert.match(result, /ROOT/);
});

// --- Edge cases ---

test('defect matrix handles defect with no metadata gracefully', () => {
  const d = makeArtifact({ id: 'DEF-NO-META', kind: 'DEFECT', status: 'open' });
  const result = generateDefectMatrix([d]);
  assert.match(result, /unknown/);
  assert.match(result, /Total defects: 1/);
});

test('impact matrix counts references-based edges', () => {
  const a = makeArtifact({ id: 'BASE', kind: 'ADR' });
  const b = makeArtifact({ id: 'REF-1', kind: 'SRD', references: ['BASE'] });
  const result = generateImpactMatrix([a, b]);
  assert.match(result, /BASE/);
  // BASE should have REF-1 as a dependent via references
  assert.doesNotMatch(result, /Isolated \(0 dependents\): 2/);
});

test('impact matrix handles circular dependencies without hanging', () => {
  const a = makeArtifact({ id: 'CYCLE-A', kind: 'ADR', dependsOn: ['CYCLE-B'] });
  const b = makeArtifact({ id: 'CYCLE-B', kind: 'ADR', dependsOn: ['CYCLE-A'] });
  const result = generateImpactMatrix([a, b]);
  assert.match(result, /CYCLE-A/);
  assert.match(result, /CYCLE-B/);
  assert.match(result, /Total artifacts: 2/);
});

test('coverage matrix shows 0% for empty requirements', () => {
  const result = generateCoverageMatrix([]);
  assert.match(result, /With design link: 0 \(0%\)/);
  assert.match(result, /With code link: 0 \(0%\)/);
  assert.match(result, /With test link: 0 \(0%\)/);
});

// --- Metadata validation integration (via checker) ---

test('traceability uses metadata.verifies for test linking', () => {
  const srd = makeArtifact({ id: 'SRD-V1', kind: 'SRD', implements: [{ path: 'src/x.ts' }] });
  const adr = makeArtifact({ id: 'ADR-V1', kind: 'ADR', references: ['SRD-V1'] });
  const tc = makeArtifact({
    id: 'TC-V1',
    kind: 'TESTCASE',
    raw: { id: 'TC-V1', kind: 'TESTCASE', title: 'TC-V1', status: 'draft', metadata: { testType: 'unit', verifies: ['SRD-V1'] } },
  });

  const result = generateTraceabilityMatrix([srd, adr, tc]);
  assert.match(result, /TC-V1/);
  assert.match(result, /covered/);
});
