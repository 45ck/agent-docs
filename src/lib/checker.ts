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
  ArtifactReferenceField,
} from '../types.js';
import { KIND_METADATA_SCHEMAS } from './metadata-schemas.js';

const DEFAULT_BEADS_ID_PATTERN = /^bead-\d{4}$/;

const ALLOWED_STATUSES: Set<ArtifactStatus> = new Set<ArtifactStatus>([
  'draft',
  'proposed',
  'accepted',
  'superseded',
  'rejected',
  'deprecated',
  'deferred',
  'open',
  'blocked',
  'passed',
  'failed',
  'triaged',
  'in-progress',
  'resolved',
  'verified',
  'closed',
  'mitigated',
]);

const CONTRADICTION_SEVERITY_ORDER: Record<'low' | 'medium' | 'high' | 'critical', number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};
const REFERENCE_FIELD_SET = new Set<ArtifactReferenceField>([
  'dependsOn',
  'supersedes',
  'supersededBy',
  'conflictsWith',
  'references',
]);

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
  return listFiles(root, config.sourceRoots, filterIgnoresForSourceRoots(config.ignorePaths, config.sourceRoots));
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
    validateReferenceField('references', artifact.references, artifact, knownIds, collector);

    evaluateReferenceRules(artifact, byId, config, collector);
    evaluateKindMetadata(artifact, collector);

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

  evaluateTerminologyConsistency(artifacts, config, collector);
}

export function evaluateReferenceRules(
  artifact: ParsedArtifact,
  byId: Map<string, ParsedArtifact>,
  config: AgentDocsConfig,
  collector: Collector,
): void {
  const rules = config.references?.enabled ? config.references.rules : [];
  if (rules.length === 0) {
    return;
  }

  const knownTargetKinds = new Map<string, string>();
  for (const [id, target] of byId.entries()) {
    knownTargetKinds.set(id, target.kind);
  }

  for (const rule of rules) {
    if (!isKnownReferenceField(rule.field)) {
      collector.push({
        code: 'INVALID_REFERENCE_FIELD',
        severity: rule.severity ?? 'warning',
        message: `Invalid reference rule field "${String(rule.field)}" in config for ${artifact.id}`,
        path: artifact.path,
      });
      continue;
    }

    if (!isRuleApplicable(rule.sourceKinds, artifact.kind)) {
      continue;
    }

    const references = getReferencesByField(artifact, rule.field);
    if (rule.minCount && references.length < rule.minCount) {
      collector.push({
        code: 'MIN_RELATIONSHIP_COUNT',
        severity: rule.severity ?? 'error',
        message: `${artifact.id} must declare at least ${rule.minCount} ${rule.field} references`,
        path: artifact.path,
      });
    }

    if (rule.maxCount !== undefined && references.length > rule.maxCount) {
      collector.push({
        code: 'MAX_RELATIONSHIP_COUNT',
        severity: rule.severity ?? 'warning',
        message: `${artifact.id} should not exceed ${rule.maxCount} ${rule.field} references`,
        path: artifact.path,
      });
    }

    if (rule.allowedTargetKinds?.length) {
      const allowedSet = new Set(rule.allowedTargetKinds.map((value) => value.toLowerCase()));
      for (const targetId of references) {
        const kind = knownTargetKinds.get(targetId);
        if (!kind) {
          continue;
        }
        if (!allowedSet.has(normalizeKind(kind))) {
          collector.push({
            code: 'INVALID_REFERENCE_KIND',
            severity: rule.severity ?? 'error',
            message: `${artifact.id} references ${targetId} from ${rule.field}, but ${targetId} is kind ${kind}; allowed: ${rule.allowedTargetKinds.join(', ')}`,
            path: artifact.path,
          });
        }
      }
    }

    if (rule.requiredTargetKinds?.length) {
      const requiredKinds = new Set(rule.requiredTargetKinds.map((value) => value.toLowerCase()));
      const requiredTargetMinCount = rule.requiredTargetMinCount ?? 1;
      const matchingCount = references.reduce((acc, targetId) => {
        const kind = knownTargetKinds.get(targetId);
        return kind && requiredKinds.has(normalizeKind(kind)) ? acc + 1 : acc;
      }, 0);
      if (matchingCount < requiredTargetMinCount) {
        collector.push({
          code: 'MISSING_REQUIRED_REFERENCE_KIND',
          severity: rule.severity ?? 'error',
          message: `${artifact.id} requires at least ${requiredTargetMinCount} references in ${rule.field} to: ${rule.requiredTargetKinds.join(', ')}`,
          path: artifact.path,
        });
      }
    }
  }
}

