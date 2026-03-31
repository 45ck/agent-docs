/**
 * Commander.js CLI for Tasko todo-list app.
 * @spec TASK-005
 * @implements TASK-005
 */
import { Command } from 'commander';
import chalk from 'chalk';
import { TodoStore } from './store.js';
import type { Priority, FilterOptions } from './types.js';

function priorityColor(priority: Priority): (text: string) => string {
  switch (priority) {
    case 'high': return chalk.red;
    case 'medium': return chalk.yellow;
    case 'low': return chalk.green;
  }
}

function formatDue(dueDate?: string): string {
  if (!dueDate) return '';
  const now = new Date();
  const due = new Date(dueDate);
  const diffMs = due.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return chalk.red(`${Math.abs(diffDays)}d overdue`);
  if (diffDays === 0) return chalk.red('today');
  return `${diffDays}d left`;
}

function padEnd(str: string, len: number): string {
  if (str.length >= len) return str.slice(0, len);
  return str + ' '.repeat(len - str.length);
}

export const program = new Command();

program
  .name('tasko')
  .description('A simple CLI todo-list app')
  .version('1.0.0');

program
  .command('add')
  .description('Add a new todo')
  .argument('<title>', 'Todo title')
  .option('-d, --desc <text>', 'Description')
  .option('-p, --priority <priority>', 'Priority: low, medium, high', 'medium')
  .option('-l, --label <label>', 'Add a label')
  .option('--due <date>', 'Due date (YYYY-MM-DD)')
  .action((title: string, opts: { desc?: string; priority?: string; label?: string; due?: string }) => {
    const store = new TodoStore();
    try {
      const todo = store.create({
        title,
        description: opts.desc,
        priority: (opts.priority as Priority) ?? 'medium',
        labels: opts.label ? [opts.label] : [],
        dueDate: opts.due,
      });
      console.log(chalk.green(`Created todo #${todo.id}: ${todo.title}`));
    } finally {
      store.close();
    }
  });

program
  .command('list')
  .description('List todos')
  .option('-l, --label <label>', 'Filter by label')
  .option('-p, --priority <priority>', 'Filter by priority')
  .option('--done', 'Show only completed')
  .option('-s, --search <text>', 'Search in title/description')
  .action((opts: { label?: string; priority?: string; done?: boolean; search?: string }) => {
    const store = new TodoStore();
    try {
      const filter: FilterOptions = {};
      if (opts.label) filter.label = opts.label;
      if (opts.priority) filter.priority = opts.priority as Priority;
      if (opts.done) filter.completed = true;
      if (opts.search) filter.search = opts.search;

      const todos = store.getAll(filter);
      if (todos.length === 0) {
        console.log(chalk.gray('No todos found.'));
        return;
      }

      console.log(
        chalk.bold(
          padEnd('ID', 6) + padEnd('Status', 8) + padEnd('Priority', 10) +
          padEnd('Title', 30) + padEnd('Labels', 20) + 'Due'
        )
      );
      console.log('-'.repeat(80));

      for (const todo of todos) {
        const status = todo.completed ? chalk.green('done') : chalk.yellow('open');
        const pColor = priorityColor(todo.priority);
        const labelsStr = todo.labels.length > 0 ? todo.labels.join(', ') : '';
        const dueStr = formatDue(todo.dueDate);

        if (todo.completed) {
          console.log(chalk.strikethrough.gray(
            padEnd(String(todo.id), 6) + padEnd('done', 8) + padEnd(todo.priority, 10) +
            padEnd(todo.title, 30) + padEnd(labelsStr, 20) + dueStr
          ));
        } else {
          console.log(
            padEnd(String(todo.id), 6) + padEnd(status, 8) + pColor(padEnd(todo.priority, 10)) +
            padEnd(todo.title, 30) + padEnd(labelsStr, 20) + dueStr
          );
        }
      }
    } finally {
      store.close();
    }
  });

program
  .command('done')
  .description('Toggle todo completion')
  .argument('<id>', 'Todo ID')
  .action((idStr: string) => {
    const store = new TodoStore();
    try {
      const id = parseInt(idStr, 10);
      const before = store.getById(id);
      if (!before) {
        console.log(chalk.red(`Todo #${id} not found.`));
        return;
      }
      store.complete(id);
      const after = store.getById(id)!;
      if (after.completed) {
        console.log(chalk.green(`\u2713 Completed: ${after.title}`));
      } else {
        console.log(chalk.yellow(`\u25CB Reopened: ${after.title}`));
      }
    } finally {
      store.close();
    }
  });

program
  .command('label')
  .description('Add a label to a todo')
  .argument('<id>', 'Todo ID')
  .argument('<label>', 'Label to add')
  .action((idStr: string, label: string) => {
    const store = new TodoStore();
    try {
      const id = parseInt(idStr, 10);
      if (store.addLabel(id, label)) {
        console.log(chalk.green(`Added label "${label}" to todo #${id}.`));
      } else {
        console.log(chalk.red(`Todo #${id} not found.`));
      }
    } finally {
      store.close();
    }
  });

program
  .command('delete')
  .description('Delete a todo')
  .argument('<id>', 'Todo ID')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (idStr: string, opts: { yes?: boolean }) => {
    const store = new TodoStore();
    try {
      const id = parseInt(idStr, 10);
      const todo = store.getById(id);
      if (!todo) {
        console.log(chalk.red(`Todo #${id} not found.`));
        return;
      }

      if (!opts.yes) {
        const readline = await import('node:readline');
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        const answer = await new Promise<string>(resolve => {
          rl.question(`Delete "${todo.title}"? (y/N) `, resolve);
        });
        rl.close();
        if (answer.toLowerCase() !== 'y') {
          console.log('Cancelled.');
          return;
        }
      }

      store.delete(id);
      console.log(chalk.green(`Deleted todo #${id}.`));
    } finally {
      store.close();
    }
  });

program
  .command('show')
  .description('Show details of a todo')
  .argument('<id>', 'Todo ID')
  .action((idStr: string) => {
    const store = new TodoStore();
    try {
      const id = parseInt(idStr, 10);
      const todo = store.getById(id);
      if (!todo) {
        console.log(chalk.red(`Todo #${id} not found.`));
        return;
      }

      const pColor = priorityColor(todo.priority);
      console.log(chalk.bold(`Todo #${todo.id}`));
      console.log(`  Title:       ${todo.title}`);
      if (todo.description) console.log(`  Description: ${todo.description}`);
      console.log(`  Priority:    ${pColor(todo.priority)}`);
      console.log(`  Status:      ${todo.completed ? chalk.green('completed') : chalk.yellow('open')}`);
      if (todo.labels.length > 0) console.log(`  Labels:      ${todo.labels.join(', ')}`);
      if (todo.dueDate) console.log(`  Due:         ${todo.dueDate} (${formatDue(todo.dueDate)})`);
      console.log(`  Created:     ${todo.createdAt}`);
    } finally {
      store.close();
    }
  });
