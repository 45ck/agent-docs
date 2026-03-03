import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import type { AgentDocsConfig } from './types.js';

const DEFAULT_IGNORE: string[] = [
  'node_modules',
  '.git',
  'dist',
  'coverage',
  '.agent-docs',
  'generated',
  'docs/generated',
];

export const DEFAULT_CONFIG: Omit<AgentDocsConfig, 'version'> = {
  sourceExtension: '.toon',
  sourceRoots: ['docs'],
  ignorePaths: DEFAULT_IGNORE,
  generated: {
    markdownRoot: 'generated',
    allowMdOnlyWhenGenerated: true,
    indexTitle: 'Agent Docs Index',
    manifestPath: '.agent-docs/manifest.json',
    markdownHeaderPrefix: '# ',
  },
  markdownPolicy: {
    mode: 'deny',
    allowInGeneratedPaths: ['generated', 'docs/generated'],
  },
  kindDefaults: {
    ADR: { requiredStatus: ['accepted', 'draft', 'proposed', 'superseded', 'rejected', 'deprecated', 'deferred', 'open'] },
    PRD: { requiredStatus: ['accepted', 'draft', 'proposed', 'rejected', 'open'] },
    SRD: { requiredStatus: ['accepted', 'draft', 'proposed', 'rejected', 'open'] },
    JOURNEY: { requiredStatus: ['accepted', 'draft', 'proposed', 'rejected', 'open'] },
    POLICY: { requiredStatus: ['accepted', 'draft', 'proposed', 'rejected', 'open'] },
    DOMAINTREE: { requiredStatus: ['accepted', 'draft', 'proposed', 'rejected', 'open'] },
    OTHER: { requiredStatus: ['accepted', 'draft', 'proposed', 'rejected', 'open'] },
  },
  strict: {
    requireGeneratedFreshness: true,
    failOnDuplicateCanonicalKey: true,
    requireConflictSymmetry: true,
    requireCodeTraceability: false,
    requireCodeSymbols: false,
  },
  references: {
    enabled: false,
    rules: [],
  },
  terminology: {
    enabled: false,
    sourceKinds: ['DOMAINTREE'],
    termMetadataKeys: ['terms'],
    aliasMetadataKey: 'termAliases',
    termRegex: '\\{\\{\\s*([^}]+?)\\s*\\}\\}',
    includeTitle: true,
    includeSectionTitles: false,
    includeSectionBodies: true,
    unknownTermSeverity: 'warning',
  },
  contracts: {
    enabled: false,
    check: null,
    generate: null,
  },
  beads: {
    enabled: false,
    file: '.beads/issues.jsonl',
    issueIdPattern: '^bead-\\d{4}$',
    allowedStatuses: ['open', 'closed'],
    validateBlockedRefs: true,
  },
  codeTraceability: {
    requireForKinds: ['ADR', 'PRD', 'SRD', 'JOURNEY', 'POLICY', 'DOMAINTREE', 'OTHER'],
    allowedExtensions: ['*'],
    ignorePaths: ['node_modules', 'dist', 'coverage', '.agent-docs', 'generated'],
  },
  reportPath: '.agent-docs/reports/check-report.json',
  hooks: {
    preCommitPath: '.githooks/pre-commit',
    prePushPath: '.githooks/pre-push',
    installGitHooks: false,
  },
};

const DEFAULT_CONFIG_FILE = {
  version: '1.0',
  ...DEFAULT_CONFIG,
};

export async function loadConfig(root: string): Promise<AgentDocsConfig> {
  const configPath = path.join(root, '.agent-docs', 'config.json');
  try {
    const raw = await fs.readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<AgentDocsConfig>;
    return hydrateConfig(parsed);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return hydrateConfig(DEFAULT_CONFIG_FILE);
    }
    throw err;
  }
}

export async function writeDefaultConfig(root: string): Promise<string> {
  const dir = path.join(root, '.agent-docs');
  await fs.mkdir(dir, { recursive: true });
  const configPath = path.join(dir, 'config.json');
  await fs.writeFile(configPath, JSON.stringify(DEFAULT_CONFIG_FILE, null, 2), 'utf8');
  return configPath;
}

