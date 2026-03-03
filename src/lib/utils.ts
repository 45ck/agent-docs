import path from 'node:path';
import fs from 'node:fs/promises';

export function normalizeRelPath(filePath: string): string {
  return filePath
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '')
    .replace(/-+/g, '-');
}

export function formatNow(): string {
  return new Date().toISOString();
}

export async function ensureDirectory(target: string): Promise<void> {
  await fs.mkdir(target, { recursive: true });
}

export async function readTextIfExists(target: string): Promise<string | null> {
  try {
    return await fs.readFile(target, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function writeText(target: string, content: string): Promise<void> {
  await ensureDirectory(path.dirname(target));
  await fs.writeFile(target, content, 'utf8');
}

export async function copyDirectory(source: string, destination: string): Promise<void> {
  const stack = [source];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    const relative = path.relative(source, current);
    const target = path.join(destination, relative);
    const stats = await fs.stat(current).catch(() => null);
    if (!stats) continue;

    if (stats.isDirectory()) {
      await ensureDirectory(target);
      const children = await fs.readdir(current, { withFileTypes: true });
      for (const child of children) {
        stack.push(path.join(current, child.name));
      }
      continue;
    }

    if (stats.isFile()) {
      await ensureDirectory(path.dirname(target));
      await fs.copyFile(current, target);
    }
  }
}