function getReferencesByField(artifact: ParsedArtifact, field: ArtifactReferenceField): string[] {
  switch (field) {
    case 'dependsOn':
      return artifact.dependsOn;
    case 'supersedes':
      return artifact.supersedes;
    case 'supersededBy':
      return artifact.supersededBy;
    case 'conflictsWith':
      return artifact.conflictsWith;
    case 'references':
      return artifact.references;
    default:
      return [];
  }
}

function isRuleApplicable(sourceKinds: string[], artifactKind: string): boolean {
  if (!sourceKinds || sourceKinds.length === 0) {
    return true;
  }
  const normalized = sourceKinds.map((value) => normalizeKind(value));
  return normalized.includes('*') || normalized.includes(normalizeKind(artifactKind));
}

function isKnownReferenceField(value: string): value is ArtifactReferenceField {
  return REFERENCE_FIELD_SET.has(value as ArtifactReferenceField);
}

function evaluateTerminologyConsistency(
  artifacts: ParsedArtifact[],
  config: AgentDocsConfig,
  collector: Collector,
): void {
  if (!config.terminology?.enabled) {
    return;
  }

  const allowedTerms = collectTermDefinitions(artifacts, config);
  if (allowedTerms.size === 0) {
    collector.push({
      code: 'MISSING_TERM_DICTIONARY',
      severity: config.terminology.unknownTermSeverity,
      message:
        'No terminology dictionary found in source artifacts. Add terms to DOMAINTREE metadata for terminology validation.',
      path: artifacts[0]?.path,
    });
    return;
  }

  const aliases = collectTermAliases(artifacts, config);
  let regex: RegExp;
  try {
    regex = new RegExp(config.terminology.termRegex, 'g');
  } catch {
    regex = /\{\{\s*([^}]+?)\s*\}\}/g;
  }

  for (const artifact of artifacts) {
    const textFragments = [
      config.terminology.includeTitle ? artifact.title : '',
      ...artifact.sections.flatMap((section) => [
        config.terminology.includeSectionTitles ? section.title : '',
        config.terminology.includeSectionBodies ? section.body : '',
      ]),
    ];

    for (const fragment of textFragments) {
      const matches = collectTermRefsFromText(fragment, regex);
      for (const match of matches) {
        const normalized = normalizeTerm(match);
        if (!normalized) {
          continue;
        }

        if (!allowedTerms.has(normalized) && !aliases.has(normalized)) {
          collector.push({
            code: 'UNKNOWN_TERM_REFERENCE',
            severity: config.terminology.unknownTermSeverity,
            message: `Unknown terminology reference "{{${match}}}" in ${artifact.id}. Add to DOMAINTREE terminology definitions.`,
            path: artifact.path,
          });
        }
      }
    }
  }
}

function collectTermDefinitions(artifacts: ParsedArtifact[], config: AgentDocsConfig): Set<string> {
  const acceptedSourceKinds = new Set(config.terminology.sourceKinds.map((value) => normalizeKind(value)));
  const terms = new Set<string>();
  if (acceptedSourceKinds.size === 0) {
    return terms;
  }

  for (const artifact of artifacts) {
    if (!acceptedSourceKinds.has(normalizeKind(artifact.kind))) {
      continue;
    }
    for (const fieldName of config.terminology.termMetadataKeys) {
      const value = artifact.raw?.metadata?.[fieldName];
      collectTermsFromValue(value, terms);
    }
  }

  return terms;
}

