#!/usr/bin/env node
/**
 * specgraph CLI entry point.
 *
 * Registers all commands (verify, explain, find, waivers, subject, check,
 * generate, init, report, doctor, install-gates, contracts) and delegates
 * to the appropriate command handler.
 *
 * Run `specgraph --help` for the full command list.
 */
import { Command } from 'commander';
import path from 'node:path';
import { runCheck } from './commands/check.js';
import { runGenerate } from './commands/generate.js';
import { runInit } from './commands/init.js';
import { runDoctor } from './commands/doctor.js';
import { runInstallGates } from './commands/hooks.js';
import { runContractCheck, runContractGenerate } from './commands/contracts.js';
import { runReport } from './commands/report.js';
import { registerV2Commands } from './commands/verify.js';

const program = new Command();

program
  .name('specgraph')
  .description('Structured planning artifacts, traceability, and AI-agent-safe documentation workflows')
  .version('0.5.1');

program
  .command('init')
  .description('Initialize .specgraph config, templates, and hooks')
  .argument('[root]', 'Project root', process.cwd())
  .action((root: string) => {
    runInit(path.resolve(root))
      .then(() => {
        console.log(`Initialized specgraph in ${path.resolve(root)}`);
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
  .description('Generate markdown outputs from source artifacts')
  .argument('[root]', 'Project root', process.cwd())
  .option('--strict', 'Fail on warnings before generation')
  .action(async (root: string, options: { strict?: boolean }) => {
    const result = await runGenerate({ root, strict: Boolean(options.strict), format: 'markdown' });
    if (result.exitCode !== 0) {
      process.exit(1);
    }
  });

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
  .description('Install git hooks for pre-commit and pre-push checks')
  .argument('[root]', 'Project root', process.cwd())
  .option('--force', 'Overwrite existing hooks')
  .option('--core-path', 'Configure git to use .specgraph/hooks')
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

// ── Traceability & verification commands (promoted to top level) ──
registerV2Commands(program);

program.parseAsync(process.argv);
