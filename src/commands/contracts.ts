import path from 'node:path';
import { loadConfig } from '../config.js';
import { runShellCommand } from '../lib/command-runner.js';
import type { ContractPlanOptions, ContractResult } from '../types.js';

export async function runContractCheck(options: ContractPlanOptions): Promise<ContractResult> {
  return runContractCommand({
    mode: 'check',
    root: options.root,
    configMode: 'check',
    strict: options.strict,
  });
}

export async function runContractGenerate(options: ContractPlanOptions): Promise<ContractResult> {
  return runContractCommand({
    mode: 'generate',
    root: options.root,
    configMode: 'generate',
    strict: options.strict,
  });
}

async function runContractCommand(params: {
  mode: 'check' | 'generate';
  root: string;
  configMode: 'check' | 'generate';
  strict: boolean;
}): Promise<ContractResult> {
  const root = path.resolve(params.root);
  const config = await loadConfig(root);

  if (!config.contracts?.enabled) {
    return { exitCode: 0, ran: false, command: null };
  }

  const commandConfig =
    params.configMode === 'check'
      ? config.contracts.check
      : config.contracts.generate;

  if (!commandConfig || !commandConfig.command) {
    if (params.strict) {
      console.error(`No contract ${params.mode} command configured in .agent-docs/config.json`);
      return { exitCode: 1, ran: false, command: null };
    }
    return { exitCode: 0, ran: false, command: null };
  }

  console.log(`[agent-docs] contracts ${params.mode} via: ${commandConfig.command}`);
  const result = runShellCommand({
    root,
    command: commandConfig.command,
    workingDirectory: commandConfig.workingDirectory,
    failMessage: `[agent-docs] contracts ${params.mode} command failed`,
  });

  if (result.exitCode !== 0 && params.strict) {
    return { ...result, ran: true, command: commandConfig.command };
  }

  if (result.exitCode !== 0) {
    console.warn(`[agent-docs] contracts ${params.mode} command failed with exit code ${result.exitCode}`);
  }

  return { ...result, ran: true, command: commandConfig.command };
}