function collectTermAliases(artifacts: ParsedArtifact[], config: AgentDocsConfig): Set<string> {
  const aliasSet = new Set<string>();
  const acceptedSourceKinds = new Set(config.terminology.sourceKinds.map((value) => normalizeKind(value)));
  if (acceptedSourceKinds.size === 0) {
    return aliasSet;
  }

  for (const artifact of artifacts) {
    if (!acceptedSourceKinds.has(normalizeKind(artifact.kind))) {
      continue;
    }
    const aliases = artifact.raw?.metadata?.[config.terminology.aliasMetadataKey];
    if (!aliases) {
      continue;
    }
    if (typeof aliases === 'string') {
      for (const entry of aliases.split(',').map((entry) => entry.trim()).filter(Boolean)) {
        const normalized = normalizeTerm(entry);
        if (normalized) {
          aliasSet.add(normalized);
        }
      }
      continue;
    }
    if (Array.isArray(aliases)) {
      for (const alias of aliases) {
        const normalized = normalizeTerm(String(alias ?? ''));
        if (normalized) {
          aliasSet.add(normalized);
        }
      }
      continue;
    }
    if (typeof aliases === 'object') {
      for (const alias of Object.keys(aliases)) {
        const normalized = normalizeTerm(alias);
        if (normalized) {
          aliasSet.add(normalized);
        }
      }
    }
  }

  return aliasSet;
}

function collectTermsFromValue(value: unknown, output: Set<string>): void {
  if (typeof value === 'string') {
    for (const entry of value.split(',').map((entry) => entry.trim()).filter(Boolean)) {
      const normalized = normalizeTerm(entry);
      if (normalized) {
        output.add(normalized);
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === 'string') {
        const normalized = normalizeTerm(item);
        if (normalized) {
          output.add(normalized);
        }
      }
    }
    return;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      const normalized = normalizeTerm(key);
      if (normalized) {
        output.add(normalized);
      }
      const valueEntry = record[key];
      if (typeof valueEntry === 'string') {
        for (const entry of valueEntry.split(',').map((entry) => entry.trim()).filter(Boolean)) {
          const nested = normalizeTerm(entry);
          if (nested) {
            output.add(nested);
          }
        }
      }
    }
  }
}

