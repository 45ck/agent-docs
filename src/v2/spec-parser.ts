/**
 * SpecGraph v2 — Spec file parser.
 *
 * Reads spec files (markdown with YAML frontmatter) from /specs/ directory
 * and produces Spec objects.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { Spec, SpecState, SpecKind, RequiredEvidence, SpecSubjects, WaiverDef } from './types.js';
import { parseEvidenceStrength } from './types.js';

const VALID_STATES: Set<string> = new Set(['draft', 'proposed', 'in_progress', 'accepted', 'done', 'deprecated']);

/**
 * Parse YAML frontmatter from a markdown file.
 * Simple parser — handles the subset needed for spec files.
 */
export function parseFrontmatter(content: string): { data: Record<string, unknown>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { data: {}, body: content };
  }

  const yamlStr = match[1];
  const body = match[2];
  const data: Record<string, unknown> = {};

  let currentKey = '';
  let currentIndent = -1;
  let listItems: string[] = [];
  let nestedObj: Record<string, unknown> = {};
  let inNested = false;
  let inList = false;

  const flushList = () => {
    if (inList && currentKey) {
      data[currentKey] = [...listItems];
      listItems = [];
      inList = false;
    }
  };

  const flushNested = () => {
    if (inNested && currentKey) {
      // Check if nested values are lists
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(nestedObj)) {
        result[k] = v;
      }
      data[currentKey] = result;
      nestedObj = {};
      inNested = false;
    }
  };

  for (const line of yamlStr.split('\n')) {
    const trimmed = line.trimEnd();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Top-level key: value
    const kvMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
    if (kvMatch && !trimmed.startsWith(' ') && !trimmed.startsWith('\t')) {
      flushList();
      flushNested();

      currentKey = kvMatch[1];
      const val = kvMatch[2].trim();

      if (val === '' || val === '[]') {
        // Could be a list or nested object — wait for next lines
        currentIndent = -1;
      } else {
        data[currentKey] = parseYamlValue(val);
        currentKey = '';
      }
      continue;
    }

    // List item: "  - value"
    const listMatch = trimmed.match(/^\s+-\s+(.+)$/);
    if (listMatch && currentKey) {
      if (!inList) {
        inList = true;
        listItems = [];
      }
      listItems.push(listMatch[1].trim());
      continue;
    }

    // Nested key:value "  key: value"
    const nestedMatch = trimmed.match(/^\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.+)$/);
    if (nestedMatch && currentKey) {
      flushList();
      if (!inNested) {
        inNested = true;
        nestedObj = {};
      }
      nestedObj[nestedMatch[1]] = parseYamlValue(nestedMatch[2].trim());
      continue;
    }

    // Nested list "    - value" under a nested key
    const nestedListMatch = trimmed.match(/^\s{4,}-\s+(.+)$/);
    if (nestedListMatch && inNested) {
      // Find the last nested key and make it a list
      const keys = Object.keys(nestedObj);
      const lastKey = keys[keys.length - 1];
      if (lastKey) {
        const existing = nestedObj[lastKey];
        if (Array.isArray(existing)) {
          existing.push(nestedListMatch[1].trim());
        } else {
          nestedObj[lastKey] = [nestedListMatch[1].trim()];
        }
      }
      continue;
    }
  }

  flushList();
  flushNested();

  return { data, body };
}

function parseYamlValue(val: string): string | number | boolean {
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (val === 'null' || val === '~') return '';
  if (/^-?\d+$/.test(val)) return parseInt(val, 10);
  if (/^-?\d+\.\d+$/.test(val)) return parseFloat(val);
  // Strip quotes
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    return val.slice(1, -1);
  }
  return val;
}

/**
 * Parse a single spec file.
 */
export function parseSpecFile(filePath: string, root: string): Spec | null {
  const content = readFileSync(filePath, 'utf8');
  const { data } = parseFrontmatter(content);

  const id = data.id as string | undefined;
  if (!id) return null;

  const state = (data.state as string) ?? 'draft';
  if (!VALID_STATES.has(state)) {
    throw new Error(`Invalid spec state "${state}" in ${filePath}. Valid: ${[...VALID_STATES].join(', ')}`);
  }

  const reqEvidence = data.required_evidence as Record<string, string> | undefined;
  let requiredEvidence: RequiredEvidence | undefined;
  if (reqEvidence) {
    requiredEvidence = {};
    for (const [key, val] of Object.entries(reqEvidence)) {
      if (['implementation', 'verification', 'models', 'apis'].includes(key)) {
        (requiredEvidence as Record<string, unknown>)[key] = parseEvidenceStrength(String(val));
      }
    }
  }

  const subjectsRaw = data.subjects as Record<string, unknown> | undefined;
  let subjects: SpecSubjects | undefined;
  if (subjectsRaw) {
    subjects = {};
    if (Array.isArray(subjectsRaw.models)) subjects.models = subjectsRaw.models as string[];
    if (Array.isArray(subjectsRaw.apis)) subjects.apis = subjectsRaw.apis as string[];
    if (Array.isArray(subjectsRaw.tests)) subjects.tests = subjectsRaw.tests as string[];
  }

  const waiversRaw = data.waivers;
  let waivers: WaiverDef[] | undefined;
  if (Array.isArray(waiversRaw)) {
    waivers = (waiversRaw as unknown[]).filter((w): w is WaiverDef => {
      return typeof w === 'object' && w !== null &&
        'kind' in w && 'target' in w && 'owner' in w && 'reason' in w && 'expires' in w;
    });
  }

  const dependsOnRaw = data.depends_on ?? data.dependsOn;
  const dependsOn = Array.isArray(dependsOnRaw) ? dependsOnRaw as string[] : undefined;

  const tagsRaw = data.tags;
  const tags = Array.isArray(tagsRaw) ? tagsRaw as string[] : undefined;

  const sourceHash = createHash('sha256').update(content).digest('hex').slice(0, 16);
  const sourcePath = path.relative(root, filePath).replace(/\\/g, '/');

  return {
    id: String(id),
    title: String(data.title ?? ''),
    state: state as SpecState,
    kind: String(data.kind ?? 'functional') as SpecKind,
    owner: data.owner ? String(data.owner) : undefined,
    priority: data.priority ? String(data.priority) : undefined,
    description: data.description ? String(data.description) : undefined,
    requiredEvidence,
    subjects,
    dependsOn,
    tags,
    waivers,
    sourcePath,
    sourceHash,
  };
}

/**
 * Discover and parse all spec files under the specs directory.
 */
export function loadSpecs(root: string): Spec[] {
  const specsDir = path.join(root, 'specs');
  const specs: Spec[] = [];

  try {
    collectSpecFiles(specsDir, root, specs);
  } catch {
    // specs/ directory may not exist yet — that's fine
  }

  return specs;
}

function collectSpecFiles(dir: string, root: string, out: Spec[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stat = statSync(full, { throwIfNoEntry: false });
    if (!stat) continue;

    if (stat.isDirectory()) {
      collectSpecFiles(full, root, out);
    } else if (entry.endsWith('.md') || entry.endsWith('.yaml') || entry.endsWith('.yml')) {
      try {
        const spec = parseSpecFile(full, root);
        if (spec) out.push(spec);
      } catch (err) {
        console.error(`Warning: failed to parse spec ${full}: ${(err as Error).message}`);
      }
    }
  }
}
