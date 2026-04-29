import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
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

test('runInstallGates writes portable executable hooks without agent-docs npx fallback', async () => {
  await withTempDir(async (root) => {
    await runInstallGates(root, false, false, true);

    const preCommitPath = path.join(root, '.specgraph', 'hooks', 'pre-commit');
    const prePushPath = path.join(root, '.specgraph', 'hooks', 'pre-push');
    const preCommit = await readFile(preCommitPath, 'utf8');
    const prePush = await readFile(prePushPath, 'utf8');

    for (const content of [preCommit, prePush]) {
      assert.match(content, /set -eu/);
      assert.doesNotMatch(content, /pipefail/);
      assert.doesNotMatch(content, /npx --yes --quiet @45ck\/agent-docs/);
      assert.match(content, /No agent-docs executable available/);
    }

    assert.match(preCommit, /@45ck\/noslop@1\.0\.0 check --tier fast/);
    assert.match(prePush, /@45ck\/noslop@1\.0\.0 check --tier slow/);

    if (process.platform !== 'win32') {
      assert.ok((await stat(preCommitPath)).mode & 0o111);
      assert.ok((await stat(prePushPath)).mode & 0o111);
    }
  });
});
