# @45ck/agent-docs

`agent-docs` is a TypeScript CLI package for managing planning artifacts in a structured
format that is safe for AI agents and CI.

It is intentionally strict about source format:

- Source documents are JSON-based `.a-doc` files.
- Markdown is treated as generated output only (by default).
- Validation enforces references, status consistency, conflict symmetry, and optional contradiction matrices.
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
- `.agent-docs/templates/*.a-doc` (starter documents)
- `.agent-docs/hooks/pre-commit` and `.agent-docs/hooks/pre-push` templates
- `docs/PLAN.a-doc` starter plan if not already present

## Command reference

### `agent-docs check [root]`

- Reads config and validates:
  - `.a-doc` structure and required fields
  - references and IDs
  - status values and canonical keys
  - conflict symmetry
  - configured contradiction matrix (`.agent-docs/contradictions.json`)
  - markdown policy (no free markdown docs outside generated paths by default)
  - generated manifest freshness (optional via config strictness)
- Writes JSON report to `.agent-docs/reports/check-report.json`

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

Installs git hooks that run `agent-docs check --strict` and optionally sets `core.hooksPath`
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

- `sourceExtension`: file extension for source artifacts (default `.a-doc`)
- `sourceRoots`: directories searched for source docs
- `markdownPolicy.mode`: `deny` (default), `warn`, `allow`
- `generated.markdownRoot`: output folder for generated markdown (`generated`)
- `strict.requireGeneratedFreshness`: require manifest and source hash parity
- `kindDefaults`: per-kind valid status lists and required conventions

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
