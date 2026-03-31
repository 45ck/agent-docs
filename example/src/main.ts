#!/usr/bin/env node
/** @spec TASK-005 */
import { program } from './cli.js';

program.parseAsync(process.argv);
