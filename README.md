# specgraph (`@45ck/agent-docs`)

**specgraph** is a policy-driven spec verification engine and TOON-based artifact management CLI for TypeScript/Node projects. It tracks evidence that code actually implements its specs, enforces evidence-strength thresholds per state, and generates structured planning artifacts safe for AI agents and CI.

Two complementary workflows in one package:

| Workflow | Commands | What it does |
|---|---|---|
| **Spec verification** (v2) | `verify`, `explain`, `find`, `waivers`, `subject` | Policy-driven evidence tracking: scan annotations, Beads issues, cross-refs; evaluate against required evidence thresholds |
| **Artifact management** (v1) | `check`, `generate`, `report`, `init`, `doctor` | TOON-format source documents, validation, markdown generation, contradiction matrices |

Both workflows share a single config at `.specgraph/config.json`.

---

## Installation

```bash
npm install @45ck/agent-docs
```

Or from GitHub until the npm release is available:

```bash
npm install github:45ck/agent-docs
```

The binary is available as both `specgraph` and `agent-docs`.

---

## Quick start — spec verification

```bash
# 1. Add spec docs to docs/
cat > docs/my-feature.md << 'EOF'
---
id: FEAT-001
title: "My Feature"
state: in_progress
kind: functional
required_evidence:
  implementation: E0
---

# My Feature

Describe what this feature does.
EOF

# 2. Annotate source with @spec / @implements
#    /** @spec FEAT-001 @implements MyClass */

# 3. Run verification
specgraph verify

# 4. Drill into results
specgraph explain FEAT-001
specgraph find --relation IMPLEMENTS
```

## Quick start — artifact management

```bash
specgraph init
specgraph install-gates --quality
specgraph check --strict
specgraph generate --format both
```

---

## Spec frontmatter reference

Specs are markdown files in `docs/` (or `specs/` for legacy layouts) with YAML frontmatter.

```yaml
---
id: FEAT-001                    # required — unique identifier
title: "My Feature"             # required
state: draft                    # required — see states below
kind: functional                # optional — functional | DOMAINTREE | ...
owner: team-name                # optional
priority: high                  # optional
description: "One-liner"        # optional — short summary
depends_on:                     # optional — cross-reference list
  - FEAT-002
conflicts_with:                 # optional
  - FEAT-003
required_evidence:              # optional — override policy defaults
  implementation: E1
  verification: E0
subjects:                       # optional — link to tracked subjects
  models:
    - MyModel
  apis:
    - POST /items
  tests:
    - items.test.ts
waivers:                        # optional — inline evidence waivers
  - kind: missing-verification
    target: "*"
    owner: eng-lead
    reason: "No automated tests yet"
    expires: "2026-12-31"
tags:
  - backend
---

Body prose here.
```

### Spec states

| State | Policy | Notes |
|---|---|---|
| `draft` | Always passes | No evidence required |
| `proposed` | Advisory | Warns if no implementation found |
| `in_progress` | E1 implementation required | Verification is advisory |
| `accepted` | E2 impl + E2 verification + E1 models | Full evidence required |
| `done` | E3 impl + E3 verification + E2 models | High-confidence evidence |
| `deprecated` | Always passes | No evidence required |

### Evidence strength levels

| Level | Name | Source |
|---|---|---|
| **E0** | Declarative | `@spec`/`@implements` JSDoc annotation |
| **E1** | Structural | File/symbol reference; Beads closed issue |
| **E2** | Indexed | Stored in specgraph DB; linked artifact |
| **E3** | Automated | Passing test suite evidence |
| **E4** | Runtime | Live system probe or runtime assertion |

The `required_evidence` block in a spec overrides policy defaults for that spec only. Specify any combination of `implementation`, `verification`, `models`, or `apis`.

---

## Verify commands

### `specgraph verify [root]`

Run all providers, evaluate all specs against policy, store results in `.specgraph/specgraph.db`.

```
Options:
  --spec <id>      Evaluate a single spec only
  --changed <f>    Comma-separated list of changed files (incremental scan)
  --json           Output results as JSON
  --no-db          Skip writing to DB (dry run)
```

Output example:
```
  PASS  FEAT-001  [accepted]
  WARN  FEAT-002  [in_progress]
         warn: No verification claims found (advisory)
  FAIL  FEAT-003  [accepted]
         fail: No implementation claims found. Required: E2 (indexed)
  INSUFFICIENT  FEAT-004  [accepted]
         insufficient-evidence: implementation: found E0 but required E2
```

### `specgraph explain [spec-id]`

Show detailed evidence for one spec, or all specs.

```bash
specgraph explain FEAT-001
specgraph explain           # all specs
```

### `specgraph find`

Query the claims graph.

```bash
specgraph find --spec FEAT-001
specgraph find --relation IMPLEMENTS
specgraph find --provider annotation
specgraph find --strength 1          # E1 and above
```

### `specgraph waivers [spec-id]`

List active waivers, optionally filtered to one spec.

### `specgraph subject <subject-id>`

Show all claims targeting a specific subject (e.g. `symbol:annotation:TodoStore`).

---

## Providers

specgraph ships with 7 built-in evidence providers:

| Provider | Evidence | What it scans |
|---|---|---|
| `annotation` | E0 | `@spec`/`@implements`/`@model`/`@test`/`@api` tags in source comments |
| `file` | E1 | File-level spec→subject references via the `subjects` frontmatter field |
| `beads` | E0/E1 | Beads issues with `spec_id` field (`bd export`) |
| `cross-ref` | E0/E1 | `depends_on` / `conflicts_with` chains between specs |
| `terminology` | E0 | `{{term}}` references in DOMAINTREE specs |
| `markdown-policy` | — | Flags `.md` files outside `docs/` and configured allowed paths |
| `freshness` | E2 | Compares `generated_outputs` source hashes against current files |

