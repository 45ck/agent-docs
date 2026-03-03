# @45ck/agent-docs

`agent-docs` is a TypeScript CLI package for managing planning artifacts in a structured
format that is safe for AI agents and CI.

It is intentionally strict about source format:

- Source documents are TOON-based `.toon` files by default (`.a-doc` is supported for legacy docs).
- Markdown is treated as generated output only (by default).
- Validation enforces references, status consistency, conflict symmetry, optional contradiction matrices, and optional code traceability mappings.
- Optional generation creates human-readable markdown and/or compact TOON outputs from the source artifacts.

## Installation

```bash
npm install @45ck/agent-docs
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
- `.agent-docs/templates/*.toon` (starter documents; `.a-doc` starter templates kept for legacy compatibility)
- `.agent-docs/hooks/pre-commit` and `.agent-docs/hooks/pre-push` templates
- `docs/PLAN.toon` starter plan if not already present

## Command reference

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

Project peer dependency note: for repo-wide quality support, use this package with
`@45ck/noslop@1.0.0` when available.

## Config

Create `.agent-docs/config.json` to customize behavior. Missing values are merged with defaults.

Common options:

- `sourceExtension`: file extension for source artifacts (default `.toon`)
- `sourceRoots`: directories searched for source docs
- `markdownPolicy.mode`: `deny` (default), `warn`, `allow`
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
