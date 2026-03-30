---
id: SPEC-001
title: Policy engine evaluates specs against evidence-strength rules
state: in_progress
kind: feature
owner: core-team
priority: P0
---

# SPEC-001: Policy Engine

The policy engine evaluates specs against configurable evidence-strength
rules per spec state. It produces pass/warn/fail/waived/insufficient-evidence
results for each obligation.

## Acceptance Criteria

- Specs in `draft` state require no evidence
- Specs in `accepted` state require E1 implementation evidence
- Specs in `done` state require E2 implementation and E1 verification evidence
- Waivers can override missing obligations when allowed by policy
