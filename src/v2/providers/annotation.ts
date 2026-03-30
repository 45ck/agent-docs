/**
 * Annotation Provider — reads @spec/@implements tags from source file comments.
 *
 * This is the universal baseline provider. It works across all languages
 * that support comments. Evidence is E0 (declarative only).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import type { Provider, ScanContext, ScanResult, Claim, Subject, Evidence, Relation } from '../types.js';
import { EvidenceStrength, makeSubjectId } from '../types.js';
import { claimId, uuid } from '../id.js';

/** Supported annotation tags. */
interface ParsedAnnotation {
  spec?: string;
  implements?: string[];
  model?: string[];
  test?: string[];
  api?: string[];
  dependsOn?: string[];
  decision?: string;
  bead?: string;
  todo?: string;
  expires?: string;
}

/** Source file extensions to scan for annotations. */
const SCANNABLE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.kt', '.cs',
  '.rb', '.php', '.sh', '.bash', '.zsh',
  '.c', '.cpp', '.h', '.hpp',
  '.swift', '.scala', '.clj',
]);

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage',
  '.specgraph', '.agent-docs', '.beads', '__pycache__',
  'vendor', 'target',
]);

/**
 * Parse @spec and related annotation tags from a comment block.
 */
export function parseAnnotations(text: string): ParsedAnnotation[] {
  const results: ParsedAnnotation[] = [];
  // Match comment blocks: /** ... */, /* ... */, // lines, # lines, """ ... """, ''' ... '''
  const commentBlocks = extractCommentBlocks(text);

  for (const block of commentBlocks) {
    const annotation = parseAnnotationBlock(block.text);
    if (annotation.spec) {
      results.push({ ...annotation, });
    }
  }

  return results;
}

interface CommentBlock {
  text: string;
  line: number;
}

function extractCommentBlocks(source: string): CommentBlock[] {
  const blocks: CommentBlock[] = [];
  const lines = source.split('\n');

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Multi-line: /** ... */ or /* ... */
    if (trimmed.startsWith('/**') || trimmed.startsWith('/*')) {
      const startLine = i + 1;
      let blockText = trimmed;
      while (i < lines.length && !lines[i].includes('*/')) {
        i++;
        if (i < lines.length) blockText += '\n' + lines[i];
      }
      if (blockText.includes('@spec')) {
        blocks.push({ text: blockText, line: startLine });
      }
      i++;
      continue;
    }

    // Single-line comment runs: // or #
    if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
      const startLine = i + 1;
      let blockText = trimmed;
      i++;
      while (i < lines.length) {
        const nextTrimmed = lines[i].trim();
        if (nextTrimmed.startsWith('//') || nextTrimmed.startsWith('#')) {
          blockText += '\n' + nextTrimmed;
          i++;
        } else {
          break;
        }
      }
      if (blockText.includes('@spec')) {
        blocks.push({ text: blockText, line: startLine });
      }
      continue;
    }

    // Python docstrings: """ ... """ or ''' ... '''
    if (trimmed.startsWith('"""') || trimmed.startsWith("'''")) {
      const delim = trimmed.slice(0, 3);
      const startLine = i + 1;
      let blockText = trimmed;
      if (!trimmed.slice(3).includes(delim)) {
        i++;
        while (i < lines.length && !lines[i].includes(delim)) {
          blockText += '\n' + lines[i];
          i++;
        }
        if (i < lines.length) blockText += '\n' + lines[i];
      }
      if (blockText.includes('@spec')) {
        blocks.push({ text: blockText, line: startLine });
      }
      i++;
      continue;
    }

    i++;
  }

  return blocks;
}

function parseAnnotationBlock(text: string): ParsedAnnotation {
  const annotation: ParsedAnnotation = {};

  const specMatch = text.match(/@spec\s+(\S+)/);
  if (specMatch) annotation.spec = specMatch[1];

  const implementsMatches = [...text.matchAll(/@implements\s+(\S+)/g)];
  if (implementsMatches.length > 0) {
    annotation.implements = implementsMatches.map(m => m[1]);
  }

  const modelMatches = [...text.matchAll(/@model\s+(\S+)/g)];
  if (modelMatches.length > 0) {
    annotation.model = modelMatches.map(m => m[1]);
  }

  const testMatches = [...text.matchAll(/@test\s+(\S+)/g)];
  if (testMatches.length > 0) {
    annotation.test = testMatches.map(m => m[1]);
  }

  const apiMatches = [...text.matchAll(/@api\s+(\S+)/g)];
  if (apiMatches.length > 0) {
    annotation.api = apiMatches.map(m => m[1]);
  }

  const dependsOnMatches = [...text.matchAll(/@dependsOn\s+(\S+)/g)];
  if (dependsOnMatches.length > 0) {
    annotation.dependsOn = dependsOnMatches.map(m => m[1]);
  }

  const decisionMatch = text.match(/@decision\s+(\S+)/);
  if (decisionMatch) annotation.decision = decisionMatch[1];

  const beadMatch = text.match(/@bead\s+(\S+)/);
  if (beadMatch) annotation.bead = beadMatch[1];

  const todoMatch = text.match(/@todo\s+(.+)/);
  if (todoMatch) annotation.todo = todoMatch[1].trim();

  const expiresMatch = text.match(/@expires\s+(\S+)/);
  if (expiresMatch) annotation.expires = expiresMatch[1];

  return annotation;
}

