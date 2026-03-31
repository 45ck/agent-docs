# Tasko — specgraph example project

Tasko is a command-line todo-list app built with TypeScript and SQLite.
It exists to demonstrate **specgraph** — a policy-driven traceability engine
that tracks evidence of spec compliance across your codebase.

## What this example shows

| Concept | Where |
|---|---|
| Spec documents | `docs/*.md` — 7 specs with YAML frontmatter |
| Domain vocabulary | `docs/domain.md` — DOMAINTREE with `{{term}}` refs |
| Cross-references | `depends_on` chains: TASK-001 → TASK-004 |
| Code annotations | `src/store.ts`, `src/cli.ts` — `@spec` / `@implements` tags |
| Evidence levels | E0 (declarative annotation) → E2 (indexed), E4 (runtime) |
| Policy evaluation | `required_evidence` overrides per spec |

## Quick start

### Prerequisites

- Node.js ≥ 22
- Run from the **repo root** (the workspace):

```sh
# from repo root:
npm install          # installs all workspace deps including chalk
```

### Build and run

```sh
cd example
npm run build        # tsc → dist/

# add some todos
node dist/main.js add "Write specgraph docs" --priority high --label docs --due 2026-04-15
node dist/main.js add "Build the CLI" --priority medium --label dev
node dist/main.js add "Write tests" --priority low

# list
node dist/main.js list

# mark done
node dist/main.js done 1

# filter
node dist/main.js list --label dev
node dist/main.js list --priority high

# details
node dist/main.js show 2

# add label
node dist/main.js label 3 testing
```

### Run specgraph verification

```sh
# from example/ directory:
node ../dist/index.js verify
```

Expected output:

```
  PASS  DOMAIN-001  [draft]
  WARN  TASK-005  [in_progress]
         warn: No verification claims found (advisory)
  WARN  TASK-001  [in_progress]
         warn: No verification claims found (advisory)
  PASS  TASK-006  [draft]
  WARN  TASK-002  [in_progress]
         warn: No verification claims found (advisory)
  WARN  TASK-004  [in_progress]
         warn: No verification claims found (advisory)
  WARN  TASK-003  [in_progress]
         warn: No verification claims found (advisory)

Specs: 7  Claims: 13  Duration: ~140ms
Pass: 2  Warn: 5  Fail: 0  Waived: 0  Insufficient: 0

Verification passed with warnings.
```

## Reading the output

| Status | Meaning |
|---|---|
| **PASS** | All obligations met at required strength |
| **WARN** | Implementation found, but advisory evidence (e.g. tests) is missing |
| **INSUFFICIENT** | Evidence found but below the required strength threshold |
| **FAIL** | Required evidence not found at all |
| **WAIVED** | Missing evidence is waived with an expiry + owner |

## Spec overview

| Spec | State | Description |
|---|---|---|
| DOMAIN-001 | draft | Domain vocabulary — TodoItem, Label, Priority… |
| TASK-001 | in_progress | Core CRUD for TodoItem entities |
| TASK-002 | in_progress | Label tagging system |
| TASK-003 | in_progress | Priority ranking (low/medium/high) |
| TASK-004 | in_progress | SQLite persistence layer |
| TASK-005 | in_progress | CLI commands (`add`, `list`, `done`, `label`, `delete`, `show`) |
| TASK-006 | draft | Filter and search (not yet implemented) |

## How evidence is collected

specgraph runs providers in sequence:

1. **AnnotationProvider** — scans `@spec`/`@implements` tags in source comments (E0)
2. **CrossRefProvider** — validates `depends_on` chains between specs
3. **TerminologyProvider** — checks `{{term}}` references against DOMAINTREE
4. **MarkdownPolicyProvider** — flags stray `.md` files outside `docs/`
5. **FreshnessProvider** — checks generated outputs are up-to-date

Each `@spec TASK-001 @implements TodoStore` tag in source creates an E0
(declarative) IMPLEMENTS claim. As you add integration tests (`@test`), Beads
issues, or runtime probes, evidence strength rises to E1–E4 and the WARN
statuses become PASS.

## Data storage

Tasko stores todos in `~/.tasko/tasko.db` (SQLite).
