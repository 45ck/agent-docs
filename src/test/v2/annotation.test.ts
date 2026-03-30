import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseAnnotations, AnnotationProvider } from '../../v2/providers/annotation.js';
import { EvidenceStrength } from '../../v2/types.js';

async function withTempDir(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sg-ann-test-'));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

// ─── parseAnnotations (pure function) ────────────────────────────

test('parseAnnotations: JSDoc block with @spec + @implements', () => {
  const src = `
/**
 * @spec SPEC-001
 * @implements src/auth.ts#login
 */
export function login() {}
`;
  const result = parseAnnotations(src);
  assert.equal(result.length, 1);
  assert.equal(result[0].spec, 'SPEC-001');
  assert.deepEqual(result[0].implements, ['src/auth.ts#login']);
});

test('parseAnnotations: // comment block with @spec + @test', () => {
  const src = `
// @spec SPEC-002
// @test tests/auth.spec.ts
function doStuff() {}
`;
  const result = parseAnnotations(src);
  assert.equal(result.length, 1);
  assert.equal(result[0].spec, 'SPEC-002');
  assert.deepEqual(result[0].test, ['tests/auth.spec.ts']);
});

test('parseAnnotations: @spec + @model returns annotation with model array', () => {
  const src = `
/**
 * @spec SPEC-003
 * @model User
 * @model Account
 */
`;
  const result = parseAnnotations(src);
  assert.equal(result.length, 1);
  assert.equal(result[0].spec, 'SPEC-003');
  assert.deepEqual(result[0].model, ['User', 'Account']);
});

test('parseAnnotations: @spec + @api returns annotation with api array', () => {
  const src = `
/**
 * @spec SPEC-004
 * @api POST:/api/login
 */
`;
  const result = parseAnnotations(src);
  assert.equal(result.length, 1);
  assert.equal(result[0].spec, 'SPEC-004');
  assert.deepEqual(result[0].api, ['POST:/api/login']);
});

test('parseAnnotations: @spec + @dependsOn returns annotation with dependsOn array', () => {
  const src = `
/**
 * @spec SPEC-005
 * @dependsOn SPEC-001
 * @dependsOn SPEC-002
 */
`;
  const result = parseAnnotations(src);
  assert.equal(result.length, 1);
  assert.equal(result[0].spec, 'SPEC-005');
  assert.deepEqual(result[0].dependsOn, ['SPEC-001', 'SPEC-002']);
});

test('parseAnnotations: multiple @implements in one block all captured', () => {
  const src = `
/**
 * @spec SPEC-006
 * @implements src/foo.ts#bar
 * @implements src/baz.ts#qux
 * @implements src/hello.ts#world
 */
`;
  const result = parseAnnotations(src);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].implements, [
    'src/foo.ts#bar',
    'src/baz.ts#qux',
    'src/hello.ts#world',
  ]);
});

test('parseAnnotations: block with ONLY @implements (no @spec) returns empty array', () => {
  const src = `
/**
 * @implements src/orphan.ts#fn
 */
`;
  const result = parseAnnotations(src);
  assert.equal(result.length, 0);
});

test('parseAnnotations: source with no annotations returns empty array', () => {
  const src = `
export function hello() {
  return 'world';
}
`;
  const result = parseAnnotations(src);
  assert.equal(result.length, 0);
});

test('parseAnnotations: Python-style docstring with @spec captured', () => {
  const src = `
"""
@spec SPEC-PY1
@implements lib/auth.py#login
"""
def login():
    pass
`;
  const result = parseAnnotations(src);
  assert.equal(result.length, 1);
  assert.equal(result[0].spec, 'SPEC-PY1');
  assert.deepEqual(result[0].implements, ['lib/auth.py#login']);
});

test('parseAnnotations: @spec in single-line // comment captured', () => {
  const src = `// @spec SPEC-SINGLE @implements src/single.ts#fn`;
  const result = parseAnnotations(src);
  assert.equal(result.length, 1);
  assert.equal(result[0].spec, 'SPEC-SINGLE');
  assert.deepEqual(result[0].implements, ['src/single.ts#fn']);
});

// ─── AnnotationProvider.scan (requires filesystem) ──────────────

