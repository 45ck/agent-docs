/**
 * specgraph — Unified type definitions.
 *
 * This file is the canonical type system for the entire specgraph tool.
 * It merges the v2 policy-driven traceability types with the v1 artifact/config types.
 *
 * All modules should import from here (or from the re-export shim at src/v2/types.ts
 * which points here for backwards compatibility during migration).
 */

// ══════════════════════════════════════════════════════════════════
// V2 TRACEABILITY ENGINE TYPES
// ══════════════════════════════════════════════════════════════════

// ─── Evidence Strength ──────────────────────────────────────────

/**
 * Evidence strength grades.
 *
 * E0 = Declarative only (human/agent assertion, minimally checked)
 * E1 = Structural (file exists, comment attached to nearby declaration)
 * E2 = Indexed (ctags match, tree-sitter declaration, framework route discovery)
 * E3 = Semantic (compiler API resolution, precise symbol identity)
 * E4 = Runtime/verification (named test run, coverage artifact, integration trace)
 */
export enum EvidenceStrength {
  E0 = 0,
  E1 = 1,
  E2 = 2,
  E3 = 3,
  E4 = 4,
}

export function parseEvidenceStrength(s: string): EvidenceStrength {
  const map: Record<string, EvidenceStrength> = {
    E0: EvidenceStrength.E0,
    E1: EvidenceStrength.E1,
    E2: EvidenceStrength.E2,
    E3: EvidenceStrength.E3,
    E4: EvidenceStrength.E4,
  };
  const result = map[s.toUpperCase()];
  if (result === undefined) {
    throw new Error(`Invalid evidence strength: "${s}". Expected E0-E4.`);
  }
  return result;
}

export function evidenceStrengthLabel(s: EvidenceStrength): string {
  const labels: Record<EvidenceStrength, string> = {
    [EvidenceStrength.E0]: 'E0 (declarative)',
    [EvidenceStrength.E1]: 'E1 (structural)',
    [EvidenceStrength.E2]: 'E2 (indexed)',
    [EvidenceStrength.E3]: 'E3 (semantic)',
    [EvidenceStrength.E4]: 'E4 (runtime)',
  };
  return labels[s];
}

// ─── Subject Identity ───────────────────────────────────────────

/**
 * Subject ID format: `kind:provider:repo-relative-identity`
 *
 * Examples:
 *   symbol:ts:src/auth/login.ts#login
 *   file:generic:infra/backup.sh
 *   test:vitest:tests/auth/login.spec.ts#should_login
 *   route:nextjs:POST:/api/login
 *   model:domain:User
 *   issue:beads:bd-a1b2
 */
export type SubjectId = string & { readonly __brand: unique symbol };

export interface ParsedSubjectId {
  kind: string;
  provider: string;
  identity: string;
}

export function makeSubjectId(kind: string, provider: string, identity: string): SubjectId {
  if (kind.includes(':') || provider.includes(':')) {
    throw new Error(`SubjectId kind/provider must not contain colons: "${kind}:${provider}"`);
  }
  return `${kind}:${provider}:${identity}` as SubjectId;
}

export function parseSubjectId(id: string): ParsedSubjectId {
  const firstColon = id.indexOf(':');
  const secondColon = id.indexOf(':', firstColon + 1);
  if (firstColon === -1 || secondColon === -1) {
    throw new Error(`Malformed SubjectId: "${id}"`);
  }
  return {
    kind: id.slice(0, firstColon),
    provider: id.slice(firstColon + 1, secondColon),
    identity: id.slice(secondColon + 1),
  };
}

// ─── Relations ──────────────────────────────────────────────────

/** Frozen relation vocabulary for claims. */
export type Relation =
  | 'IMPLEMENTS'
  | 'VERIFIED_BY'
  | 'USES_MODEL'
  | 'EXPOSES_API'
  | 'DEPENDS_ON'
  | 'DECLARED_IN'
  | 'WAIVED_BY'
  | 'BLOCKED_BY'
  | 'SATISFIES'
  | 'REFERENCES'
  | 'SUPERSEDES'
  | 'CONFLICTS_WITH';

// ─── Spec ───────────────────────────────────────────────────────

export type SpecState =
  | 'draft'
  | 'proposed'
  | 'in_progress'
  | 'accepted'
  | 'done'
  | 'deprecated';

