---
name: verify-interpreter
description: Interpret the output of `specgraph verify` and explain what each status means and what to do next.
---

Read and explain the output of `specgraph verify` in plain language, then recommend next steps.

## Status meanings

| Status | Meaning | Action |
|--------|---------|--------|
| `PASS` | All required evidence thresholds met | Nothing required |
| `WARN` | Evidence exists but below required strength for this state | Strengthen evidence or lower requirement |
| `FAIL` | No evidence found for a required dimension | Add evidence or add waiver |
| `SKIP` | Spec has no evidence requirements (draft/deprecated) | Review if state is correct |
| `WAIVED` | Requirement waived — check expiry | Verify waiver is still valid |

## Verify commands reference

```bash
specgraph verify                    # summary table for all specs
specgraph verify --json             # machine-readable output
specgraph explain <SPEC-ID>         # full claim breakdown for one spec
specgraph find <SPEC-ID>            # locate files that reference a spec
specgraph waivers                   # list active waivers
specgraph subject issue:beads:BD-xx # show a specific Beads issue's claims
```

## Interpretation checklist

1. Count PASS / WARN / FAIL counts — overall health indicator.
2. For each FAIL: run `specgraph explain <ID>` to see what claims exist.
3. For each WARN: check if the evidence level matches the spec's `state` requirements.
4. Check waiver expiry dates — expired waivers flip to WARN/FAIL.
5. Confirm `provider_runs` are recent — stale scan data can hide real gaps.

## Common causes

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| All specs FAIL | Annotations not scanned | Run `specgraph verify` again; check `@spec` syntax |
| WARN on `accepted` specs | Evidence is E0/E1, need E2+ | Add cross-refs or tests |
| Unexpected PASS | Waiver is covering a gap | Check `specgraph waivers` for active waivers |
| Missing specs in output | Spec file not in `docs/` | Check path and `.specgraph/config.json` |

## Rules

1. Never dismiss a FAIL without understanding the root cause.
2. Use `specgraph explain` before deciding whether to add evidence or a waiver.
3. Report the exact spec IDs and dimensions in any gap summary you produce.
