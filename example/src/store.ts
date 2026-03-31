/**
 * SQLite persistence layer for Tasko.
 * @spec TASK-004
 * @implements TodoStore
 */

/**
 * Core TodoItem CRUD operations — create, read, update, delete.
 * @spec TASK-001
 * @implements TodoStore
 */

/**
 * Label tagging — attach/remove labels from TodoItems.
 * @spec TASK-002
 * @implements TodoStore.addLabel
 */

/**
 * Priority ranking — low/medium/high priority on each TodoItem.
 * @spec TASK-003
 * @implements Priority
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import type { TodoItem, CreateTodoInput, FilterOptions, Priority } from './types.js';

interface TodoRow {
  id: number;
  title: string;
  description: string | null;
  priority: string;
  labels: string;
  due_date: string | null;
  completed: number;
  created_at: string;
}

function rowToTodo(row: TodoRow): TodoItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    priority: row.priority as Priority,
    labels: JSON.parse(row.labels),
    dueDate: row.due_date ?? undefined,
    completed: row.completed === 1,
    createdAt: row.created_at,
  };
}

export class TodoStore {
  private db: InstanceType<typeof Database>;

  constructor() {
    const dir = path.join(os.homedir(), '.tasko');
    fs.mkdirSync(dir, { recursive: true });
    this.db = new Database(path.join(dir, 'tasko.db'));
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS todos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        priority TEXT NOT NULL DEFAULT 'medium',
        labels TEXT NOT NULL DEFAULT '[]',
        due_date TEXT,
        completed INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
    `);
  }

  create(input: CreateTodoInput): TodoItem {
    const now = new Date().toISOString();
    const stmt = this.db.prepare(`
      INSERT INTO todos (title, description, priority, labels, due_date, completed, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?)
    `);
    const result = stmt.run(
      input.title,
      input.description ?? null,
      input.priority ?? 'medium',
      JSON.stringify(input.labels ?? []),
      input.dueDate ?? null,
      now,
    );
    return this.getById(Number(result.lastInsertRowid))!;
  }

  getAll(filter?: FilterOptions): TodoItem[] {
    const rows = this.db.prepare('SELECT * FROM todos ORDER BY created_at DESC').all() as TodoRow[];
    let items = rows.map(rowToTodo);

    if (filter) {
      if (filter.completed !== undefined) {
        items = items.filter(t => t.completed === filter.completed);
      }
      if (filter.priority) {
        items = items.filter(t => t.priority === filter.priority);
      }
      if (filter.label) {
        const label = filter.label.toLowerCase();
        items = items.filter(t => t.labels.some(l => l.toLowerCase() === label));
      }
      if (filter.search) {
        const term = filter.search.toLowerCase();
        items = items.filter(t =>
          t.title.toLowerCase().includes(term) ||
          (t.description?.toLowerCase().includes(term) ?? false)
        );
      }
    }

    return items;
  }

  getById(id: number): TodoItem | undefined {
    const row = this.db.prepare('SELECT * FROM todos WHERE id = ?').get(id) as TodoRow | undefined;
    return row ? rowToTodo(row) : undefined;
  }

  complete(id: number): boolean {
    const row = this.db.prepare('SELECT completed FROM todos WHERE id = ?').get(id) as { completed: number } | undefined;
    if (!row) return false;
    const newValue = row.completed === 1 ? 0 : 1;
    this.db.prepare('UPDATE todos SET completed = ? WHERE id = ?').run(newValue, id);
    return true;
  }

  addLabel(id: number, label: string): boolean {
    const todo = this.getById(id);
    if (!todo) return false;
    if (!todo.labels.includes(label)) {
      todo.labels.push(label);
      this.db.prepare('UPDATE todos SET labels = ? WHERE id = ?').run(JSON.stringify(todo.labels), id);
    }
    return true;
  }

  delete(id: number): boolean {
    const result = this.db.prepare('DELETE FROM todos WHERE id = ?').run(id);
    return result.changes > 0;
  }

  close(): void {
    this.db.close();
  }
}