function collectTermRefsFromText(value: string, pattern: RegExp): string[] {
  if (!value) {
    return [];
  }
  const matches: string[] = [];
  pattern.lastIndex = 0;
  let match = pattern.exec(value);
  while (match !== null) {
    const candidate = String(match[1] ?? '').trim();
    if (candidate) {
      matches.push(candidate);
    }
    if (pattern.global) {
      match = pattern.exec(value);
    } else {
      break;
    }
  }

  return matches;
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
  const supportsAllExtensions = allowedExtensions.size === 0 || allowedExtensions.has('*');
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
      if (!supportsAllExtensions && allowedExtensions.size > 0 && extension && !allowedExtensions.has(extension)) {
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

export async function evaluateBeadsRegistry(
  root: string,
  config: AgentDocsConfig,
  collector: Collector,
): Promise<void> {
  if (!config.beads?.enabled) {
    return;
  }

  const beadsPath = path.join(root, normalizePath(config.beads.file));
  const raw = await fs.readFile(beadsPath, 'utf8').catch(() => null);
  if (!raw) {
    collector.push({
      code: 'BEADS_FILE_MISSING',
      severity: 'error',
      message: `Beads issue file missing: ${config.beads.file}. Add it or disable beads validation.`,
      path: config.beads.file,
    });
    return;
  }

  let idPattern: RegExp;
  try {
    idPattern = new RegExp(config.beads.issueIdPattern);
  } catch {
    collector.push({
      code: 'BEADS_INVALID_ID_PATTERN',
      severity: 'warning',
      message: `Invalid beads issueIdPattern "${config.beads.issueIdPattern}". Falling back to ${DEFAULT_BEADS_ID_PATTERN.toString()}.`,
      path: config.beads.file,
    });
    idPattern = DEFAULT_BEADS_ID_PATTERN;
  }

  const allowedStatuses = new Set(
    (config.beads.allowedStatuses ?? ['open', 'closed']).map((status) => String(status ?? '').trim().toLowerCase()),
  );
  const recordsById = new Map<string, number>();
  const blockedRefs = new Map<string, string[]>();

  const lines = raw.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const lineNo = i + 1;
    const trimmed = lines[i]?.trim();
    if (!trimmed) {
      continue;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(trimmed);
    } catch {
      collector.push({
        code: 'BEADS_INVALID_JSON',
        severity: 'error',
        message: `Invalid JSON in ${config.beads.file} at line ${lineNo}`,
        path: `${config.beads.file}:${lineNo}`,
      });
      continue;
    }

    if (!payload || typeof payload !== 'object') {
      collector.push({
        code: 'BEADS_INVALID_RECORD',
        severity: 'error',
        message: `Beads record at line ${lineNo} must be an object`,
        path: `${config.beads.file}:${lineNo}`,
      });
      continue;
    }

    const issue = payload as Record<string, unknown>;
    const id = parseBeadsId(issue.id);
    if (!id) {
      collector.push({
        code: 'BEADS_MISSING_ID',
        severity: 'error',
        message: `Beads record at line ${lineNo} is missing an id`,
        path: `${config.beads.file}:${lineNo}`,
      });
      continue;
    }

    if (!idPattern.test(id)) {
      collector.push({
        code: 'BEADS_INVALID_ID',
        severity: 'error',
        message: `Invalid beads id "${id}" at ${config.beads.file}:${lineNo}; expected ${idPattern.toString()}`,
        path: `${config.beads.file}:${lineNo}`,
      });
    }

    if (recordsById.has(id)) {
      const priorLine = recordsById.get(id);
      collector.push({
        code: 'BEADS_DUPLICATE_ISSUE_ID',
        severity: 'error',
        message: `Duplicate beads id "${id}" at lines ${priorLine} and ${lineNo}`,
        path: `${config.beads.file}:${lineNo}`,
      });
      continue;
    }
    recordsById.set(id, lineNo);

    const status = typeof issue.status === 'string' ? issue.status.trim().toLowerCase() : '';
    if (!status) {
      collector.push({
        code: 'BEADS_MISSING_STATUS',
        severity: 'warning',
        message: `Beads issue ${id} at ${config.beads.file}:${lineNo} is missing status`,
        path: `${config.beads.file}:${lineNo}`,
      });
    } else if (!allowedStatuses.has(status)) {
      collector.push({
        code: 'BEADS_INVALID_STATUS',
        severity: 'error',
        message: `Beads issue ${id} has invalid status "${status}" at ${config.beads.file}:${lineNo}`,
        path: `${config.beads.file}:${lineNo}`,
      });
    }

    const blockedBy = parseBeadsStringArray(issue.blockedBy);
    if (blockedBy === null) {
      collector.push({
        code: 'BEADS_INVALID_BLOCKED_BY',
        severity: 'error',
        message: `Beads issue ${id} at line ${lineNo} has invalid blockedBy format`,
        path: `${config.beads.file}:${lineNo}`,
      });
      continue;
    }

    blockedRefs.set(id, blockedBy);
    for (const blockedId of blockedBy) {
      if (blockedId === id) {
        collector.push({
          code: 'BEADS_SELF_BLOCK',
          severity: 'error',
          message: `Beads issue ${id} blocks itself at ${config.beads.file}:${lineNo}`,
          path: `${config.beads.file}:${lineNo}`,
        });
      }
      if (!idPattern.test(blockedId)) {
        collector.push({
          code: 'BEADS_INVALID_BLOCKED_ID',
          severity: 'error',
          message: `Beads issue ${id} references invalid blocked id "${blockedId}" at ${config.beads.file}:${lineNo}`,
          path: `${config.beads.file}:${lineNo}`,
        });
      }
    }
  }

  if (!config.beads.validateBlockedRefs) {
    return;
  }

  for (const [id, blockedIds] of blockedRefs.entries()) {
    for (const blockedId of blockedIds) {
      if (!recordsById.has(blockedId)) {
        collector.push({
          code: 'BEADS_UNKNOWN_BLOCKED_ISSUE',
          severity: 'error',
          message: `Beads issue ${id} blocks unknown issue "${blockedId}"`,
          path: config.beads.file,
        });
      }
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
    references: uniqueList(input.references),
    conflictsWith: uniqueList(input.conflictsWith),
    canonicalKey: input.canonicalKey ? String(input.canonicalKey).trim() : undefined,
    tags: uniqueList(input.tags),
    specRefs: normalizeStringList(input.specRefs),
    sections: normalizeSections(input.sections ?? []),
    raw: input,
  } satisfies ParsedArtifact;

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

function parseBeadsId(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

function parseBeadsStringArray(raw: unknown): string[] | null {
  if (raw == null) {
    return [];
  }

  if (typeof raw === 'string') {
    const normalized = raw
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    return normalized.length > 0 ? normalized : [];
  }

  if (!Array.isArray(raw)) {
    return null;
  }

  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') {
      return null;
    }
    const value = entry.trim();
    if (value) {
      out.push(value);
    }
  }

  return out;
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

function normalizeStringList(value: unknown): string[] {
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .filter((entry, index, all) => all.indexOf(entry) === index);
  }

  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return [];
  }

  return uniqueList(value);
}

function validateReferenceField(
  field: ArtifactReferenceField,
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

function filterIgnoresForSourceRoots(ignorePaths: string[], sourceRoots: string[]): string[] {
  const normalizedRoots = sourceRoots.map((entry) => normalizePath(entry)).filter(Boolean);

  return ignorePaths.filter((entry) => {
    const token = normalizePath(entry);
    if (!token) {
      return false;
    }

    return !normalizedRoots.some((root) => root === token || root.startsWith(`${token}/`));
  });
}

function normalizePath(filePath: string): string {
  return filePath
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

function normalizeKind(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeTerm(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function evaluateKindMetadata(artifact: ParsedArtifact, collector: Collector): void {
  const schema = KIND_METADATA_SCHEMAS[artifact.kind];
  if (!schema) {
    return;
  }

  const metadata = (artifact.raw.metadata ?? {}) as Record<string, unknown>;

  for (const [field, rule] of Object.entries(schema.fields)) {
    const value = metadata[field];

    if (rule.required && (value === undefined || value === null || value === '' || (rule.type === 'string[]' && Array.isArray(value) && value.length === 0))) {
      collector.push({
        code: 'METADATA_REQUIRED',
        severity: rule.severity ?? 'warning',
        message: `${artifact.id} (${artifact.kind}) is missing required metadata field "${field}"`,
        path: artifact.path,
      });
      continue;
    }

    if (value === undefined || value === null || value === '') {
      continue;
    }

    if (rule.type === 'string' && typeof value !== 'string') {
      collector.push({
        code: 'METADATA_INVALID_TYPE',
        severity: rule.severity ?? 'warning',
        message: `${artifact.id} metadata.${field} must be a string, got ${typeof value}`,
        path: artifact.path,
      });
      continue;
    }

    if (rule.type === 'number' && typeof value !== 'number') {
      collector.push({
        code: 'METADATA_INVALID_TYPE',
        severity: rule.severity ?? 'warning',
        message: `${artifact.id} metadata.${field} must be a number, got ${typeof value}`,
        path: artifact.path,
      });
      continue;
    }

    if (rule.type === 'string[]' && !Array.isArray(value)) {
      collector.push({
        code: 'METADATA_INVALID_TYPE',
        severity: rule.severity ?? 'warning',
        message: `${artifact.id} metadata.${field} must be an array, got ${typeof value}`,
        path: artifact.path,
      });
      continue;
    }

    if (rule.allowedValues && (rule.type === 'string' || rule.type === 'number')) {
      if (!(rule.allowedValues as readonly (string | number)[]).includes(value as string | number)) {
        collector.push({
          code: 'METADATA_INVALID_ENUM',
          severity: rule.severity ?? 'warning',
          message: `${artifact.id} metadata.${field} value "${value}" is not in allowed values: ${rule.allowedValues.join(', ')}`,
          path: artifact.path,
        });
      }
    }
  }
}
