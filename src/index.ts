#!/usr/bin/env node
import { Command } from 'commander';
import path from 'node:path';
import { runCheck } from './commands/check.js';
import { runGenerate } from './commands/generate.js';
import { runInit } from './commands/init.js';
import { runDoctor } from './commands/doctor.js';
import { runInstallGates } from './commands/hooks.js';

const program = new Command();

program
  .name('agent-docs')
  .description('Structured planning artifacts and AI-agent-safe documentation workflows')
  .version('0.3.1');

program
  .command('init')
  .description('Initialize .agent-docs config, templates, and hooks')
  .argument('[root]', 'Project root', process.cwd())
  .action((root: string) => {
    runInit(path.resolve(root))
      .then(() => {
        console.log(`Initialized agent-docs in ${path.resolve(root)}`);
      })
      .catch((error) => {
        console.error('init failed:', error);
        process.exit(1);
      });
  });

program
  .command('check')
  .description('Validate structured docs and markdown policy')
  .argument('[root]', 'Project root', process.cwd())
  .option('--strict', 'Fail on warnings and enforce strict gating behavior')
  .action(async (root: string, options: { strict?: boolean }) => {
    const result = await runCheck({ root, strict: Boolean(options.strict) });
    if (result.exitCode !== 0) {
      process.exit(1);
    }
  });

program
  .command('generate')
  .description('Generate markdown/TOON outputs from source artifacts')
  .argument('[root]', 'Project root', process.cwd())
  .option('--format <format>', 'Output format: markdown, toon, both', 'markdown')
  .option('--strict', 'Fail on warnings before generation')
  .action(
    async (
      root: string,
      options: {
        format?: string;
        strict?: boolean;
      },
    ) => {
      const format = sanitizeFormat(options.format);
      const result = await runGenerate({ root, strict: Boolean(options.strict), format });
      if (result.exitCode !== 0) {
        process.exit(1);
      }
    },
  );

program
  .command('doctor')
  .description('Run environment and config checks')
  .argument('[root]', 'Project root', process.cwd())
  .action(async (root: string) => {
    const status = await runDoctor({ root });
    if (status !== 0) {
      process.exit(1);
    }
  });

program
  .command('install-gates')
  .description('Install agent-docs git hooks for pre-commit and pre-push checks')
  .argument('[root]', 'Project root', process.cwd())
  .option('--force', 'Overwrite existing hooks')
  .option('--core-path', 'Configure git to use .agent-docs/hooks')
  .option('--quality', 'Also run @45ck/noslop checks inside generated hooks when available')
  .action(async (root: string, options: { force?: boolean; corePath?: boolean; quality?: boolean }) => {
    await runInstallGates(
      path.resolve(root),
      Boolean(options.force),
      Boolean(options.corePath),
      Boolean(options.quality),
    );
    console.log('Hook installation complete.');
  });

program.parseAsync(process.argv);

function sanitizeFormat(format?: string): 'markdown' | 'toon' | 'both' {
  const normalized = String(format ?? 'markdown').toLowerCase();
  if (normalized === 'toon' || normalized === 'both' || normalized === 'markdown') {
    return normalized;
  }
  return 'markdown';
}