### Code annotations

Place `@spec` and `@implements` tags in any comment style:

```typescript
/**
 * @spec FEAT-001
 * @implements MyClass
 * @model UserModel
 * @test user.test.ts
 * @api POST /users
 */
export class MyClass { ... }
```

Python, Go, Rust, Java, C#, Ruby, and most other languages are supported via `#`, `//`, `/* */`, and `"""` comment styles.

---

## Configuration

Config file: `.specgraph/config.json` (falls back to `.agent-docs/config.json`).

```json
{
  "version": "1.0",
  "markdownPolicy": {
    "mode": "deny",
    "allowInGeneratedPaths": ["generated"]
  },
  "beads": {
    "enabled": true,
    "file": ".beads/issues.jsonl"
  }
}
```

All keys are optional — missing values merge with built-in defaults.

**Key options:**

| Key | Default | Description |
|---|---|---|
| `markdownPolicy.mode` | `"deny"` | `deny` \| `warn` \| `allow` — stray `.md` policy |
| `markdownPolicy.allowInGeneratedPaths` | `["generated"]` | Paths where `.md` is allowed |
| `beads.enabled` | `false` | Enable Beads issue scanning |
| `beads.file` | `".beads/issues.jsonl"` | JSONL export file |
| `sourceExtension` | `".toon"` | Extension for v1 TOON artifacts |
| `sourceRoots` | `["docs"]` | Directories to scan for TOON artifacts |
| `strict.requireCodeTraceability` | `false` | Require `implements` on TOON artifacts |
| `terminology.enabled` | `false` | Enable `{{term}}` validation |
| `references.enabled` | `false` | Enable cross-document relation rules |

---

## Artifact management commands (v1)

### `specgraph init [root]`

Initialize `.specgraph/config.json`, starter templates, and git hooks.

Creates:
- `.specgraph/config.json`
- `.specgraph/templates/*.toon` starter documents
- `.specgraph/hooks/pre-commit` and `pre-push`

### `specgraph check [root]`

Validate TOON source artifacts:
- Required fields, references, status values, conflict symmetry
- Contradiction matrix, code traceability mappings
- Markdown policy (no free `.md` docs outside generated paths)
- Beads issue validation when enabled

Options: `--strict` — promote warnings to errors.

### `specgraph generate [root]`

Generate markdown/TOON outputs from source artifacts to `generated/`.

Options: `--format <markdown|toon|both>` (default `markdown`), `--strict`

### `specgraph report [root]`

Generate analytical matrix reports from the artifact graph to `generated/reports/`.

Options: `--type <traceability|defect|coverage|impact>`, `--all`, `--output <dir>`

| Report | Description |
|---|---|
| **Traceability Matrix** | Requirement → Design → Code → Test coverage gaps |
| **Defect Matrix** | DEFECT artifacts grouped by severity/status |
| **Coverage Matrix** | Per-requirement: has design? has code? has test? |
| **Impact Matrix** | Reverse dependency graph per artifact |

### `specgraph doctor [root]`

Quick environment and config validation.

### `specgraph install-gates [root]`

Install git hooks for pre-commit/pre-push checks.

Options: `--core-path`, `--force`, `--quality` (enables `@45ck/noslop` when available)

### `specgraph contracts [check|generate] [root]`

Run configured contract validation/generation commands for multi-language boundaries.

```json
{
  "contracts": {
    "enabled": true,
    "check": { "command": "npm run contracts:check" },
    "generate": { "command": "npm run contracts:generate" }
  }
}
```

---

## Artifact kinds (v1 TOON)

| Kind | Purpose |
|---|---|
| `ADR` | Architecture Decision Record |
| `PRD` | Product Requirements Document |
| `SRD` | System Requirements Document |
| `JOURNEY` | User Journey Map |
| `DOMAINTREE` | Domain Model Tree (also used for `{{term}}` vocabulary) |
| `POLICY` | Governance Policy |
| `TESTCASE` | Test Specification |
| `DEFECT` | Bug Report |
| `RISK` | Risk Register Entry |
| `INTERFACE` | API/Boundary Spec |
| `COMPONENT` | Component Design |
| `RUNBOOK` | Operational Playbook |
| `DECISION` | Lightweight Decision Record |

---

## Example project

See [`example/`](./example/) for **Tasko** — a TypeScript CLI todo-list app with full specgraph integration. It has 7 spec docs, annotated source code, and a passing `specgraph verify` run.

```bash
cd example
npm run build
node dist/main.js add "Buy milk" --priority high
node dist/main.js list
node ../dist/index.js verify
```

---

## Beads integration

When [`bd`](https://github.com/steveyegge/beads) is available, issues with a `spec_id` field automatically produce evidence:

```bash
bd create "Implement login" --spec-id FEAT-001
# → IMPLEMENTS E0 (open issue)

# Once closed:
# → IMPLEMENTS E1 (closed feature/task/decision)
# → VERIFIED_BY E1 (closed bug)
```

Install `@beads/bd >= 0.60.0` as an optional peer dependency.

---

## Contributing

```bash
npm install
npm run build
npm test
npm run typecheck
```

Validate the packaged install path:

```bash
npm run pack:smoke
```

---

## Release

- `quality.yml` runs build, tests, and pack smoke on PRs and `master` pushes.
- `release.yml` publishes to npm on `v*` tags when `NPM_TOKEN` is set.
