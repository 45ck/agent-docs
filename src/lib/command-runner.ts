import path from 'node:path';
import { execSync } from 'node:child_process';

export interface CommandResult {
  exitCode: number;
}

export interface CommandRunContext {
  root: string;
  command: string;
  workingDirectory?: string;
  failMessage: string;
}

export function runShellCommand(context: CommandRunContext): CommandResult {
  const cwd = path.resolve(context.root, context.workingDirectory || '.');

  try {
    execSync(context.command, { cwd, stdio: 'inherit', encoding: 'utf8' });
    return { exitCode: 0 };
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'status' in error) {
      const status = (error as { status?: number }).status;
      return { exitCode: typeof status === 'number' ? status : 1 };
    }

    console.error(context.failMessage);
    return { exitCode: 1 };
  }
}