test('AnnotationProvider.scan: .ts file with @spec and @implements produces IMPLEMENTS claim', async () => {
  await withTempDir(async (root) => {
    const srcContent = `
/**
 * @spec SPEC-X
 * @implements src/foo.ts#bar
 */
export function bar() {}
`;
    await mkdir(path.join(root, 'src'), { recursive: true });
    await writeFile(path.join(root, 'src', 'foo.ts'), srcContent, 'utf8');

    const provider = new AnnotationProvider();
    const result = await provider.scan({ root, runId: 'test-run-1', changedFiles: undefined });

    assert.ok(result.claims.length >= 1, 'Expected at least one claim');
    const implClaim = result.claims.find(c => c.relation === 'IMPLEMENTS');
    assert.ok(implClaim, 'Expected an IMPLEMENTS claim');
    assert.equal(implClaim.src, 'SPEC-X');
    assert.equal(implClaim.strength, EvidenceStrength.E0);
  });
});

test('AnnotationProvider.scan: node_modules dir is NOT scanned', async () => {
  await withTempDir(async (root) => {
    const srcContent = `
/**
 * @spec SPEC-NM
 * @implements node_modules/pkg/index.ts#fn
 */
`;
    await mkdir(path.join(root, 'node_modules', 'pkg'), { recursive: true });
    await writeFile(path.join(root, 'node_modules', 'pkg', 'index.ts'), srcContent, 'utf8');

    const provider = new AnnotationProvider();
    const result = await provider.scan({ root, runId: 'test-run-2', changedFiles: undefined });

    assert.equal(result.claims.length, 0, 'node_modules should be ignored');
  });
});

test('AnnotationProvider.scan: .json file is ignored (not in scannable extensions)', async () => {
  await withTempDir(async (root) => {
    const jsonContent = `{ "comment": "@spec SPEC-JSON @implements src/foo.ts#bar" }`;
    await writeFile(path.join(root, 'config.json'), jsonContent, 'utf8');

    const provider = new AnnotationProvider();
    const result = await provider.scan({ root, runId: 'test-run-3', changedFiles: undefined });

    assert.equal(result.claims.length, 0, '.json files should not be scanned');
  });
});

test('AnnotationProvider.scan: changedFiles limits which files are scanned', async () => {
  await withTempDir(async (root) => {
    const srcA = `/** @spec SPEC-A @implements src/a.ts#fn */\nexport function fn() {}`;
    const srcB = `/** @spec SPEC-B @implements src/b.ts#fn */\nexport function fn() {}`;
    await mkdir(path.join(root, 'src'), { recursive: true });
    await writeFile(path.join(root, 'src', 'a.ts'), srcA, 'utf8');
    await writeFile(path.join(root, 'src', 'b.ts'), srcB, 'utf8');

    const provider = new AnnotationProvider();
    const result = await provider.scan({
      root,
      runId: 'test-run-4',
      changedFiles: ['src/a.ts'],
    });

    // Only SPEC-A should be found
    const specIds = result.claims.map(c => c.src);
    assert.ok(specIds.includes('SPEC-A'), 'SPEC-A should be scanned');
    assert.ok(!specIds.includes('SPEC-B'), 'SPEC-B should NOT be scanned (not in changedFiles)');
  });
});

test('AnnotationProvider.scan: returns subjects for implements targets', async () => {
  await withTempDir(async (root) => {
    const srcContent = `/** @spec SPEC-S @implements src/impl.ts#doThing */\nexport function doThing() {}`;
    await mkdir(path.join(root, 'src'), { recursive: true });
    await writeFile(path.join(root, 'src', 'impl.ts'), srcContent, 'utf8');

    const provider = new AnnotationProvider();
    const result = await provider.scan({ root, runId: 'test-run-5', changedFiles: undefined });

    assert.ok(result.subjects.length >= 1, 'Expected at least one subject');
    const subject = result.subjects.find(s => s.identity === 'src/impl.ts#doThing');
    assert.ok(subject, 'Expected subject for implements target');
    assert.equal(subject.kind, 'symbol');
    assert.equal(subject.provider, 'annotation');
  });
});