// ─── Provider Implementation ────────────────────────────────────

export class AnnotationProvider implements Provider {
  readonly name = 'annotation';
  readonly description = 'Reads @spec/@implements tags from source file comments';

  supports(): string[] {
    return ['symbol', 'file', 'model', 'test', 'route'];
  }

  strengthFor(): EvidenceStrength {
    return EvidenceStrength.E0;
  }

  async scan(ctx: ScanContext): Promise<ScanResult> {
    const subjects: Subject[] = [];
    const claims: Claim[] = [];
    const evidence: Evidence[] = [];
    const now = new Date().toISOString();

    const files = ctx.changedFiles ?? collectSourceFiles(ctx.root);

    for (const relPath of files) {
      const absPath = path.isAbsolute(relPath) ? relPath : path.join(ctx.root, relPath);
      const ext = path.extname(relPath).toLowerCase();
      if (!SCANNABLE_EXTENSIONS.has(ext)) continue;

      let content: string;
      try {
        content = readFileSync(absPath, 'utf8');
      } catch {
        continue;
      }

      const annotations = parseAnnotations(content);
      const normalizedPath = relPath.replace(/\\/g, '/');

      for (const ann of annotations) {
        if (!ann.spec) continue;

        // @implements -> IMPLEMENTS claims
        if (ann.implements) {
          for (const impl of ann.implements) {
            const subjectId = makeSubjectId('symbol', 'annotation', impl);
            subjects.push({
              id: subjectId,
              kind: 'symbol',
              provider: 'annotation',
              identity: impl,
              file: normalizedPath,
            });

            const cid = claimId(ann.spec, 'IMPLEMENTS', subjectId as string, 'annotation');
            claims.push({
              id: cid,
              src: ann.spec,
              relation: 'IMPLEMENTS',
              dst: subjectId as string,
              provider: 'annotation',
              strength: EvidenceStrength.E0,
              provenance: { file: normalizedPath, detail: `@implements ${impl}` },
              timestamp: now,
            });

            evidence.push({
              id: uuid(),
              claimId: cid,
              kind: 'annotation_tag',
              detail: `@spec ${ann.spec} @implements ${impl} in ${normalizedPath}`,
              capturedAt: now,
            });
          }
        }

        // @model -> USES_MODEL claims
        if (ann.model) {
          for (const modelId of ann.model) {
            const subjectId = makeSubjectId('model', 'annotation', modelId);
            subjects.push({
              id: subjectId,
              kind: 'model',
              provider: 'annotation',
              identity: modelId,
            });

            const cid = claimId(ann.spec, 'USES_MODEL', subjectId as string, 'annotation');
            claims.push({
              id: cid,
              src: ann.spec,
              relation: 'USES_MODEL',
              dst: subjectId as string,
              provider: 'annotation',
              strength: EvidenceStrength.E0,
              provenance: { file: normalizedPath, detail: `@model ${modelId}` },
              timestamp: now,
            });
          }
        }

        // @test -> VERIFIED_BY claims
        if (ann.test) {
          for (const testId of ann.test) {
            const subjectId = makeSubjectId('test', 'annotation', testId);
            subjects.push({
              id: subjectId,
              kind: 'test',
              provider: 'annotation',
              identity: testId,
            });

            const cid = claimId(ann.spec, 'VERIFIED_BY', subjectId as string, 'annotation');
            claims.push({
              id: cid,
              src: ann.spec,
              relation: 'VERIFIED_BY',
              dst: subjectId as string,
              provider: 'annotation',
              strength: EvidenceStrength.E0,
              provenance: { file: normalizedPath, detail: `@test ${testId}` },
              timestamp: now,
            });
          }
        }

        // @api -> EXPOSES_API claims
        if (ann.api) {
          for (const apiId of ann.api) {
            const subjectId = makeSubjectId('route', 'annotation', apiId);
            subjects.push({
              id: subjectId,
              kind: 'route',
              provider: 'annotation',
              identity: apiId,
            });

            const cid = claimId(ann.spec, 'EXPOSES_API', subjectId as string, 'annotation');
            claims.push({
              id: cid,
              src: ann.spec,
              relation: 'EXPOSES_API',
              dst: subjectId as string,
              provider: 'annotation',
              strength: EvidenceStrength.E0,
              provenance: { file: normalizedPath, detail: `@api ${apiId}` },
              timestamp: now,
            });
          }
        }

        // @dependsOn -> DEPENDS_ON claims
        if (ann.dependsOn) {
          for (const depId of ann.dependsOn) {
            const cid = claimId(ann.spec, 'DEPENDS_ON', depId, 'annotation');
            claims.push({
              id: cid,
              src: ann.spec,
              relation: 'DEPENDS_ON',
              dst: depId,
              provider: 'annotation',
              strength: EvidenceStrength.E0,
              provenance: { file: normalizedPath, detail: `@dependsOn ${depId}` },
              timestamp: now,
            });
          }
        }
      }
    }

    return { subjects, claims, evidence };
  }
}

function collectSourceFiles(root: string): string[] {
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
    } else if (stat.isFile()) {
      out.push(path.relative(root, full).replace(/\\/g, '/'));
    }
  }
}
