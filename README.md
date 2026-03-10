# @45ck/agent-docs

`agent-docs` is a TypeScript CLI package for managing planning artifacts in a structured
format that is safe for AI agents and CI.

It is intentionally strict about source format:

- Source documents are TOON-based `.toon` files by default.
- Markdown is treated as generated output only (by default).
- Validation enforces references, status consistency, conflict symmetry, optional contradiction matrices, and optional code traceability mappings.
- Optional Beads check validates `.beads/issues.jsonl` records when enabled (IDs, status, and blocker links).
- Optional generation creates human-readable markdown and/or compact TOON outputs from the source artifacts.

## Installation

When a public npm release is available:

```bash
npm install @45ck/agent-docs
```

Until the npm package is published, install directly from GitHub or from a tarball built with `npm pack`:

```bash
npm install github:45ck/agent-docs
```

```bash
npm pack
npm install ./45ck-agent-docs-<version>.tgz
```

## Quick start

```bash
cd your-project
agent-docs init
agent-docs install-gates --quality
agent-docs check --strict
agent-docs generate --format both
```

## What `init` creates

`agent-docs init` creates/refreshes:

- `.agent-docs/config.json`
- `.agent-docs/templates/*.{toon,a-doc}` (starter documents)
- `.agent-docs/hooks/pre-commit` and `.agent-docs/hooks/pre-push` templates
- `docs/PLAN.toon` starter plan if not already present
- `docs:check` and `docs:generate` scripts in `package.json` when present

## Command reference

### Markdown policy

`markdownPolicy.mode` controls how markdown outside allowed generated paths is handled:

- `deny` (default): fail checks.
- `warn`: report warnings only.
- `allow`: ignore markdown policy checks.

### `agent-docs contracts [check|generate] [root]`

Contract-aware projects often need shared artifacts for multiple language stacks. Configure commands in `.agent-docs/config.json`:

- `contracts.enabled`: enable contract-stage command execution in hooks
- `contracts.check.command`: command that validates generated contracts
- `contracts.generate.command`: command that regenerates contracts
- `contracts.check.workingDirectory` / `contracts.generate.workingDirectory`: optional execution roots

Examples:

- `agent-docs contracts check .` runs your contract validation command
- `agent-docs contracts generate .` runs your contract generation command
- `--strict` fails hard when no command is configured

Example multi-language config:

```json
{
  "contracts": {
    "enabled": true,
    "check": {
      "command": "npm run contracts:check && dotnet test Contracts.Tests --nologo && cargo check -p contracts-lib"
    },
    "generate": {
      "command": "npm run contracts:generate"
    }
  }
}
```

## Spec references

Use `specRefs` in an artifact for reverse links to issue trackers or planning systems:

```toonsnippet
specRefs[0]: AD-101
specRefs[1]: BEAD-9001
```

`specRefs` is optional and can be any identifier you use for external issue systems.

Copy `.agent-docs/templates/vscode-settings.json` to `.vscode/settings.json` for minimal TOON editor hints.

Suggested package scripts for the same project:

```json
{
  "scripts": {
    "contracts:check": "buf check breaking --against .agent-docs/contracts/snapshots && npm run lint:contracts",
    "contracts:generate": "npm run proto:gen && dotnet build Contracts.Api /t:GenerateContractClients && cargo run -p contracts-codegen"
  }
}
```

### `agent-docs check [root]`

- Reads config and validates:
  - source artifact structure and required fields
  - references and IDs
  - status values and canonical keys
  - conflict symmetry
  - configured contradiction matrix (`.agent-docs/contradictions.json` or `.agent-docs/contradictions.toon`)
  - code-to-repo mappings (for `implements`) when enabled in config
  - markdown policy (no free markdown docs outside generated paths by default)
  - generated manifest freshness (optional via config strictness)
- Writes JSON report to `.agent-docs/reports/check-report.json`
- Validates optional cross-document relation policies from `.agent-docs/config.json`
  (example: enforce `ADR` documents to reference at least one `PRD`/`SRD` via `dependsOn`,
  ensure referenced artifact kinds are allowed, and enforce min/max counts).
