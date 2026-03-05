import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runInstallGates } from '../commands/hooks.js';

async function withTempDir(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'agent-docs-hooks-'));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('runInstallGates writes portable hooks with scoped npx fallbacks', async () => {
  await withTempDir(async (root) => {
    await runInstallGates(root, false, false, true);

    const preCommit = await readFile(path.join(root, '.agent-docs', 'hooks', 'pre-commit'), 'utf8');
    const prePush = await readFile(path.join(root, '.agent-docs', 'hooks', 'pre-push'), 'utf8');

    for (const content of [preCommit, prePush]) {
      assert.match(content, /set -eu/);
      assert.doesNotMatch(content, /pipefail/);
      assert.match(content, /@45ck\/agent-docs/);
    }

    assert.match(preCommit, /@45ck\/noslop@1\.0\.0 check --tier fast/);
    assert.match(prePush, /@45ck\/noslop@1\.0\.0 check --tier slow/);
  });
});
