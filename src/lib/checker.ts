import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { decode } from '@toon-format/toon';
import type {
  ValidationIssue,
  GateReport,
  AgentDocsConfig,
  ArtifactInput,
  ParsedArtifact,
  ContradictionMatrix,
  GeneratedManifest,
  GeneratedManifestEntry,
  ArtifactStatus,
  CodeTraceabilityReference,
} from '../types.js';

const ALLOWED_STATUSES: Set<ArtifactStatus> = new Set<ArtifactStatus>([
  'draft',
  'proposed',
  'accepted',
  'superseded',
  'rejected',
  'deprecated',
  'deferred',
  'open',
]);

const CONTRADICTION_SEVERITY_ORDER: Record<'low' | 'medium' | 'high' | 'critical', number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export class Collector {
  constructor(private readonly issues: ValidationIssue[] = []) {}

  push(issue: ValidationIssue) {
    this.issues.push(issue);
  }

  toArray(): ValidationIssue[] {
    return this.issues;
  }
}

export async function listFiles(root: string, includeRoots: string[], ignorePaths: string[]): Promise<string[]> {
  const normalizedIgnores = new Set(normalizeIgnoreList(ignorePaths));
  const stack = includeRoots.map((entry) => normalizePath(entry));
  const visited = new Set<string>();
  const files: string[] = [];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const normalized = normalizePath(current);
    if (!normalized) {
      continue;
    }

    if (visited.has(normalized) || shouldIgnore(normalized, normalizedIgnores)) {
      continue;
    }

    const absolute = path.join(root, normalized);
    const stat = await fs.stat(absolute).catch(() => null);
    if (!stat) {
      continue;
    }

    visited.add(normalized);

    if (stat.isDirectory()) {
      const children = await fs.readdir(absolute, { withFileTypes: true });
      for (const child of children) {
        stack.push(normalizePath(path.join(normalized, child.name)));
      }
      continue;
    }

    if (stat.isFile()) {
      files.push(normalized);
    }
  }

  files.sort((a, b) => a.localeCompare(b));
  return files;
}

export async function collectStructuredDocs(root: string, config: AgentDocsConfig): Promise<string[]> {
  return listFiles(root, config.sourceRoots, config.ignorePaths);
}

export async function collectMarkdownFiles(root: string, config: AgentDocsConfig): Promise<string[]> {
  const files = await listFiles(root, ['.'], config.ignorePaths);
  return files.filter((entry) => isMarkdownFile(entry));
}

export async function loadArtifacts(
  root: string,
  config: AgentDocsConfig,
  collector: Collector,
): Promise<ParsedArtifact[]> {
  const candidateFiles = await collectStructuredDocs(root, config);
  const artifacts: ParsedArtifact[] = [];
  const sourceExtension = config.sourceExtension.toLowerCase();
  const candidateExtensions = sourceExtension === '.toon'
    ? new Set(['.toon', '.a-doc'])
    : new Set([sourceExtension]);

  for (const file of candidateFiles) {
    const extension = path.extname(file).toLowerCase();
    if (!candidateExtensions.has(extension)) {
      continue;
    }

    const fullPath = path.join(root, file);
    const source = await fs.readFile(fullPath, 'utf8').catch(() => null);
    if (source === null) {
      continue;
    }

    let parsed: unknown;
    try {
      parsed = extension === '.toon' ? decode(source) : JSON.parse(source);
    } catch (error) {
      const formatLabel = extension === '.toon' ? 'TOON' : 'JSON';
      collector.push({
        code: 'PARSE_FAIL',
        severity: 'error',
        message: `Invalid ${formatLabel} in ${file}: ${(error as Error).message}`,
        path: file,
      });
      continue;
    }

    if (!parsed || typeof parsed !== 'object') {
      collector.push({
        code: 'PARSE_FAIL',
        severity: 'error',
        message: `${file} must decode to an object`,
        path: file,
      });
      continue;
    }

    const artifact = normalizeArtifact(file, parsed as ArtifactInput, collector, config);
    if (artifact) {
      artifact.sourceHash = sha1(source);
      artifacts.push(artifact);
    }
  }

  return artifacts;
}

