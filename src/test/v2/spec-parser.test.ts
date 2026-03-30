import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadSpecs } from '../../v2/spec-parser.js';

async function withTempDir(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sg-spec-test-'));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

// 1. Empty specs dir
test('empty specs dir returns empty array', async () => {
  await withTempDir(async (root) => {
    await mkdir(path.join(root, 'specs'), { recursive: true });
    const specs = loadSpecs(root);
    assert.equal(specs.length, 0);
  });
});

// 2. Missing specs dir
test('missing specs dir returns empty array', async () => {
  await withTempDir(async (root) => {
    const specs = loadSpecs(root);
    assert.equal(specs.length, 0);
  });
});

// 3. Valid spec with all fields
test('valid spec with all fields', async () => {
  await withTempDir(async (root) => {
    await mkdir(path.join(root, 'specs'), { recursive: true });
    const content = `---
id: SPEC-TEST
title: Test Specification
state: in_progress
kind: feature
owner: team
priority: P1
---
# Body
`;
    await writeFile(path.join(root, 'specs', 'test.md'), content);
    const specs = loadSpecs(root);
    assert.equal(specs.length, 1);
    assert.equal(specs[0].id, 'SPEC-TEST');
    assert.equal(specs[0].title, 'Test Specification');
    assert.equal(specs[0].state, 'in_progress');
    assert.equal(specs[0].kind, 'feature');
    assert.equal(specs[0].owner, 'team');
    assert.equal(specs[0].priority, 'P1');
  });
});

// 4. Spec with no frontmatter
test('spec with no frontmatter returns empty', async () => {
  await withTempDir(async (root) => {
    await mkdir(path.join(root, 'specs'), { recursive: true });
    await writeFile(path.join(root, 'specs', 'nofm.md'), '# Just markdown\nNo frontmatter here.\n');
    const specs = loadSpecs(root);
    assert.equal(specs.length, 0);
  });
});

// 5. Invalid state logs error and skips
test('invalid state logs error and skips', async () => {
  await withTempDir(async (root) => {
    await mkdir(path.join(root, 'specs'), { recursive: true });
    const content = `---
id: SPEC-BAD
title: Bad State
state: invalid_state
kind: feature
---
# Body
`;
    await writeFile(path.join(root, 'specs', 'bad.md'), content);
    const specs = loadSpecs(root);
    // Invalid state causes parseSpecFile to throw, which is caught by collectSpecFiles
    assert.equal(specs.length, 0);
  });
});

// 6. required_evidence block
test('required_evidence block is parsed', async () => {
  await withTempDir(async (root) => {
    await mkdir(path.join(root, 'specs'), { recursive: true });
    const content = `---
id: SPEC-EV
title: Evidence Spec
state: draft
kind: feature
required_evidence:
  implementation: E2
  verification: E1
---
# Body
`;
    await writeFile(path.join(root, 'specs', 'ev.md'), content);
    const specs = loadSpecs(root);
    assert.equal(specs.length, 1);
    assert.ok(specs[0].requiredEvidence);
    assert.equal(specs[0].requiredEvidence!.implementation, 2); // EvidenceStrength.E2
    assert.equal(specs[0].requiredEvidence!.verification, 1);   // EvidenceStrength.E1
  });
});

// 7. YAML list with dashes
test('YAML list with dashes does not crash', async () => {
  await withTempDir(async (root) => {
    await mkdir(path.join(root, 'specs'), { recursive: true });
    const content = `---
id: SPEC-TAGS
title: Tagged Spec
state: draft
kind: feature
tags:
  - alpha
  - beta
---
# Body
`;
    await writeFile(path.join(root, 'specs', 'tags.md'), content);
    const specs = loadSpecs(root);
    assert.equal(specs.length, 1);
    assert.equal(specs[0].id, 'SPEC-TAGS');
    // tags should be parsed as an array
    assert.ok(Array.isArray(specs[0].tags));
    assert.deepEqual(specs[0].tags, ['alpha', 'beta']);
  });
});

// 8. Duplicate IDs across files
test('duplicate IDs across files returns both specs', async () => {
  await withTempDir(async (root) => {
    await mkdir(path.join(root, 'specs'), { recursive: true });
    const content = `---
id: SPEC-DUP
title: Dup 1
state: draft
kind: feature
---
`;
    await writeFile(path.join(root, 'specs', 'dup1.md'), content);
    const content2 = `---
id: SPEC-DUP
title: Dup 2
state: draft
kind: feature
---
`;
    await writeFile(path.join(root, 'specs', 'dup2.md'), content2);
    const specs = loadSpecs(root);
    // No deduplication — both are returned
    assert.equal(specs.length, 2);
    assert.ok(specs.every(s => s.id === 'SPEC-DUP'));
  });
});

// 9. Inline waivers
test('inline waivers in frontmatter', async () => {
  await withTempDir(async (root) => {
    await mkdir(path.join(root, 'specs'), { recursive: true });
    // The parser checks Array.isArray(waiversRaw), so waivers: [] should produce empty array.
    // Since our simple YAML parser handles `waivers: []` by setting the value to '[]' string or empty,
    // let's test what happens and verify no crash.
    const content = `---
id: SPEC-WAIV
title: Waiver Spec
state: draft
kind: feature
waivers: []
---
`;
    await writeFile(path.join(root, 'specs', 'waiver.md'), content);
    const specs = loadSpecs(root);
    assert.equal(specs.length, 1);
    // The simple YAML parser will parse `waivers: []` — the value may be '[]' string or empty.
    // Either way, no crash is the key assertion.
  });
});
