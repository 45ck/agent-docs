# Changelog

## Unreleased

- Add configurable contract-stage commands (`contracts.check`/`contracts.generate`) and new
  `agent-docs contracts [check|generate]` commands for multi-language boundary workflows.
- Add all-language code traceability support via `codeTraceability.allowedExtensions: ["*"]`.
- Fix hook execution by passing repository root as positional argument (`agent-docs check ...`)
  and include optional contract checks in generated hooks.

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