export async function evaluateArtifactGraph(
  artifacts: ParsedArtifact[],
  config: AgentDocsConfig,
  contradictionMatrix: ContradictionMatrix | null,
  collector: Collector,
): Promise<void> {
  const byId = new Map<string, ParsedArtifact>();
  const canonicalKeys = new Map<string, ParsedArtifact>();

  for (const artifact of artifacts) {
    if (byId.has(artifact.id)) {
      const original = byId.get(artifact.id);
      collector.push({
        code: 'DUPLICATE_ID',
        severity: 'error',
        message: `Duplicate artifact id ${artifact.id} in ${artifact.path} and ${original?.path}`,
        path: artifact.path,
      });
      continue;
    }
    byId.set(artifact.id, artifact);
  }

  for (const artifact of artifacts) {
    if (!artifact.canonicalKey) {
      continue;
    }
    const key = `${artifact.kind}:${artifact.canonicalKey}`;
    const prior = canonicalKeys.get(key);
    if (prior) {
      collector.push({
        code: 'DUPLICATE_CANONICAL_KEY',
        severity: config.strict.failOnDuplicateCanonicalKey ? 'error' : 'warning',
        message: `Duplicate canonical key ${artifact.canonicalKey} for ${artifact.kind} in ${prior.id} and ${artifact.id}`,
        path: artifact.path,
      });
      if (!config.strict.failOnDuplicateCanonicalKey) {
        continue;
      }
    }
    canonicalKeys.set(key, artifact);
  }

  const knownIds = new Set(byId.keys());
  for (const artifact of artifacts) {
    const status = artifact.status as ArtifactStatus;
    const allowed = getAllowedStatuses(artifact.kind, config);
    if (!allowed.has(status)) {
      collector.push({
        code: 'INVALID_STATUS',
        severity: 'error',
        message: `${artifact.id} has invalid status "${artifact.status}". Allowed statuses: ${Array.from(allowed).join(', ')}`,
        path: artifact.path,
      });
    }

    validateReferenceField('dependsOn', artifact.dependsOn, artifact, knownIds, collector);
    validateReferenceField('supersedes', artifact.supersedes, artifact, knownIds, collector);
    validateReferenceField('supersededBy', artifact.supersededBy, artifact, knownIds, collector);

    for (const conflict of artifact.conflictsWith) {
      if (conflict === artifact.id) {
        collector.push({
          code: 'SELF_CONFLICT',
          severity: 'error',
          message: `${artifact.id} cannot conflict with itself`,
          path: artifact.path,
        });
        continue;
      }
      if (!knownIds.has(conflict)) {
        collector.push({
          code: 'MISSING_CONFLICT_REF',
          severity: 'error',
          message: `${artifact.id} declares conflict with unknown artifact ${conflict}`,
          path: artifact.path,
        });
        continue;
      }

      if (config.strict.requireConflictSymmetry) {
        const target = byId.get(conflict);
        if (target && !target.conflictsWith.includes(artifact.id)) {
          collector.push({
            code: 'ASYMMETRIC_CONFLICT',
            severity: status === 'draft' ? 'warning' : 'error',
            message: `${artifact.id} and ${conflict} must include symmetric conflictsWith declarations`,
            path: artifact.path,
          });
        }
      }
    }
  }

  if (!contradictionMatrix) {
    return;
  }

  for (const matrix of contradictionMatrix.entries) {
    if (!Array.isArray(matrix.relatedArtifacts) || matrix.relatedArtifacts.length < 2) {
      continue;
    }

    const involved = matrix.relatedArtifacts.filter((id) => knownIds.has(id));
    if (involved.length < 2) {
      continue;
    }

    const affectedSeverity = CONTRADICTION_SEVERITY_ORDER[matrix.severity];
    const isOpen = matrix.status === 'open' || matrix.status === 'mitigated';
    if (!isOpen) {
      continue;
    }

    for (const artifactId of involved) {
      const artifact = byId.get(artifactId);
      if (!artifact) {
        continue;
      }

      if (affectedSeverity >= 3 && artifact.status !== 'draft') {
        collector.push({
          code: 'UNRESOLVED_HIGH_CONTRADICTION',
          severity: 'error',
          message: `${artifactId} is tied to open/mitigated high/critical contradiction ${matrix.id} (${matrix.severity})`,
          path: artifact.path,
        });
      } else if (affectedSeverity >= 2 && artifact.status === 'accepted') {
        collector.push({
          code: 'MEDIUM_CONTRADICTION',
          severity: 'warning',
          message: `${artifactId} participates in open/mitigated ${matrix.severity} contradiction ${matrix.id}`,
          path: artifact.path,
        });
      }
    }
  }
}

