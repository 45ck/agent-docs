---
name: spec-writer
description: Write specgraph spec documents with correct YAML frontmatter, evidence requirements, and section structure.
---

Write a spec document for the feature or component described. Place it in `docs/` with a `.md` extension.

## Required frontmatter fields

```yaml
---
id: <UPPERCASE-KEBAB-000>          # unique ID, e.g. AUTH-001
title: "Human-readable title"
state: draft | in_progress | accepted | deprecated
kind: functional | non_functional | architecture | interface | constraint
required_evidence:
  implementation: E0               # minimum evidence strength needed
  # add more dimensions as needed: test_coverage, integration, etc.
# optional:
depends_on: [OTHER-001]            # IDs this spec depends on
owner: "Team or person"
tags: [auth, security]
---
```

## Evidence strength reference

| Level | Meaning | Typical source |
|-------|---------|----------------|
| E0 | Declared intent | `@spec` JSDoc annotation |
| E1 | Structural artifact | Beads issue closed, file named after spec |
| E2 | Indexed reference | Cross-reference from another spec |
| E3 | Automated test | Test file with `@spec` annotation |
| E4 | Runtime proof | CI artifact, coverage report |

## State guidance

- `draft` — early exploration, no evidence required
- `in_progress` — active development, `E0` implementation typically sufficient
- `accepted` — complete, requires `E2`+ implementation evidence
- `deprecated` — no longer enforced

## Rules

1. Choose the smallest evidence requirement that still provides meaningful signal.
2. Keep `id` stable — downstream annotations and Beads issues reference it.
3. Write section body in imperative: "The system SHALL…", "The API MUST…".
4. Add `depends_on` when this spec only makes sense after another is satisfied.
5. Do not add waivers to the frontmatter directly — use `specgraph waivers` or `docs/waivers/*.md`.
