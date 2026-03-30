import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EvidenceStrength,
  parseEvidenceStrength,
  evidenceStrengthLabel,
  makeSubjectId,
  parseSubjectId,
} from '../../v2/types.js';

// --- parseEvidenceStrength ---

test('parseEvidenceStrength parses E0', () => {
  assert.equal(parseEvidenceStrength('E0'), EvidenceStrength.E0);
});

test('parseEvidenceStrength parses E4', () => {
  assert.equal(parseEvidenceStrength('E4'), EvidenceStrength.E4);
});

test('parseEvidenceStrength handles lowercase e2', () => {
  assert.equal(parseEvidenceStrength('e2'), EvidenceStrength.E2);
});

test('parseEvidenceStrength throws on invalid string', () => {
  assert.throws(() => parseEvidenceStrength('invalid'), /Invalid evidence strength/);
});

test('parseEvidenceStrength throws on empty string', () => {
  assert.throws(() => parseEvidenceStrength(''), /Invalid evidence strength/);
});

// --- evidenceStrengthLabel ---

test('evidenceStrengthLabel returns correct label for E0', () => {
  assert.equal(evidenceStrengthLabel(EvidenceStrength.E0), 'E0 (declarative)');
});

test('evidenceStrengthLabel returns correct label for E1', () => {
  assert.equal(evidenceStrengthLabel(EvidenceStrength.E1), 'E1 (structural)');
});

// --- makeSubjectId / parseSubjectId ---

test('makeSubjectId produces correct format', () => {
  const id = makeSubjectId('symbol', 'annotation', 'src/foo.ts#bar');
  assert.equal(id, 'symbol:annotation:src/foo.ts#bar');
});

test('makeSubjectId throws when kind contains colon', () => {
  assert.throws(() => makeSubjectId('sym:bol', 'annotation', 'src/foo.ts#bar'), /must not contain colons/);
});

test('makeSubjectId throws when provider contains colon', () => {
  assert.throws(() => makeSubjectId('symbol', 'anno:tation', 'src/foo.ts#bar'), /must not contain colons/);
});

test('makeSubjectId allows colons in identity', () => {
  assert.doesNotThrow(() => makeSubjectId('symbol', 'ts', 'src/foo.ts:10:5'));
});

test('parseSubjectId round-trips with makeSubjectId', () => {
  const id = makeSubjectId('symbol', 'ts', 'src/auth.ts#login');
  const parsed = parseSubjectId(id);
  assert.equal(parsed.kind, 'symbol');
  assert.equal(parsed.provider, 'ts');
  assert.equal(parsed.identity, 'src/auth.ts#login');
});

test('parseSubjectId parses correctly', () => {
  const parsed = parseSubjectId('symbol:ts:src/auth.ts#login');
  assert.deepEqual(parsed, { kind: 'symbol', provider: 'ts', identity: 'src/auth.ts#login' });
});

test('parseSubjectId throws on string with no colons', () => {
  assert.throws(() => parseSubjectId('invalid'), /Malformed SubjectId/);
});
