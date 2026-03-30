import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { verify } from '../../v2/verify.js';
import { openStore } from '../../v2/store.js';

async function withTempDir(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'sg-verify-test-'));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

async function writeSpec(root: string, filename: string, content: string): Promise<void> {
  await mkdir(path.join(root, 'docs'), { recursive: true });
  await writeFile(path.join(root, 'docs', filename), content, 'utf8');
}

async function writeSrc(root: string, relPath: string, content: string): Promise<void> {
  const abs = path.join(root, relPath);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, content, 'utf8');
}

// ─── Integration tests ──────────────────────────────────────────

test('verify: no specs dir returns empty summary', async () => {
  await withTempDir(async (root) => {
    const store = openStore(root);
    try {
      const result = await verify({ root, store });
      assert.equal(result.results.length, 0);
      assert.equal(result.summary.specsScanned, 0);
    } finally {
      store.close();
    }
  });
});

test('verify: in_progress spec with no annotations fails', async () => {
  await withTempDir(async (root) => {
    await writeSpec(root, 'spec-a.md', `---
id: SPEC-A
title: Test Spec A
state: in_progress
kind: functional
---
# Spec A
`);
    const store = openStore(root);
    try {
      const result = await verify({ root, store });
      assert.equal(result.results.length, 1);
      assert.equal(result.results[0].specId, 'SPEC-A');
      assert.equal(result.results[0].overallResult, 'fail');
    } finally {
      store.close();
    }
  });
});

test('verify: in_progress spec + annotated .ts file passes', async () => {
  await withTempDir(async (root) => {
    await writeSpec(root, 'spec-a.md', `---
id: SPEC-A
title: Test Spec A
state: in_progress
kind: functional
---
# Spec A
`);
    await writeSrc(root, 'src/impl.ts', `
/** @spec SPEC-A @implements src/impl.ts#doThing */
export function doThing() {}
`);

    const store = openStore(root);
    try {
      const result = await verify({ root, store });
      assert.equal(result.results.length, 1);
      assert.equal(result.results[0].specId, 'SPEC-A');
      // in_progress requires E0 implementation (met via annotation+file).
      // Policy also has warnMissing: ['verification'], so overall is 'warn' not 'pass'.
      assert.equal(result.results[0].overallResult, 'warn');
    } finally {
      store.close();
    }
  });
});

test('verify: specId filter limits results', async () => {
  await withTempDir(async (root) => {
    await writeSpec(root, 'spec-a.md', `---
id: SPEC-A
title: Spec A
state: draft
kind: functional
---
`);
    await writeSpec(root, 'spec-b.md', `---
id: SPEC-B
title: Spec B
state: draft
kind: functional
---
`);

    const store = openStore(root);
    try {
      const result = await verify({ root, store, specId: 'SPEC-A' });
      assert.equal(result.results.length, 1);
      assert.equal(result.results[0].specId, 'SPEC-A');
    } finally {
      store.close();
    }
  });
});

test('verify: stores run in DB', async () => {
  await withTempDir(async (root) => {
    await writeSpec(root, 'spec-a.md', `---
id: SPEC-A
title: Spec A
state: draft
kind: functional
---
`);

    const store = openStore(root);
    try {
      await verify({ root, store });
      const latestRunId = store.getLatestRunId();
      assert.ok(latestRunId, 'Expected a run to be stored in DB');
    } finally {
      store.close();
    }
  });
});

test('verify: summary counts match results', async () => {
  await withTempDir(async (root) => {
    // SPEC-PASS: draft state, no requirements -> pass
    await writeSpec(root, 'spec-pass.md', `---
id: SPEC-PASS
title: Passing Spec
state: draft
kind: functional
---
`);
    // SPEC-FAIL: in_progress state, requires E0 impl but none provided -> fail
    await writeSpec(root, 'spec-fail.md', `---
id: SPEC-FAIL
title: Failing Spec
state: in_progress
kind: functional
---
`);

    const store = openStore(root);
    try {
      const result = await verify({ root, store });
      assert.equal(result.results.length, 2);
      assert.equal(result.summary.passed, 1, 'Expected 1 passed');
      assert.equal(result.summary.failed, 1, 'Expected 1 failed');
      assert.equal(result.summary.specsScanned, 2);
    } finally {
      store.close();
    }
  });
});

test('verify: draft spec always passes', async () => {
  await withTempDir(async (root) => {
    await writeSpec(root, 'spec-draft.md', `---
id: SPEC-DRAFT
title: Draft Spec
state: draft
kind: functional
---
# Draft spec with no annotations
`);

    const store = openStore(root);
    try {
      const result = await verify({ root, store });
      assert.equal(result.results.length, 1);
      assert.equal(result.results[0].specId, 'SPEC-DRAFT');
      assert.equal(result.results[0].overallResult, 'pass');
    } finally {
      store.close();
    }
  });
});

test('verify: done spec with E1 implementation fails (needs E2 impl + E2 verification)', async () => {
  await withTempDir(async (root) => {
    // done state requires E2 implementation and E2 verification
    await writeSpec(root, 'spec-done.md', `---
id: SPEC-DONE
title: Done Spec
state: done
kind: functional
---
`);
    // Add IMPLEMENTS annotation (annotation=E0, file provider upgrades to E1)
    await writeSrc(root, 'src/impl.ts', `
/** @spec SPEC-DONE @implements src/impl.ts#doThing */
export function doThing() {}
`);

    const store = openStore(root);
    try {
      const result = await verify({ root, store });
      assert.equal(result.results.length, 1);
      assert.equal(result.results[0].specId, 'SPEC-DONE');
      // done requires E2 impl, E2 verification, E1 models.
      // Implementation is E1 (insufficient), verification has no claims (fail),
      // models has no claims (fail). 'fail' takes priority over 'insufficient-evidence'.
      assert.equal(result.results[0].overallResult, 'fail');
    } finally {
      store.close();
    }
  });
});
