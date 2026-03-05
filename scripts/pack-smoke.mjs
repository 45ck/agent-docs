#!/usr/bin/env node

import { mkdtemp, rm, unlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npmCommand = 'npm';
const npxCommand = 'npx';
const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'agent-docs-pack-smoke-'));
const tarball = path.join(repoRoot, readStdout(npmCommand, ['pack', '--json'], repoRoot));

try {
  run(npmCommand, ['init', '-y'], tempRoot);
  run(npmCommand, ['install', tarball], tempRoot);
  run(npxCommand, ['agent-docs', '--help'], tempRoot);
  run(npxCommand, ['agent-docs', 'init', '.'], tempRoot);
  run(npxCommand, ['agent-docs', 'doctor', '.'], tempRoot);
} finally {
  await unlink(tarball).catch(() => {});
  await rm(tempRoot, { recursive: true, force: true });
}

function run(command, args, cwd) {
  const result = spawnSync(buildCommand(command, args), {
    cwd,
    shell: true,
    stdio: 'inherit',
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function readStdout(command, args, cwd) {
  const result = spawnSync(buildCommand(command, args), {
    cwd,
    shell: true,
    stdio: ['ignore', 'pipe', 'inherit'],
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  const match = result.stdout.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (!match) {
    throw new Error('npm pack --json did not return parseable JSON output.');
  }

  const payload = JSON.parse(match[0]);
  const file = payload?.[0]?.filename;
  if (typeof file !== 'string' || file.length === 0) {
    throw new Error('npm pack --json did not return a tarball filename.');
  }
  return file;
}

function buildCommand(command, args) {
  return [command, ...args.map(quoteArg)].join(' ');
}

function quoteArg(value) {
  if (/^[A-Za-z0-9_./:@=-]+$/.test(value)) {
    return value;
  }
  return JSON.stringify(value);
}
