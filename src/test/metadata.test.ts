import assert from 'node:assert/strict';
import test from 'node:test';
import type { ParsedArtifact, ArtifactInput } from '../types.js';
import { evaluateKindMetadata, Collector } from '../lib/checker.js';
import { KIND_METADATA_SCHEMAS } from '../lib/metadata-schemas.js';

function makeArtifact(kind: string, metadata: Record<string, unknown>): ParsedArtifact {
  const raw: ArtifactInput = {
    id: 'TEST-001',
    kind,
    title: 'Test',
    status: 'draft',
    metadata,
  };
  return {
    path: 'docs/TEST-001.toon',
    id: 'TEST-001',
    kind,
    title: 'Test',
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
    raw,
  };
}

// --- Schema shape tests ---

test('KIND_METADATA_SCHEMAS has entries for expected kinds', () => {
  const expected = ['TESTCASE', 'DEFECT', 'RISK', 'INTERFACE', 'COMPONENT'];
  for (const kind of expected) {
    assert.ok(KIND_METADATA_SCHEMAS[kind], `Missing schema for ${kind}`);
  }
});

test('TESTCASE schema requires testType and verifies', () => {
  const schema = KIND_METADATA_SCHEMAS.TESTCASE;
  assert.ok(schema.fields.testType.required);
  assert.equal(schema.fields.testType.type, 'string');
  assert.deepEqual(schema.fields.testType.allowedValues, ['unit', 'integration', 'e2e', 'manual', 'performance']);
  assert.ok(schema.fields.verifies.required);
  assert.equal(schema.fields.verifies.type, 'string[]');
});

test('DEFECT schema requires severity', () => {
  const schema = KIND_METADATA_SCHEMAS.DEFECT;
  assert.ok(schema.fields.severity.required);
  assert.deepEqual(schema.fields.severity.allowedValues, ['critical', 'high', 'medium', 'low']);
  assert.ok(!schema.fields.priority.required);
  assert.ok(!schema.fields.affectedArtifacts.required);
});

test('RISK schema requires probability and impact (1-5)', () => {
  const schema = KIND_METADATA_SCHEMAS.RISK;
  assert.ok(schema.fields.probability.required);
  assert.equal(schema.fields.probability.type, 'number');
  assert.deepEqual(schema.fields.probability.allowedValues, [1, 2, 3, 4, 5]);
  assert.ok(schema.fields.impact.required);
});

test('INTERFACE schema has optional protocol', () => {
  const schema = KIND_METADATA_SCHEMAS.INTERFACE;
  assert.ok(!schema.fields.protocol.required);
  assert.deepEqual(schema.fields.protocol.allowedValues, ['REST', 'gRPC', 'GraphQL', 'event']);
});

test('COMPONENT schema has optional parentComponent', () => {
  const schema = KIND_METADATA_SCHEMAS.COMPONENT;
  assert.ok(!schema.fields.parentComponent.required);
  assert.equal(schema.fields.parentComponent.type, 'string');
});

// --- evaluateKindMetadata tests ---

test('kind with no schema returns no issues', () => {
  const collector = new Collector();
  const artifact = makeArtifact('RUNBOOK', {});
  evaluateKindMetadata(artifact, collector);
  assert.equal(collector.toArray().length, 0);
});

test('missing required field emits METADATA_REQUIRED', () => {
  const collector = new Collector();
  const artifact = makeArtifact('TESTCASE', {});
  evaluateKindMetadata(artifact, collector);
  const issues = collector.toArray();
  const required = issues.filter((i) => i.code === 'METADATA_REQUIRED');
  assert.ok(required.length >= 2, 'Expected at least 2 METADATA_REQUIRED issues for testType and verifies');
  assert.ok(required.some((i) => i.message.includes('testType')));
  assert.ok(required.some((i) => i.message.includes('verifies')));
});

test('empty array for required string[] emits METADATA_REQUIRED', () => {
  const collector = new Collector();
  const artifact = makeArtifact('TESTCASE', { testType: 'unit', verifies: [] });
  evaluateKindMetadata(artifact, collector);
  const issues = collector.toArray();
  assert.ok(issues.some((i) => i.code === 'METADATA_REQUIRED' && i.message.includes('verifies')));
});

test('string field given number emits METADATA_INVALID_TYPE', () => {
  const collector = new Collector();
  const artifact = makeArtifact('TESTCASE', { testType: 42, verifies: ['SRD-001'] });
  evaluateKindMetadata(artifact, collector);
  const issues = collector.toArray();
  assert.ok(issues.some((i) => i.code === 'METADATA_INVALID_TYPE' && i.message.includes('testType')));
});

test('number field given string emits METADATA_INVALID_TYPE', () => {
  const collector = new Collector();
  const artifact = makeArtifact('RISK', { probability: 'high', impact: 3 });
  evaluateKindMetadata(artifact, collector);
  const issues = collector.toArray();
  assert.ok(issues.some((i) => i.code === 'METADATA_INVALID_TYPE' && i.message.includes('probability')));
});

test('string[] field given scalar emits METADATA_INVALID_TYPE', () => {
  const collector = new Collector();
  const artifact = makeArtifact('TESTCASE', { testType: 'unit', verifies: 'SRD-001' });
  evaluateKindMetadata(artifact, collector);
  const issues = collector.toArray();
  assert.ok(issues.some((i) => i.code === 'METADATA_INVALID_TYPE' && i.message.includes('verifies')));
});

test('invalid enum value emits METADATA_INVALID_ENUM', () => {
  const collector = new Collector();
  const artifact = makeArtifact('TESTCASE', { testType: 'smoke', verifies: ['SRD-001'] });
  evaluateKindMetadata(artifact, collector);
  const issues = collector.toArray();
  assert.ok(issues.some((i) => i.code === 'METADATA_INVALID_ENUM' && i.message.includes('smoke')));
});

test('valid metadata emits no issues', () => {
  const collector = new Collector();
  const artifact = makeArtifact('TESTCASE', { testType: 'unit', verifies: ['SRD-001'] });
  evaluateKindMetadata(artifact, collector);
  assert.equal(collector.toArray().length, 0);
});

test('valid RISK metadata emits no issues', () => {
  const collector = new Collector();
  const artifact = makeArtifact('RISK', { probability: 3, impact: 5 });
  evaluateKindMetadata(artifact, collector);
  assert.equal(collector.toArray().length, 0);
});

test('optional field with valid value emits no issues', () => {
  const collector = new Collector();
  const artifact = makeArtifact('INTERFACE', { protocol: 'gRPC' });
  evaluateKindMetadata(artifact, collector);
  assert.equal(collector.toArray().length, 0);
});

test('optional field omitted emits no issues', () => {
  const collector = new Collector();
  const artifact = makeArtifact('INTERFACE', {});
  evaluateKindMetadata(artifact, collector);
  assert.equal(collector.toArray().length, 0);
});

test('number enum with out-of-range value emits METADATA_INVALID_ENUM', () => {
  const collector = new Collector();
  const artifact = makeArtifact('RISK', { probability: 7, impact: 3 });
  evaluateKindMetadata(artifact, collector);
  const issues = collector.toArray();
  assert.ok(issues.some((i) => i.code === 'METADATA_INVALID_ENUM' && i.message.includes('7')));
});