export async function evaluateCodeTraceability(
  root: string,
  artifacts: ParsedArtifact[],
  config: AgentDocsConfig,
  collector: Collector,
): Promise<void> {
  const requiredKinds = new Set(config.codeTraceability?.requireForKinds ?? []);
  const allowedExtensions = new Set(
    (config.codeTraceability?.allowedExtensions ?? []).map((entry) => normalizePath(entry).toLowerCase()),
  );
  const ignorePaths = new Set(normalizeIgnoreList(config.codeTraceability?.ignorePaths ?? []));
  const cache = new Map<string, string | null>();

  for (const artifact of artifacts) {
    const requiresMapping = config.strict.requireCodeTraceability
      && (requiredKinds.size === 0 || requiredKinds.has('*') || requiredKinds.has(artifact.kind));

    if (!requiresMapping && artifact.implements.length === 0) {
      continue;
    }

    if (requiresMapping && artifact.implements.length === 0) {
      collector.push({
        code: 'MISSING_CODE_MAPPING',
        severity: 'error',
        message: `${artifact.id} must declare code mappings when strict code traceability is enabled`,
        path: artifact.path,
      });
      continue;
    }

    for (const ref of artifact.implements) {
      if (!ref.path) {
        collector.push({
          code: 'INVALID_CODE_REFERENCE',
          severity: 'error',
          message: `${artifact.id} has an empty code reference`,
          path: artifact.path,
        });
        continue;
      }

      const normalizedReference = normalizePath(ref.path);
      const absolute = path.isAbsolute(normalizedReference)
        ? normalizedReference
        : path.join(root, normalizedReference);
      const extension = path.extname(absolute).toLowerCase();
      if (allowedExtensions.size > 0 && extension && !allowedExtensions.has(extension)) {
        collector.push({
          code: 'UNSUPPORTED_CODE_EXTENSION',
          severity: 'warning',
          message: `${artifact.id} references ${normalizedReference}, which has unsupported extension ${extension}`,
          path: artifact.path,
        });
      }

      if (shouldIgnore(normalizedReference, ignorePaths)) {
        collector.push({
          code: 'IGNORED_CODE_REFERENCE',
          severity: 'warning',
          message: `${artifact.id} references ignored path ${normalizedReference}`,
          path: artifact.path,
        });
      }

      if (!cache.has(absolute)) {
        const content = await fs.readFile(absolute, 'utf8').catch(() => null);
        cache.set(absolute, content);
      }
      const source = cache.get(absolute);
      if (!source) {
        collector.push({
          code: 'MISSING_CODE_REFERENCE',
          severity: 'error',
          message: `Code reference ${normalizedReference} does not exist for ${artifact.id}`,
          path: artifact.path,
        });
        continue;
      }

      if (config.strict.requireCodeSymbols && ref.symbols && ref.symbols.length > 0) {
        for (const symbol of ref.symbols) {
          if (!symbol) {
            continue;
          }
          if (!source.includes(symbol)) {
            collector.push({
              code: 'MISSING_CODE_SYMBOL',
              severity: 'warning',
              message: `${artifact.id} references symbol "${symbol}" but it was not found in ${normalizedReference}`,
              path: artifact.path,
            });
          }
        }
      } else if (config.strict.requireCodeSymbols && (!ref.symbols || ref.symbols.length === 0)) {
        collector.push({
          code: 'MISSING_CODE_SYMBOLS',
          severity: 'warning',
          message: `${artifact.id} has no symbol list in code mapping for ${normalizedReference}`,
          path: artifact.path,
        });
      }
    }
  }
}

