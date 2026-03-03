import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeDefaultConfig } from '../config.js';
import { copyDirectory, ensureDirectory, writeText } from '../lib/utils.js';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BUILTIN_TEMPLATE_DIR = path.join(PACKAGE_ROOT, 'templates');
const BUILTIN_HOOK_DIR = path.join(PACKAGE_ROOT, '.agent-docs', 'hooks');

function packageTemplateSource(): string {
  return BUILTIN_TEMPLATE_DIR;
}

function packageHookSource(): string {
  return BUILTIN_HOOK_DIR;
}

export async function runInit(root: string): Promise<void> {
  const target = path.resolve(root);
  await writeDefaultConfig(target);

  const docsDir = path.join(target, 'docs');
  await ensureDirectory(docsDir);

  const templateDestination = path.join(target, '.agent-docs', 'templates');
  const hookDestination = path.join(target, '.agent-docs', 'hooks');
  await copyDirectory(packageTemplateSource(), templateDestination);
  await copyDirectory(packageHookSource(), hookDestination);

  const samplePlan = path.join(docsDir, 'PLAN.a-doc');
  const sampleExists = existsSync(samplePlan);
  if (!sampleExists) {
    const sourcePath = path.join(templateDestination, 'PLAN.a-doc');
    const fallback = `{
  "id": "PLAN-000",
  "kind": "OTHER",
  "title": "Initial Project Plan",
  "status": "draft",
  "scope": "platform",
  "owner": "You",
  "date": "${new Date().toISOString().split('T')[0]}",
  "tags": ["bootstrap"],
  "sections": [
    {
      "title": "Context",
      "body": "This file is a starting point. Replace with your real plan."
    }
  ]
}`;
    const sample = existsSync(sourcePath)
      ? await fs.readFile(sourcePath, 'utf8').catch(() => fallback)
      : fallback;
    await writeText(samplePlan, sample);
  }

  const hookScript = await fs
    .readFile(path.join(hookDestination, 'README.md'), 'utf8')
    .catch(() => '');
  if (!hookScript) {
    await writeText(path.join(hookDestination, 'README.md'), readmeForHooks());
  }
}

function readmeForHooks(): string {
  return [
    '# Hook Templates',
    '',
    'The files in this folder are automatically installed by',
    '`agent-docs install-gates` when you want git hooks in this repo.',
    '',
    'Current files:',
    '- `pre-commit`',
    '- `pre-push`',
    '',
  ].join('\n');
}
