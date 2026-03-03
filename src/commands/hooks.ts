import path from 'node:path';
import { execSync } from 'node:child_process';
import { configPath, fileExists, loadConfig } from '../config.js';
import { writeText } from '../lib/utils.js';

export async function runInstallGates(
  root: string,
  force: boolean,
  useCoreHooksPath: boolean,
  useNoslop: boolean,
): Promise<void> {
  const resolved = path.resolve(root);
  const config = await loadConfig(resolved);
  const preCommitTarget = path.join(resolved, config.hooks.preCommitPath);
  const prePushTarget = path.join(resolved, config.hooks.prePushPath);

  const preCommitContent = generateHookScripts({ useNoslop, isPrePush: false });
  const prePushContent = generateHookScripts({ useNoslop, isPrePush: true });

  await writeText(preCommitTarget, preCommitContent);
  await writeText(prePushTarget, prePushContent);

  if (useCoreHooksPath) {
    const hooksDirectory = path.join(resolved, '.agent-docs', 'hooks');
    const localPreCommit = path.join(hooksDirectory, 'pre-commit');
    const localPrePush = path.join(hooksDirectory, 'pre-push');
    if (!force && (await fileExists(localPreCommit)) && (await fileExists(localPrePush))) {
      console.log('Hook files already exist in .agent-docs/hooks; use --force to overwrite.');
    } else {
      await writeText(localPreCommit, preCommitContent);
      await writeText(localPrePush, prePushContent);
    }

    const hasGit = await fileExists(configPath(resolved, '.git'));
    if (hasGit) {
      await execGitCommand(['config', 'core.hooksPath', '.agent-docs/hooks'], resolved);
      console.log('Configured git core.hooksPath to .agent-docs/hooks');
    } else {
      console.log('No .git folder found; wrote hook scripts at .githooks only.');
    }
  }

  console.log(`Installed hooks:
  - ${path.relative(resolved, preCommitTarget)}
  - ${path.relative(resolved, prePushTarget)}`);

  if (useNoslop) {
    await reportNoslopAvailability(resolved);
  }
}

function generateHookScripts(params: { useNoslop: boolean; isPrePush: boolean }): string {
  const tier = params.isPrePush ? 'slow' : 'fast';
  const lines: string[] = [
    '#!/usr/bin/env sh',
    'set -euo pipefail',
    'if [ -n "${SKIP_AGENT_DOCS_CHECK:-}" ]; then',
    '  exit 0',
    'fi',
    '',
    'ROOT_DIR="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"',
    '',
  ];

  if (params.useNoslop) {
    lines.push(
      'run_noslop_check() {',
      '  NOSLOP_LOCAL="${ROOT_DIR}/node_modules/.bin/noslop"',
      '  if [ -x "${NOSLOP_LOCAL}" ]; then',
      `    "\${NOSLOP_LOCAL}" check --tier ${tier} --dir "\${ROOT_DIR}"`,
      '    return $?',
      '  fi',
      '',
      '  if command -v noslop >/dev/null 2>&1; then',
      `    noslop check --tier ${tier} --dir "\${ROOT_DIR}"`,
      '    return $?',
      '  fi',
      '',
      '  if [ -n "${RUN_NOSLOP_CHECKS:-}" ]; then',
      '    if command -v npx >/dev/null 2>&1; then',
      `      npx --yes --quiet @45ck/noslop@1.0.0 check --tier ${tier} --dir "\${ROOT_DIR}"`,
      '      return $?',
      '    fi',
      '  fi',
      '',
      '  return 0',
      '}',
      'run_noslop_check',
      '',
    );
  }

  lines.push(
    'if [ -x "${ROOT_DIR}/node_modules/.bin/agent-docs" ]; then',
    '  exec "${ROOT_DIR}/node_modules/.bin/agent-docs" check --strict --root "${ROOT_DIR}"',
    'elif command -v agent-docs >/dev/null 2>&1; then',
    '  exec agent-docs check --strict --root "${ROOT_DIR}"',
    'elif command -v npx >/dev/null 2>&1; then',
    '  exec npx --yes --quiet agent-docs check --strict --root "${ROOT_DIR}"',
    'else',
    '  echo "[agent-docs] No agent-docs executable available."',
    '  exit 1',
    'fi',
  );

  return lines.join('\n');
}

async function reportNoslopAvailability(root: string): Promise<void> {
  const localNoslop = path.join(root, 'node_modules', '.bin', 'noslop');
  if (await fileExists(localNoslop)) {
    console.log('Detected local @45ck/noslop in node_modules/.bin');
    return;
  }

  try {
    execSync('command -v noslop', { stdio: 'ignore' });
    console.log('Detected noslop in PATH');
    return;
  } catch {
    console.log(
      'INFO: @45ck/noslop was requested but not detected. Install it manually with `npm i -D @45ck/noslop@1.0.0` when available, or run with RUN_NOSLOP_CHECKS=1 for temporary npx usage.',
    );
  }
}

async function execGitCommand(args: string[], cwd: string): Promise<void> {
  try {
    execSync(`git ${args.join(' ')}`, { cwd, stdio: 'inherit' });
  } catch (error) {
    const message = error instanceof Error ? `: ${error.message}` : '';
    console.error(`git config failed${message}`);
  }
}