function hydrateConfig(parsed: Partial<AgentDocsConfig> | undefined): AgentDocsConfig {
  if (!parsed) {
    return DEFAULT_CONFIG_FILE as AgentDocsConfig;
  }

  const fallback = DEFAULT_CONFIG as Omit<AgentDocsConfig, 'version'>;
  return {
    version: parsed.version ?? '1.0',
    sourceExtension: parsed.sourceExtension ?? fallback.sourceExtension,
    sourceRoots: parsed.sourceRoots ?? fallback.sourceRoots,
    ignorePaths: parsed.ignorePaths ?? fallback.ignorePaths,
    generated: {
      markdownRoot: parsed.generated?.markdownRoot ?? fallback.generated.markdownRoot,
      allowMdOnlyWhenGenerated:
        parsed.generated?.allowMdOnlyWhenGenerated ?? fallback.generated.allowMdOnlyWhenGenerated,
      indexTitle: parsed.generated?.indexTitle ?? fallback.generated.indexTitle,
      manifestPath: parsed.generated?.manifestPath ?? fallback.generated.manifestPath,
      markdownHeaderPrefix:
        parsed.generated?.markdownHeaderPrefix ?? fallback.generated.markdownHeaderPrefix,
    },
    markdownPolicy: {
      mode: parsed.markdownPolicy?.mode ?? fallback.markdownPolicy.mode,
      allowInGeneratedPaths:
        parsed.markdownPolicy?.allowInGeneratedPaths ?? fallback.markdownPolicy.allowInGeneratedPaths,
    },
    kindDefaults: { ...fallback.kindDefaults, ...parsed.kindDefaults },
    strict: {
      requireGeneratedFreshness:
        parsed.strict?.requireGeneratedFreshness ?? fallback.strict.requireGeneratedFreshness,
      failOnDuplicateCanonicalKey:
        parsed.strict?.failOnDuplicateCanonicalKey ?? fallback.strict.failOnDuplicateCanonicalKey,
      requireConflictSymmetry:
        parsed.strict?.requireConflictSymmetry ?? fallback.strict.requireConflictSymmetry,
      requireCodeTraceability:
        parsed.strict?.requireCodeTraceability ?? fallback.strict.requireCodeTraceability,
      requireCodeSymbols:
        parsed.strict?.requireCodeSymbols ?? fallback.strict.requireCodeSymbols,
    },
    references: {
      enabled: parsed.references?.enabled ?? fallback.references.enabled,
      rules: (parsed.references?.rules ?? fallback.references.rules).map((entry) => ({
        sourceKinds: entry.sourceKinds ?? ['*'],
        field: entry.field,
        allowedTargetKinds: entry.allowedTargetKinds ?? undefined,
        requiredTargetKinds: entry.requiredTargetKinds ?? undefined,
        minCount: entry.minCount ?? undefined,
        maxCount: entry.maxCount ?? undefined,
        requiredTargetMinCount: entry.requiredTargetMinCount ?? undefined,
        severity: entry.severity ?? undefined,
      })),
    },
    terminology: {
      enabled: parsed.terminology?.enabled ?? fallback.terminology.enabled,
      sourceKinds: parsed.terminology?.sourceKinds ?? fallback.terminology.sourceKinds,
      termMetadataKeys: parsed.terminology?.termMetadataKeys ?? fallback.terminology.termMetadataKeys,
      aliasMetadataKey: parsed.terminology?.aliasMetadataKey ?? fallback.terminology.aliasMetadataKey,
      termRegex: parsed.terminology?.termRegex ?? fallback.terminology.termRegex,
      includeTitle: parsed.terminology?.includeTitle ?? fallback.terminology.includeTitle,
      includeSectionTitles:
        parsed.terminology?.includeSectionTitles ?? fallback.terminology.includeSectionTitles,
      includeSectionBodies:
        parsed.terminology?.includeSectionBodies ?? fallback.terminology.includeSectionBodies,
      unknownTermSeverity:
        parsed.terminology?.unknownTermSeverity ?? fallback.terminology.unknownTermSeverity,
    },
    contracts: {
      enabled: parsed.contracts?.enabled ?? fallback.contracts.enabled,
      check: parsed.contracts?.check ? {
        command: parsed.contracts.check.command || '',
        workingDirectory: parsed.contracts.check.workingDirectory ?? '.',
      } : parsed.contracts?.check === null ? null : fallback.contracts.check,
      generate: parsed.contracts?.generate ? {
        command: parsed.contracts.generate.command || '',
        workingDirectory: parsed.contracts.generate.workingDirectory ?? '.',
      } : parsed.contracts?.generate === null ? null : fallback.contracts.generate,
    },
    beads: {
      enabled: parsed.beads?.enabled ?? fallback.beads.enabled,
      file: parsed.beads?.file ?? fallback.beads.file,
      issueIdPattern: parsed.beads?.issueIdPattern ?? fallback.beads.issueIdPattern,
      allowedStatuses:
        parsed.beads?.allowedStatuses && Array.isArray(parsed.beads.allowedStatuses)
          ? parsed.beads.allowedStatuses
          : fallback.beads.allowedStatuses,
      validateBlockedRefs: parsed.beads?.validateBlockedRefs ?? fallback.beads.validateBlockedRefs,
    },
    codeTraceability: {
      requireForKinds:
        parsed.codeTraceability?.requireForKinds ?? fallback.codeTraceability.requireForKinds,
      allowedExtensions:
        parsed.codeTraceability?.allowedExtensions ?? fallback.codeTraceability.allowedExtensions,
      ignorePaths:
        parsed.codeTraceability?.ignorePaths ?? fallback.codeTraceability.ignorePaths,
    },
    reportPath: parsed.reportPath ?? fallback.reportPath,
    hooks: {
      preCommitPath: parsed.hooks?.preCommitPath ?? fallback.hooks.preCommitPath,
      prePushPath: parsed.hooks?.prePushPath ?? fallback.hooks.prePushPath,
      installGitHooks: parsed.hooks?.installGitHooks ?? fallback.hooks.installGitHooks,
    },
  };
}

export function isGeneratedPath(filePath: string, allowedGeneratedPaths: string[]): boolean {
  const normalized = normalize(filePath);
  return allowedGeneratedPaths.some((rawPrefix) => {
    const prefix = normalize(rawPrefix);
    return normalized === prefix || normalized.startsWith(`${prefix}/`);
  });
}

function normalize(p: string): string {
  return p.replace(/^\.\//, '').replace(/\\/g, '/');
}

export function configPath(root: string, relative: string): string {
  return path.join(root, relative.replace(/\\/g, path.sep));
}

export async function fileExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export function rootDirFromCurrent(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}
