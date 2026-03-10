import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encode } from '@toon-format/toon';
import { loadConfig, writeDefaultConfig } from '../config.js';
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
  const config = await loadConfig(target);
  const configExtension = config.sourceExtension.toLowerCase();
  const sampleFileName = `PLAN${configExtension}`;
  const date = new Date().toISOString().split('T')[0];

  const docsDir = path.join(target, 'docs');
  await ensureDirectory(docsDir);

  const templateDestination = path.join(target, '.agent-docs', 'templates');
  const hookDestination = path.join(target, '.agent-docs', 'hooks');
  await copyDirectory(packageTemplateSource(), templateDestination);
  await copyDirectory(packageHookSource(), hookDestination);

  const samplePlan = path.join(docsDir, sampleFileName);
  const sampleExists = existsSync(samplePlan);
  if (!sampleExists) {
    const sourcePath = path.join(templateDestination, sampleFileName);
    const fallbackTemplate = configExtension === '.toon' ? buildToonPlanTemplate(date) : buildJsonPlanTemplate(date);
    const sample = existsSync(sourcePath)
      ? await fs.readFile(sourcePath, 'utf8').catch(() => fallbackTemplate)
      : fallbackTemplate;
    await writeText(samplePlan, sample);
  }

  await ensureDocsScripts(target);

  const hookScript = await fs
    .readFile(path.join(hookDestination, 'README.md'), 'utf8')
    .catch(() => '');
  if (!hookScript) {
    await writeText(path.join(hookDestination, 'README.md'), readmeForHooks());
  }
}

async function ensureDocsScripts(target: string): Promise<void> {
  const packageJsonPath = path.join(target, 'package.json');
  const raw = await fs.readFile(packageJsonPath, 'utf8').catch(() => null);
  if (!raw) {
    return;
  }

  let packageConfig: Record<string, unknown>;
  try {
    packageConfig = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return;
  }

  const scripts = packageConfig.scripts;
  if (!scripts || typeof scripts !== 'object' || scripts === null) {
    return;
  }

  let changed = false;
  if (typeof (scripts as Record<string, unknown>)['docs:check'] !== 'string') {
    (scripts as Record<string, unknown>)['docs:check'] = 'agent-docs check';
    changed = true;
  }
  if (typeof (scripts as Record<string, unknown>)['docs:generate'] !== 'string') {
    (scripts as Record<string, unknown>)['docs:generate'] = 'agent-docs generate --format both';
    changed = true;
  }
  if (typeof (scripts as Record<string, unknown>)['docs:report'] !== 'string') {
    (scripts as Record<string, unknown>)['docs:report'] = 'agent-docs report --all';
    changed = true;
  }

  if (changed) {
    await writeText(packageJsonPath, `${JSON.stringify(packageConfig, null, 2)}\n`);
    console.log('Added docs scripts to package.json:');
    console.log('  - docs:check');
    console.log('  - docs:generate');
    console.log('  - docs:report');
  }
}

function buildJsonPlanTemplate(date: string): string {
  return `{
  "id": "PLAN-000",
  "kind": "OTHER",
  "title": "Initial Project Plan",
  "status": "draft",
  "scope": "platform",
  "owner": "You",
  "date": "${date}",
  "tags": ["bootstrap"],
  "sections": [
    {
      "title": "Context",
      "body": "This file is a starting point. Replace with your real plan."
    }
  ]
}`;
}

function buildToonPlanTemplate(date: string): string {
  return `${encode(
    {
      id: 'PLAN-000',
      kind: 'OTHER',
      title: 'Initial Project Plan',
      status: 'draft',
      scope: 'platform',
      owner: 'You',
      date,
      tags: ['bootstrap'],
      sections: [
        {
          title: 'Context',
          body: 'This file is a starting point. Replace with your real plan.',
        },
      ],
    },
  )}\n`;
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