export type SpecKind = 'functional' | 'nonfunctional' | 'security' | 'decision' | 'operational' | 'task' | string;

export interface Spec {
  id: string;
  title: string;
  state: SpecState;
  kind: SpecKind;
  owner?: string;
  priority?: string;
  description?: string;
  requiredEvidence?: RequiredEvidence;
  subjects?: SpecSubjects;
  dependsOn?: string[];
  conflictsWith?: string[];
  tags?: string[];
  waivers?: WaiverDef[];
  metadata?: Record<string, unknown>;
  sourcePath: string;
  sourceHash: string;
}

export interface RequiredEvidence {
  implementation?: EvidenceStrength;
  verification?: EvidenceStrength;
  models?: EvidenceStrength;
  apis?: EvidenceStrength;
}

export interface SpecSubjects {
  models?: string[];
  apis?: string[];
  tests?: string[];
}

// ─── Subject ────────────────────────────────────────────────────

export interface Subject {
  id: SubjectId;
  kind: string;
  provider: string;
  identity: string;
  file?: string;
  line?: number;
  metadata?: Record<string, unknown>;
}

// ─── Claim ──────────────────────────────────────────────────────

export interface Claim {
  id: string;
  src: string;
  relation: Relation;
  dst: string;
  provider: string;
  strength: EvidenceStrength;
  provenance: ClaimProvenance;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface ClaimProvenance {
  file?: string;
  line?: number;
  column?: number;
  detail?: string;
}

// ─── Evidence ───────────────────────────────────────────────────

export interface Evidence {
  id: string;
  claimId: string;
  kind: string;
  detail: string;
  raw?: Record<string, unknown>;
  capturedAt: string;
}

// ─── Waiver ─────────────────────────────────────────────────────

export interface WaiverDef {
  kind: string;
  target: string;
  owner: string;
  reason: string;
  issueRef?: string;
  expires: string;
}

export interface Waiver {
  id: string;
  specId: string;
  kind: string;
  target: string;
  owner: string;
  reason: string;
  issueRef?: string;
  expires: string;
  createdAt: string;
  revokedAt?: string;
}

// ─── Policy ─────────────────────────────────────────────────────

export type ObligationKind = 'implementation' | 'verification' | 'models' | 'apis';

export interface PolicyRule {
  require?: Partial<Record<ObligationKind, EvidenceStrength>>;
  warnMissing?: ObligationKind[];
  allowWaiverFor?: ObligationKind[];
}

export interface PolicyConfig {
  states: Record<SpecState, PolicyRule>;
  kinds?: Record<string, Partial<PolicyRule>>;
}

export type PolicyResultStatus = 'pass' | 'warn' | 'fail' | 'waived' | 'insufficient-evidence';

export interface PolicyResult {
  specId: string;
  obligation: ObligationKind;
  requiredStrength: EvidenceStrength;
  bestFoundStrength: EvidenceStrength | null;
  status: PolicyResultStatus;
  details: string;
  supportingClaims: string[];
  waiverId?: string;
}

export interface SpecVerificationResult {
  specId: string;
  state: SpecState;
  overallResult: PolicyResultStatus;
  obligations: PolicyResult[];
  waivers: Waiver[];
}

// ─── Provider ───────────────────────────────────────────────────

export interface ScanContext {
  root: string;
  changedFiles?: string[];
  runId: string;
}

export interface ScanResult {
  subjects: Subject[];
  claims: Claim[];
  evidence: Evidence[];
}

export interface Provider {
  readonly name: string;
  readonly description: string;
  supports(): string[];
  strengthFor(relation: Relation): EvidenceStrength;
  scan(ctx: ScanContext): Promise<ScanResult>;
  validate?(claim: Claim, ctx: ScanContext): Promise<Evidence[]>;
}

// ─── Provider Run ───────────────────────────────────────────────

export type RunStatus = 'running' | 'passed' | 'failed' | 'error';
export type RunTrigger = 'cli:verify' | 'cli:verify:changed' | 'cli:verify:spec' | 'hook:pre-commit' | 'hook:pre-push' | 'ci';

export interface ProviderRun {
  runId: string;
  startedAt: string;
  finishedAt?: string;
  trigger: RunTrigger;
  gitSha?: string;
  configHash?: string;
  status: RunStatus;
  summary?: RunSummary;
}

export interface RunSummary {
  specsScanned: number;
  claimsEmitted: number;
  passed: number;
  warned: number;
  failed: number;
  waived: number;
  insufficientEvidence: number;
  durationMs: number;
}

// ─── Default Policy ─────────────────────────────────────────────

export const DEFAULT_POLICY: PolicyConfig = {
  states: {
    draft: {
      require: {},
      warnMissing: [],
      allowWaiverFor: ['implementation', 'verification', 'models', 'apis'],
    },
    proposed: {
      require: {},
      warnMissing: ['implementation'],
      allowWaiverFor: ['implementation', 'verification', 'models', 'apis'],
    },
    in_progress: {
      require: { implementation: EvidenceStrength.E0 },
      warnMissing: ['verification'],
      allowWaiverFor: ['verification', 'models', 'apis'],
    },
    accepted: {
      require: {
        implementation: EvidenceStrength.E2,
        verification: EvidenceStrength.E1,
        models: EvidenceStrength.E1,
      },
      warnMissing: [],
      allowWaiverFor: ['verification', 'models'],
    },
    done: {
      require: {
        implementation: EvidenceStrength.E2,
        verification: EvidenceStrength.E2,
        models: EvidenceStrength.E1,
      },
      warnMissing: [],
      allowWaiverFor: [],
    },
    deprecated: {
      require: {},
      warnMissing: [],
      allowWaiverFor: [],
    },
  },
};

// ══════════════════════════════════════════════════════════════════
// V1 ARTIFACT / CONFIG TYPES
// ══════════════════════════════════════════════════════════════════

export type ArtifactKind =
  | 'ADR'
  | 'PRD'
  | 'SRD'
  | 'JOURNEY'
  | 'DOMAINTREE'
  | 'POLICY'
  | 'TESTCASE'
  | 'DEFECT'
  | 'RISK'
  | 'INTERFACE'
  | 'COMPONENT'
  | 'RUNBOOK'
  | 'DECISION'
  | 'OTHER';

export type ArtifactStatus =
  | 'draft'
  | 'proposed'
  | 'accepted'
  | 'superseded'
  | 'rejected'
  | 'deprecated'
  | 'deferred'
  | 'open'
  | 'blocked'
  | 'passed'
  | 'failed'
  | 'triaged'
  | 'in-progress'
  | 'resolved'
  | 'verified'
  | 'closed'
  | 'mitigated';

export type ValidationSeverity = 'info' | 'warning' | 'error';

export type ArtifactReferenceField = 'dependsOn' | 'supersedes' | 'supersededBy' | 'conflictsWith' | 'references';

export interface ArtifactReferenceRule {
  sourceKinds: string[];
  field: ArtifactReferenceField;
  allowedTargetKinds?: string[];
  requiredTargetKinds?: string[];
  minCount?: number;
  maxCount?: number;
  requiredTargetMinCount?: number;
  severity?: ValidationSeverity;
}

export interface ReferencesValidationConfig {
  enabled: boolean;
  rules: ArtifactReferenceRule[];
}

export interface TerminologyValidationConfig {
  enabled: boolean;
  sourceKinds: string[];
  termMetadataKeys: string[];
  aliasMetadataKey: string;
  termRegex: string;
  includeTitle: boolean;
  includeSectionTitles: boolean;
  includeSectionBodies: boolean;
  unknownTermSeverity: ValidationSeverity;
}

export interface BeadsValidationConfig {
  enabled: boolean;
  file: string;
  issueIdPattern: string;
  allowedStatuses: string[];
  validateBlockedRefs: boolean;
}

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

export interface ContractCommandConfig {
  command: string;
  workingDirectory?: string;
}

export interface ContractChecksConfig {
  enabled: boolean;
  check: ContractCommandConfig | null;
  generate: ContractCommandConfig | null;
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
  references?: string[];
  specRefs?: unknown;
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
  references: string[];
  specRefs: string[];
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
  references: ReferencesValidationConfig;
  terminology: TerminologyValidationConfig;
  contracts: ContractChecksConfig;
  beads: BeadsValidationConfig;
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

export interface ContractPlanOptions {
  root: string;
  strict: boolean;
}

export interface ContractResult {
  exitCode: number;
  ran: boolean;
  command: string | null;
}

export type ReportKind = 'traceability' | 'defect' | 'coverage' | 'impact';

export interface ReportPlanOptions {
  root: string;
  type?: ReportKind;
  all?: boolean;
  output?: string;
}