export async function evaluateMarkdownPolicy(
  root: string,
  config: AgentDocsConfig,
  markdownFiles: string[],
  collector: Collector,
): Promise<void> {
  const mode = config.markdownPolicy.mode;
  if (mode === 'allow') {
    return;
  }

  const allowList = new Set(
    [...new Set([config.generated.markdownRoot, ...config.markdownPolicy.allowInGeneratedPaths].filter(Boolean))]
      .map((value) => normalizePath(value)),
  );

  for (const file of markdownFiles) {
    const normalized = normalizePath(file);
    const isAllowed = fileInAllowedPath(normalized, allowList);
    if (!isAllowed) {
      const message = `Unapproved Markdown source file: ${file}`;
      collector.push({
        code: 'MARKDOWN_SOURCE_DENIED',
        severity: mode === 'deny' ? 'error' : 'warning',
        message,
        path: file,
      });
    }
  }
}

export async function evaluateGeneratedFreshness(
  root: string,
  config: AgentDocsConfig,
  artifacts: ParsedArtifact[],
  collector: Collector,
): Promise<void> {
  if (artifacts.length === 0) {
    return;
  }
  if (!config.strict.requireGeneratedFreshness) {
    return;
  }

  const manifestPath = path.join(root, config.generated.manifestPath);
  const rawManifest = await fs.readFile(manifestPath, 'utf8').catch(() => null);
  if (!rawManifest) {
    collector.push({
      code: 'GENERATE_MISSING_MANIFEST',
      severity: 'error',
      message: `Generated manifest is missing: ${config.generated.manifestPath}. Run "agent-docs generate".`,
      path: config.generated.manifestPath,
    });
    return;
  }

  let manifest: GeneratedManifest;
  try {
    manifest = JSON.parse(rawManifest) as GeneratedManifest;
  } catch {
    collector.push({
      code: 'GENERATE_MANIFEST_PARSE_FAIL',
      severity: 'error',
      message: `Invalid generated manifest JSON: ${config.generated.manifestPath}`,
      path: config.generated.manifestPath,
    });
    return;
  }

  const manifestEntries = new Map<string, GeneratedManifestEntry>();
  for (const entry of manifest.entries ?? []) {
    manifestEntries.set(entry.source, entry);
  }

  const requiredSources = new Set(artifacts.map((artifact) => artifact.path));
  for (const required of requiredSources) {
    const entry = manifestEntries.get(required);
    const artifact = artifacts.find((doc) => doc.path === required);
    if (!entry || !artifact?.sourceHash) {
      collector.push({
        code: 'GENERATED_MISSING_ARTIFACT',
        severity: 'error',
        message: `No manifest entry for ${required}. Run "agent-docs generate".`,
        path: required,
      });
      continue;
    }

    if (entry.sourceHash !== artifact.sourceHash) {
      collector.push({
        code: 'GENERATED_STALE_ARTIFACT',
        severity: 'error',
        message: `${artifact.id} has changed since last generation. Run "agent-docs generate".`,
        path: artifact.path,
      });
    }
  }

  for (const entry of manifestEntries.values()) {
    if (!requiredSources.has(entry.source)) {
      collector.push({
        code: 'GENERATED_ORPHAN_ARTIFACT',
        severity: 'warning',
        message: `Manifest contains stale entry for removed artifact ${entry.source}`,
        path: entry.source,
      });
    }
  }
}

export function buildReport(start: number, root: string, collector: Collector, counts: {
  filesChecked: number;
  docsChecked: number;
  documentsChecked: number;
}): GateReport {
  const issues = collector.toArray();
  const totals = issues.reduce(
    (acc, issue) => {
      if (issue.severity === 'error') acc.errors += 1;
      if (issue.severity === 'warning') acc.warnings += 1;
      if (issue.severity === 'info') acc.info += 1;
      return acc;
    },
    { errors: 0, warnings: 0, info: 0, filesChecked: counts.filesChecked, docsChecked: counts.docsChecked, documentsChecked: counts.documentsChecked },
  );

  return {
    generatedAt: new Date(start).toISOString(),
    sourceRoot: root,
    issues,
    totals,
  };
}

