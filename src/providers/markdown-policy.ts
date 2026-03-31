/**
 * MarkdownPolicyProvider — enforces the markdown policy setting.
 *
 * In 'deny' or 'warn' mode: emits E0 claims for each .md file found
 * outside allowed generated paths (e.g. docs/ is allowed, generated/ is allowed).
 * In 'allow' mode: no-op.
 */
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Provider, ScanContext, ScanResult, Claim, Evidence } from '../types.js';
import { EvidenceStrength, makeSubjectId } from '../types.js';
import { loadConfig } from '../config.js';
import { createHash } from 'node:crypto';

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage',
  '.specgraph', '.agent-docs', '.beads', '__pycache__',
  'vendor', 'target', '.claude', '.husky', '.vscode',
]);

export class MarkdownPolicyProvider implements Provider {
  readonly name = 'markdown-policy';
  readonly description = 'Enforces markdown policy — flags raw .md files outside allowed paths';

  supports(): string[] {
    return ['file'];
  }

  strengthFor(): EvidenceStrength {
    return EvidenceStrength.E0;
  }

  async scan(ctx: ScanContext): Promise<ScanResult> {
    let config;
    try {
      config = await loadConfig(ctx.root);
    } catch {
      return { subjects: [], claims: [], evidence: [] };
    }

    if (config.markdownPolicy.mode === 'allow') {
      return { subjects: [], claims: [], evidence: [] };
    }

    const allowedPaths = config.markdownPolicy.allowInGeneratedPaths ?? ['generated', 'docs/generated'];
    // docs/ is always allowed (it's the spec source directory)
    const alwaysAllowed = new Set(['docs', 'docs/generated', ...allowedPaths].map(p => normalize(p)));

    const mdFiles = collectMarkdownFiles(ctx.root);
    const claims: Claim[] = [];
    const evidence: Evidence[] = [];
    const now = new Date().toISOString();

    for (const relPath of mdFiles) {
      if (isAllowed(relPath, alwaysAllowed)) continue;

      const dst = makeSubjectId('file', 'generic', relPath);
      const id = createHash('sha256')
        .update(`markdown-policy:${relPath}`)
        .digest('hex')
        .slice(0, 32);

      claims.push({
        id,
        src: 'markdown-policy',
        relation: 'REFERENCES',
        dst: dst as string,
        provider: 'markdown-policy',
        strength: EvidenceStrength.E0,
        provenance: { file: relPath, detail: `Unstructured .md file outside allowed paths` },
        timestamp: now,
      });

      evidence.push({
        id: `${id}:violation`,
        claimId: id,
        kind: 'markdown_policy_violation',
        detail: `${relPath} is a raw markdown file (mode=${config.markdownPolicy.mode}). Consider moving to docs/ or converting to structured spec format.`,
        capturedAt: now,
      });
    }

    return { subjects: [], claims, evidence };
  }
}

function normalize(p: string): string {
  return p.replace(/^\.\//, '').replace(/\\/g, '/').replace(/\/$/, '');
}

function isAllowed(relPath: string, alwaysAllowed: Set<string>): boolean {
  const normalized = normalize(relPath);
  for (const allowed of alwaysAllowed) {
    if (normalized === allowed || normalized.startsWith(`${allowed}/`)) return true;
  }
  return false;
}

function collectMarkdownFiles(root: string): string[] {
  const files: string[] = [];
  walk(root, root, files);
  return files;
}

function walk(dir: string, root: string, out: string[]): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    const stat = statSync(full, { throwIfNoEntry: false });
    if (!stat) continue;

    if (stat.isDirectory()) {
      walk(full, root, out);
    } else if (stat.isFile() && entry.endsWith('.md')) {
      out.push(path.relative(root, full).replace(/\\/g, '/'));
    }
  }
}
