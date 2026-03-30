import test from 'node:test';
import assert from 'node:assert/strict';
import { claimId, uuid } from '../../v2/id.js';

// --- claimId ---

test('claimId is deterministic', () => {
  const a = claimId('spec-1', 'IMPLEMENTS', 'symbol:ts:src/foo.ts#bar', 'annotation');
  const b = claimId('spec-1', 'IMPLEMENTS', 'symbol:ts:src/foo.ts#bar', 'annotation');
  assert.equal(a, b);
});

test('claimId is 32 hex chars', () => {
  const id = claimId('spec-1', 'IMPLEMENTS', 'symbol:ts:src/foo.ts#bar', 'annotation');
  assert.match(id, /^[0-9a-f]{32}$/);
});

test('different src produces different claimId', () => {
  const a = claimId('spec-1', 'IMPLEMENTS', 'symbol:ts:src/foo.ts#bar', 'annotation');
  const b = claimId('spec-2', 'IMPLEMENTS', 'symbol:ts:src/foo.ts#bar', 'annotation');
  assert.notEqual(a, b);
});

test('different relation produces different claimId', () => {
  const a = claimId('spec-1', 'IMPLEMENTS', 'symbol:ts:src/foo.ts#bar', 'annotation');
  const b = claimId('spec-1', 'VERIFIED_BY', 'symbol:ts:src/foo.ts#bar', 'annotation');
  assert.notEqual(a, b);
});

test('different dst produces different claimId', () => {
  const a = claimId('spec-1', 'IMPLEMENTS', 'symbol:ts:src/foo.ts#bar', 'annotation');
  const b = claimId('spec-1', 'IMPLEMENTS', 'symbol:ts:src/baz.ts#baz', 'annotation');
  assert.notEqual(a, b);
});

test('different provider produces different claimId', () => {
  const a = claimId('spec-1', 'IMPLEMENTS', 'symbol:ts:src/foo.ts#bar', 'annotation');
  const b = claimId('spec-1', 'IMPLEMENTS', 'symbol:ts:src/foo.ts#bar', 'ctags');
  assert.notEqual(a, b);
});

// --- uuid ---

test('uuid matches UUID format', () => {
  const id = uuid();
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});

test('uuid produces unique values', () => {
  const a = uuid();
  const b = uuid();
  assert.notEqual(a, b);
});