- Validates terminology consistency from `DOMAINTREE` metadata terms (configurable in
  `terminology` config) when placeholder terms are used in titles/sections as `{{Term}}`.
- Validates Beads issue records in `.beads/issues.jsonl` when `beads.enabled` is true.
  Issues are validated for JSONL parseability, ID format, status, and `blockedBy` reference integrity.

Options:

- `--strict`  
  Promote warnings to errors and fail on any issue.

### `agent-docs generate [root]`

- Validate artifacts
- Generate docs in:
  - markdown: `./generated/<kind>/<slug>.md` and `./generated/index.md`
  - toon: `./generated/<kind>/<slug>.toon` and `./generated/index.toon`
- Writes `.agent-docs/manifest.json`

Options:

- `--format <markdown|toon|both>` (default `markdown`)
- `--strict` fail on warnings before generating

### `agent-docs init [root]`

Initialize project structure and template artifacts.

### `agent-docs report [root]`

Generate analytical matrix reports from the artifact graph. Reports are written as markdown to `generated/reports/` by default.

Options:

- `--type <type>` generate a single report type: `traceability`, `defect`, `coverage`, or `impact`
- `--all` generate all 4 report types (default when no `--type` is specified)
- `--output <dir>` custom output directory

Report types:

- **Traceability Matrix** — Requirement (SRD/PRD) to Design (ADR/COMPONENT) to Code to Test. Shows coverage gaps.
- **Defect Matrix** — DEFECT artifacts grouped by severity/status/component with summary tables.
- **Coverage Matrix** — Per-requirement breakdown: has design? has code? has test? With percentage summaries.
- **Impact Matrix** — Reverse dependency graph showing direct and transitive dependents per artifact.

### `agent-docs doctor [root]`

Quick environment validation for required folders and config.

### `agent-docs install-gates [root]`

Installs git hooks that run `agent-docs contracts check --strict` (when configured), optional
`@45ck/noslop` checks, and `agent-docs check --strict`, and optionally sets `core.hooksPath`
to `.agent-docs/hooks`.

When `--quality` is supplied, hooks also attempt to run `noslop check` (fast on pre-commit, slow on pre-push) before `agent-docs check`:
- if `node_modules/.bin/noslop` exists, it is used
- if `noslop` is on PATH, it is used
- if `RUN_NOSLOP_CHECKS=1` and npx is available, `@45ck/noslop@1.0.0` is used

If noslop is not available, hooks still execute `agent-docs` only and installation continues.

Options:

- `--core-path` configure `git config core.hooksPath .agent-docs/hooks`
- `--force` overwrite existing local hook files in `.agent-docs/hooks`
- `--quality` run optional noslop checks in installed hooks

Copy `templates/agent-docs-ci.yml` to `.github/workflows/agent-docs.yml` to get a ready `docs:check` CI job.

Project peer dependency note: for repo-wide quality support, use this package with
`@45ck/noslop@1.0.0` when available.

## Artifact Kinds

agent-docs ships with 14 built-in artifact kinds (+ OTHER):

| Kind | Purpose | Template Sections |
|------|---------|-------------------|
| ADR | Architecture Decision Record | Context, Decision, Alternatives, Consequences |
| PRD | Product Requirements Document | Problem Statement, Success Criteria, Scope |
| SRD | System Requirements Document | Functional Requirements, Non-Functional Requirements |
| JOURNEY | User Journey Map | Actors, Steps, Exceptions |
| DOMAINTREE | Domain Model Tree | Root Domain, Sub-Domains |
| POLICY | Governance Policy | Policy Statement, Compliance |
| TESTCASE | Test Specification | Preconditions, Steps, Expected Result, Postconditions |
| DEFECT | Bug Report | Description, Steps to Reproduce, Expected vs Actual, Root Cause, Resolution |
| RISK | Risk Register Entry | Description, Triggers, Mitigations, Contingency |
| INTERFACE | API/Boundary Spec | Overview, Endpoints, Request/Response, Authentication, Versioning |
| COMPONENT | Component Design | Responsibilities, Dependencies, Boundaries, Deployment |
| RUNBOOK | Operational Playbook | Prerequisites, Steps, Rollback, Verification |
| DECISION | Lightweight Decision Record | Context, Decision, Rationale |

