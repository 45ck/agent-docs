#!/usr/bin/env node
import { Command } from 'commander';
import path from 'node:path';
import { runCheck } from './commands/check.js';
import { runGenerate } from './commands/generate.js';
import { runInit } from './commands/init.js';
import { runDoctor } from './commands/doctor.js';
import { runInstallGates } from './commands/hooks.js';
import { runContractCheck, runContractGenerate } from './commands/contracts.js';
import { runReport } from './commands/report.js';
import { registerV2Commands } from './v2/commands.js';

const program = new Command();

program
  .name('agent-docs')
  .description('Structured planning artifacts and AI-agent-safe documentation workflows')
  .version('0.4.0');

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

const contractsCommand = program
  .command('contracts')
  .description('Run configured contract checks/generators for multi-language boundaries');

contractsCommand
  .command('check')
  .description('Run contract check command configured in agent-docs config')
  .argument('[root]', 'Project root', process.cwd())
  .option('--strict', 'Fail when no command configured or command exits non-zero')
  .action(async (root: string, options: { strict?: boolean }) => {
    const result = await runContractCheck({ root, strict: Boolean(options.strict) });
    if (result.exitCode !== 0) {
      process.exit(1);
    }
  });

contractsCommand
  .command('generate')
  .description('Run contract generation command configured in agent-docs config')
  .argument('[root]', 'Project root', process.cwd())
  .option('--strict', 'Fail when command exits non-zero')
  .action(async (root: string, options: { strict?: boolean }) => {
    const result = await runContractGenerate({ root, strict: Boolean(options.strict) });
    if (result.exitCode !== 0) {
      process.exit(1);
    }
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
  .command('report')
  .description('Generate analytical matrix reports from artifact graph')
  .argument('[root]', 'Project root', process.cwd())
  .option('--type <type>', 'Report type: traceability, defect, coverage, impact')
  .option('--all', 'Generate all report types')
  .option('--output <dir>', 'Output directory (default: generated/reports)')
  .action(async (root: string, options: { type?: string; all?: boolean; output?: string }) => {
    const validTypes = ['traceability', 'defect', 'coverage', 'impact'];
    if (options.type && !validTypes.includes(options.type)) {
      console.error(`Invalid report type "${options.type}". Valid types: ${validTypes.join(', ')}`);
      process.exit(1);
    }
    const result = await runReport({
      root,
      type: options.type as 'traceability' | 'defect' | 'coverage' | 'impact' | undefined,
      all: options.all,
      output: options.output,
    });
    if (result.exitCode !== 0) {
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

// ── SpecGraph v2 commands ─────────────────────────────────────
const specgraphCommand = program
  .command('specgraph')
  .description('SpecGraph v2: policy-driven traceability and enforcement');

registerV2Commands(specgraphCommand);

program.parseAsync(process.argv);

function sanitizeFormat(format?: string): 'markdown' | 'toon' | 'both' {
  const normalized = String(format ?? 'markdown').toLowerCase();
  if (normalized === 'toon' || normalized === 'both' || normalized === 'markdown') {
    return normalized;
  }
  return 'markdown';
}
