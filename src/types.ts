export type ArtifactKind =
  | 'ADR'
  | 'PRD'
  | 'SRD'
  | 'JOURNEY'
  | 'DOMAINTREE'
  | 'POLICY'
  | 'OTHER';

export type ArtifactStatus =
  | 'draft'
  | 'proposed'
  | 'accepted'
  | 'superseded'
  | 'rejected'
  | 'deprecated'
  | 'deferred'
  | 'open';

export type ValidationSeverity = 'info' | 'warning' | 'error';

export interface ValidationIssue {
  code: string;
  severity: ValidationSeverity;
  message: string;
  path?: string;
}

export interface ArtifactSection {
  title: string;
  body: string;
}

export interface CodeTraceabilityReference {
  path: string;
  symbols?: string[];
}

export interface ArtifactInput {
  id: string;
  kind: ArtifactKind | string;
  title: string;
  status: ArtifactStatus;
  scope?: string;
  owner?: string;
  date?: string;
  implements?: string[] | { path: string; symbols?: string[] }[];
  traceability?: {
    implements?: string[] | { path: string; symbols?: string[] }[];
  };
  dependsOn?: string[];
  supersedes?: string[];
  supersededBy?: string[];
  conflictsWith?: string[];
  canonicalKey?: string;
  tags?: string[];
  sections?: ArtifactSection[];
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ParsedArtifact {
  path: string;
  id: string;
  kind: string;
  title: string;
  status: string;
  scope: string;
  owner?: string;
  date?: string;
  implements: CodeTraceabilityReference[];
  dependsOn: string[];
  supersedes: string[];
  supersededBy: string[];
  conflictsWith: string[];
  canonicalKey?: string;
  tags: string[];
  sections: ArtifactSection[];
  raw: ArtifactInput;
  sourceHash?: string;
}

export interface GateReport {
  generatedAt: string;
  sourceRoot: string;
  issues: ValidationIssue[];
  totals: {
    errors: number;
    warnings: number;
    info: number;
    filesChecked: number;
    docsChecked: number;
    documentsChecked: number;
  };
}

export interface GeneratedManifestEntry {
  source: string;
  id: string;
  kind: string;
  sourceHash: string;
  generatedPath: string;
  generatedAt: string;
}

export interface GeneratedManifest {
  version: string;
  generatedAt: string;
  format: 'markdown' | 'toon' | 'both';
  entries: GeneratedManifestEntry[];
}

export interface ContradictionEntry {
  id: string;
  relatedArtifacts: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'mitigated' | 'resolved';
  rationale?: string;
  mitigations?: string[];
}

export interface ContradictionMatrix {
  generatedAt: string;
  version: string;
  entries: ContradictionEntry[];
}

export interface AgentDocsConfig {
  version: string;
  sourceExtension: string;
  sourceRoots: string[];
  ignorePaths: string[];
  generated: {
    markdownRoot: string;
    allowMdOnlyWhenGenerated: boolean;
    indexTitle: string;
    manifestPath: string;
    markdownHeaderPrefix: string;
  };
  markdownPolicy: {
    mode: 'deny' | 'warn' | 'allow';
    allowInGeneratedPaths: string[];
  };
  kindDefaults: {
    [kind: string]: {
      requiredStatus: ArtifactStatus[];
    }
  };
  strict: {
    requireGeneratedFreshness: boolean;
    failOnDuplicateCanonicalKey: boolean;
    requireConflictSymmetry: boolean;
    requireCodeTraceability: boolean;
    requireCodeSymbols: boolean;
  };
  codeTraceability: {
    requireForKinds: string[];
    allowedExtensions: string[];
    ignorePaths: string[];
  };
  reportPath: string;
  hooks: {
    preCommitPath: string;
    prePushPath: string;
    installGitHooks: boolean;
  };
}

export interface GenerationOptions {
  format: 'markdown' | 'toon' | 'both';
  force: boolean;
}

export interface CheckPlanOptions {
  root: string;
  strict: boolean;
  configPath?: string;
  failOnWarnings?: boolean;
}

export interface GeneratePlanOptions {
  root: string;
  strict: boolean;
  configPath?: string;
  format: 'markdown' | 'toon' | 'both';
}

export interface DoctorPlanOptions {
  root: string;
  configPath?: string;
}

export interface InstallHooksOptions {
  root: string;
  force: boolean;
  useCoreHookPath: boolean;
}

export interface CheckOptions {
  root: string;
  strict: boolean;
  configPath: string;
}

export interface GenerateOptions {
  root: string;
  strict: boolean;
  configPath: string;
  format: 'markdown' | 'toon';
}