### Kind-Specific Metadata

Some kinds require or accept metadata fields validated at check time:

- **TESTCASE**: `testType` (required: unit/integration/e2e/manual/performance), `verifies` (required: artifact ID array)
- **DEFECT**: `severity` (required: critical/high/medium/low), `priority` (optional: P0-P4), `affectedArtifacts` (optional: ID array)
- **RISK**: `probability` (required: 1-5), `impact` (required: 1-5), `mitigations` (optional: string array)
- **INTERFACE**: `protocol` (optional: REST/gRPC/GraphQL/event)
- **COMPONENT**: `parentComponent` (optional: artifact ID)

Metadata is placed in the `metadata` object of each artifact.

## Config

Create `.agent-docs/config.json` to customize behavior. Missing values are merged with defaults.

Common options:

- `sourceExtension`: file extension for source artifacts (default `.toon`)
- `sourceRoots`: directories searched for source docs
- `markdownPolicy.mode`: `deny` (default), `warn`, `allow`
- `ignorePaths`: directories to skip during scans. Add `.beads`, `.claude`, `.githooks`, `.husky`, `.vscode`, `.idea`, `reports` to reduce noise from tooling folders.
- `codeTraceability.allowedExtensions`: if `['*']` then all file extensions are accepted for code mappings (`*` is useful for Java, C#, Rust, PHP, Kotlin, etc.)
- `generated.markdownRoot`: output folder for generated markdown (`generated`)
- `strict.requireGeneratedFreshness`: require manifest and source hash parity
- `strict.requireCodeTraceability`: require docs to declare `implements` mappings
- `strict.requireCodeSymbols`: require symbol hints on `implements` references
- `codeTraceability.requireForKinds`: document kinds that require mappings when strict traceability is on
- `codeTraceability.ignorePaths`: paths to ignore when validating code references
- `kindDefaults`: per-kind valid status lists and required conventions
- `references`: optional cross-document relation rules and target kind constraints
- `terminology`: optional terminology validation using source-kind metadata and `{{term}}` usage checks
- `beads`: optional `.beads/issues.jsonl` checks (`enabled`, `file`, `issueIdPattern`, `allowedStatuses`, `validateBlockedRefs`)

Example cross-document policy:

```json
{
  "references": {
    "enabled": true,
    "rules": [
      {
        "sourceKinds": ["ADR"],
        "field": "dependsOn",
        "requiredTargetKinds": ["PRD", "SRD"],
        "requiredTargetMinCount": 1
      }
    ]
  },
  "terminology": {
    "enabled": true,
    "sourceKinds": ["DOMAINTREE"],
    "termMetadataKeys": ["terms"],
    "aliasMetadataKey": "termAliases",
    "termRegex": "\\{\\{\\s*([^}]+?)\\s*\\}\\}",
    "includeSectionBodies": true,
    "unknownTermSeverity": "warning"
  },
  "beads": {
    "enabled": false,
    "file": ".beads/issues.jsonl",
    "issueIdPattern": "^bead-\\d{4}$",
    "allowedStatuses": ["open", "closed"],
    "validateBlockedRefs": true
  }
}
```

## Contributing

If you plan to extend this repo, run:

```bash
npm install
npm run build
npm run check
```

Then generate sample outputs:

```bash
npm run generate -- --format both
```

To validate the packaged consumer path before publishing:

```bash
npm run pack:smoke
```

## Release

- `quality.yml` runs build, tests, and the packed-install smoke on PRs and pushes to `master`.
- `release.yml` repeats the same checks and publishes to npm on `v*` tags when `NPM_TOKEN` is configured.
