# Changelog

## 0.5.1

### skill-harness integration

- Add `plugins/specgraph-skills/` — a [skill-harness](https://github.com/45ck/skill-harness) plugin with five workflow skills: `spec-writer`, `evidence-gap-review`, `waiver-writer`, `verify-interpreter`, `annotation-writer`
- Each skill is a `SKILL.md` document with YAML frontmatter and decision-table guidance for agents
- Plugin metadata in `.codex-plugin/plugin.json` for skill-harness compatibility
- README: document `skill-harness setup-project` bootstrap path and manual skill installation
- Include `plugins/` in npm published files

## 0.5.0

Full Phase 2 consolidation — unified specgraph system.

### New: specgraph verification engine

- Promote v2 verify engine to top-level: `specgraph verify`, `explain`, `find`, `waivers`, `subject` commands
- Policy-driven evidence evaluation: E0 (declarative) → E4 (runtime) evidence strength thresholds per spec state
- `required_evidence` frontmatter block overrides per-spec policy defaults
- Inline `waivers` in spec frontmatter with expiry and owner
- Results stored in SQLite (`.specgraph/specgraph.db`) with run history

### New: providers

- **CrossRefProvider** — validates `depends_on` / `conflicts_with` spec chains; E1 when target exists, E0 + broken_ref evidence when missing
- **FreshnessProvider** — compares `generated_outputs` source hashes to detect stale artifacts
- **MarkdownPolicyProvider** — flags `.md` files outside `docs/` and configured allowed paths
- **TerminologyProvider** — validates `{{term}}` references against DOMAINTREE spec vocabulary

### Schema v2

- SQLite schema bumped to v2 with automatic migration from v1
- New tables: `generated_outputs` (replaces manifest.json), `gate_reports` (replaces check-report.json), `contradictions`

### Architecture

- Unified type system: canonical `src/types.ts` — `Spec` type extended with `conflictsWith` and `metadata` fields
- All `src/v2/*.ts` are re-export shims pointing to `src/`; no external API change
- Config paths migrated from `.agent-docs/` to `.specgraph/` with backward-compat fallback
- `spec-parser.ts` now parses `conflicts_with` and populates `metadata` bag from non-standard frontmatter fields
- Example project: Tasko CLI todo-list app in `example/` showcasing end-to-end specgraph verification
- 150 tests passing

## 0.4.0

Phase 1 — Beads integration, specgraph rename, consolidated source layout.

- Rename CLI binary from `agent-docs` to `specgraph` (both aliases preserved)
- Add `BeadsProvider`: maps Beads issues with `spec_id` field to IMPLEMENTS/VERIFIED_BY claims
  - Closed feature/task/decision issues → IMPLEMENTS E1
  - Closed bug issues → VERIFIED_BY E1
  - Open/in_progress/blocked issues → IMPLEMENTS E0
- Use `docs/` as primary spec source directory (fallback to `specs/` for legacy layouts)
- Config reads `.specgraph/config.json` first, falls back to `.agent-docs/config.json`
- `specgraph init` writes to `.specgraph/` (templates, hooks, config)
- Add `v2` verify engine: `verify`, `explain`, `find`, `waivers`, `subject` sub-commands
- Add SQLite store (`better-sqlite3`) for claims, evidence, waivers, runs, policy results
- Add AnnotationProvider (E0 from `@spec`/`@implements` source comments) and FileProvider
- Add configurable contract-stage commands (`contracts.check`/`contracts.generate`) and
  `agent-docs contracts [check|generate]` for multi-language boundary workflows
- Add all-language code traceability support via `codeTraceability.allowedExtensions: ["*"]`
- Fix hook execution by passing repository root as positional argument

## 0.3.1

- Change default source documents to `.toon`.
- Add `.toon` support for source document parsing with fallback for `.a-doc`.
- Keep compatibility for legacy `.a-doc` templates and `contradictions.json`.
- Add template `.toon` variants for main starter artifact types.
- Update `agent-docs init` to create `.toon` starter plans by default.

## 0.3.0

- Bump package to a reusable release version and align CLI versioning.
- Add optional `install-gates --quality` to run `noslop` checks when available.
- Generate quality-gate-friendly hooks with optional `RUN_NOSLOP_CHECKS=1` fallback.
- Improve generation behavior for `--format toon` to always emit `index.toon`.
- Add peer support for optional `@45ck/noslop@^1.0.0` integrations.

## 0.2.0

- Initial OSS implementation of structured artifact validation and generation.
- Add CLI commands: `init`, `check`, `generate`, `doctor`, `install-gates`.
- Add strict markdown policy checks (deny/unapproved markdown sources by default).
- Add TOON output generation through `@toon-format/toon`.
- Add manifest-based stale generation checks.
