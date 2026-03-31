---
name: evidence-gap-review
description: Analyse specgraph verify output and identify what evidence is missing to advance specs to their next state.
---

Review the output of `specgraph verify` (or `specgraph verify --json`) and produce an actionable gap report.

## Procedure

1. Run `specgraph verify` (or read the provided output).
2. For each spec with status `WARN` or `FAIL`:
   - Identify the required evidence dimension(s) that are unmet.
   - State the current evidence level and what level is needed.
   - Suggest the lowest-effort action that would provide the required evidence.
3. Group findings by effort: low (annotation), medium (test), high (architecture decision).

## Evidence-gap action map

| Required level | Unmet because | Recommended action |
|----------------|---------------|--------------------|
| E0 | No `@spec` annotation | Add `/** @spec ID @implements Feature */` to the implementation file |
| E1 | No closed Beads issue | Create a Beads issue with `--spec-id ID` and close it when done |
| E2 | No cross-reference | Add `cross_refs: [ID]` to a related spec, or add a `RELATED` section |
| E3 | No test annotation | Add `/** @spec ID @verifies Feature */` to a test file |
| E4 | No CI artifact | Configure `freshness.artifacts` in `.specgraph/config.json` |

## Output format

For each gap, output:

```
SPEC-ID  [WARN|FAIL]  dimension=<name>  need=<Ex>  have=<Ey|none>
  → Action: <one-line description>
```

Then a prioritised action list (most impactful first).

## Rules

1. Do not suggest adding waivers unless the requirement is genuinely unreachable.
2. Prefer adding annotations over creating new files.
3. If multiple specs share the same gap pattern, batch the fix into a single suggestion.
4. Check `specgraph explain <SPEC-ID>` for detailed claim breakdown when unsure what evidence exists.