export async function readContradictionMatrix(
  root: string,
): Promise<ContradictionMatrix | null> {
  const candidates = [
    path.join(root, '.agent-docs', 'contradictions.toon'),
    path.join(root, '.agent-docs', 'contradictions.json'),
  ];

  for (const file of candidates) {
    const parsed = await readContradictionFile(file);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

async function readContradictionFile(filePath: string): Promise<ContradictionMatrix | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = filePath.toLowerCase().endsWith('.toon') ? decode(raw) : JSON.parse(raw);
    if (isValidContradictionMatrix(parsed)) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

function isValidContradictionMatrix(value: unknown): value is ContradictionMatrix {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof (value as { version?: unknown }).version === 'string' &&
      Array.isArray((value as { entries?: unknown[] }).entries),
  );
}

export function sha1(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export function getAllowedStatuses(kind: string, config: AgentDocsConfig): Set<ArtifactStatus> {
  const defaults = config.kindDefaults[kind];
  if (defaults?.requiredStatus?.length) {
    return new Set(defaults.requiredStatus as ArtifactStatus[]);
  }

  return new Set(
    Object.values(config.kindDefaults).reduce<ArtifactStatus[]>((all, entry) => [...all, ...entry.requiredStatus], []),
  );
}

function normalizeArtifact(
  file: string,
  input: ArtifactInput,
  collector: Collector,
  config: AgentDocsConfig,
): ParsedArtifact | null {
  const id = String(input.id ?? '').trim();
  const kind = String(input.kind ?? '').trim();
  const title = String(input.title ?? '').trim();
  const status = String(input.status ?? '').trim().toLowerCase() || 'draft';
  const date = typeof input.date === 'string' ? input.date.trim() : undefined;

  if (!id) {
    collector.push({
      code: 'MISSING_ID',
      severity: 'error',
      message: `Missing id`,
      path: file,
    });
    return null;
  }

  if (!kind) {
    collector.push({
      code: 'MISSING_KIND',
      severity: 'error',
      message: `Missing kind for ${id}`,
      path: file,
    });
  }

  if (!title) {
    collector.push({
      code: 'MISSING_TITLE',
      severity: 'error',
      message: `Missing title for ${id}`,
      path: file,
    });
  }

  const normalized = {
    path: file,
    id,
    kind: kind || 'OTHER',
    title,
    status,
    scope: String(input.scope ?? 'platform').trim(),
    owner: input.owner ? String(input.owner).trim() : undefined,
    date,
    implements: normalizeCodeReferences(file, input, collector),
    dependsOn: uniqueList(input.dependsOn),
    supersedes: uniqueList(input.supersedes),
    supersededBy: uniqueList(input.supersededBy),
    conflictsWith: uniqueList(input.conflictsWith),
    canonicalKey: input.canonicalKey ? String(input.canonicalKey).trim() : undefined,
    tags: uniqueList(input.tags),
    sections: normalizeSections(input.sections ?? []),
    raw: input,
  } satisfies ParsedArtifact;

  const allowedStatuses = getAllowedStatuses(normalized.kind, config);
  if (!allowedStatuses.has(status as ArtifactStatus)) {
    collector.push({
      code: 'INVALID_STATUS',
      severity: 'error',
      message: `${id} has invalid status "${status}"`,
      path: file,
    });
  }

  return normalized;
}

function normalizeSections(raw: unknown): ParsedArtifact['sections'] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const value = entry as Record<string, unknown>;
      const title = String(value.title ?? '').trim() || 'Untitled';
      const body = String(value.body ?? '').trim();
      return { title, body };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function normalizeCodeReferences(
  file: string,
  input: ArtifactInput,
  collector: Collector,
): CodeTraceabilityReference[] {
  const fallback = extractReferences(input.traceability, collector, file);
  const fromTopLevel = extractReferencesFromInput(input.implements, collector, file);
  const combined = [...fromTopLevel, ...fallback];
  const deduped = new Map<string, Set<string>>();
  for (const item of combined) {
    const existing = deduped.get(item.path) ?? new Set<string>();
    for (const symbol of item.symbols ?? []) {
      existing.add(symbol);
    }
    deduped.set(item.path, existing);
  }

  return Array.from(deduped.entries())
    .map(([pathValue, symbols]) => ({
      path: pathValue,
      symbols: symbols.size > 0 ? Array.from(symbols) : undefined,
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function extractReferences(
  raw: unknown,
  collector: Collector,
  file: string,
): CodeTraceabilityReference[] {
  if (!raw) {
    return [];
  }

  const value = (raw as { implements?: unknown }).implements;
  return extractReferencesFromInput(value, collector, file);
}

function extractReferencesFromInput(
  value: unknown,
  collector: Collector,
  file: string,
): CodeTraceabilityReference[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (typeof entry === 'string') {
      const normalized = parseCodeReference(entry);
      if (normalized.path) {
        return [normalized];
      }
      collector.push({
        code: 'INVALID_CODE_REFERENCE',
        severity: 'error',
        message: `Invalid code reference in ${file}: ${entry}`,
        path: file,
      });
      return [];
    }

    if (!entry || typeof entry !== 'object') {
      collector.push({
        code: 'INVALID_CODE_REFERENCE',
        severity: 'error',
        message: `Invalid code reference in ${file}: ${String(entry)}`,
        path: file,
      });
      return [];
    }

    const candidate = entry as { path?: unknown; symbols?: unknown };
    const rawPath = typeof candidate.path === 'string' ? candidate.path.trim() : '';
    if (!rawPath) {
      collector.push({
        code: 'INVALID_CODE_REFERENCE',
        severity: 'error',
        message: `Invalid code reference object in ${file}: missing path`,
        path: file,
      });
      return [];
    }

    const symbols = normalizeCodeSymbols(candidate.symbols);
    return [{ path: rawPath, symbols }];
  });
}

function parseCodeReference(raw: string): CodeTraceabilityReference {
  const [pathValue, symbolsValue] = raw.split('#');
  const symbols = symbolsValue ? normalizeCodeSymbols(symbolsValue.split(',').map((entry) => entry.trim())) : [];
  return {
    path: pathValue.trim(),
    symbols: symbols.length > 0 ? symbols : undefined,
  };
}

function normalizeCodeSymbols(value: unknown): string[] {
  if (!value) {
    return [];
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => String(entry ?? '').trim())
    .filter(Boolean);
}

function uniqueList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized = value
    .map((entry) => String(entry ?? '').trim())
    .filter(Boolean);
  return [...new Set(normalized)];
}

function validateReferenceField(
  field: 'dependsOn' | 'supersedes' | 'supersededBy',
  references: string[],
  source: ParsedArtifact,
  knownIds: Set<string>,
  collector: Collector,
): void {
  for (const ref of references) {
    if (!knownIds.has(ref)) {
      collector.push({
        code: 'MISSING_REFERENCE',
        severity: 'error',
        message: `${source.id} references unknown artifact ${ref} in ${field}`,
        path: source.path,
      });
    }
  }
}

function isMarkdownFile(file: string): boolean {
  return file.toLowerCase().endsWith('.md') || file.toLowerCase().endsWith('.markdown');
}

function shouldIgnore(normalizedPath: string, ignoreSet: Set<string>): boolean {
  if (ignoreSet.has(normalizedPath) || ignoreSet.has('')) {
    return true;
  }

  const prefixSegments = normalizedPath.split('/');
  const normalizedPathWithTrailingSlash = `${normalizedPath}/`;

  for (const ignoreToken of ignoreSet) {
    const token = normalizePath(ignoreToken);
    if (!token) {
      continue;
    }

    if (token.includes('/')) {
      if (normalizedPath === token || normalizedPath.startsWith(`${token}/`)) {
        return true;
      }
      continue;
    }

    if (
      prefixSegments.includes(token)
      || normalizedPathWithTrailingSlash.includes(`/${token}/`)
    ) {
      return true;
    }
  }

  return false;
}

function fileInAllowedPath(file: string, allowedRoots: Set<string>): boolean {
  const normalized = normalizePath(file);
  for (const prefix of allowedRoots) {
    if (normalized === prefix || normalized.startsWith(`${prefix}/`)) {
      return true;
    }
  }
  return false;
}

function normalizeIgnoreList(paths: string[]): string[] {
  return paths.map((entry) => normalizePath(entry)).filter((entry) => Boolean(entry));
}

function normalizePath(filePath: string): string {
  return filePath
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}
