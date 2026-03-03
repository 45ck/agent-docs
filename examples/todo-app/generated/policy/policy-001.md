---
id: POLICY-001
kind: POLICY
title: Documentation Policy for Todo App Example
status: draft
scope: app
owner: Documentation
date: 2026-03-03
canonicalKey: todo-app-policy
tags: policy, governance
dependsOn: PLAN-001
---

## POLICY-001 Documentation Policy for Todo App Example

Generated from docs/POLICY-001.toon

- status: draft
- path: docs/POLICY-001.toon

## Markdown Governance

Only generated markdown under generated is allowed as source documentation and other markdown files are prohibited.

## Review Process

Document changes in .toon first then generate docs and run strict checks before merge.

## Contradiction Tracking

Use a contradiction matrix when decisions conflict unresolved risks must stay visible.

## Quality Gates

Minimum check is agent-docs check strict and generation freshness checks should pass in CI.

## Versioning

Commit source docs and generated outputs together so requirements trail can be traced through history.

## Raw Snapshot
```json
{
  "id": "POLICY-001",
  "kind": "POLICY",
  "title": "Documentation Policy for Todo App Example",
  "status": "draft",
  "scope": "app",
  "owner": "Documentation",
  "date": "2026-03-03",
  "canonicalKey": "todo-app-policy",
  "tags": [
    "policy",
    "governance"
  ],
  "dependsOn": [
    "PLAN-001"
  ],
  "supersedes": [],
  "supersededBy": [],
  "conflictsWith": [],
  "sections": [
    {
      "title": "Markdown Governance",
      "body": "Only generated markdown under generated is allowed as source documentation and other markdown files are prohibited."
    },
    {
      "title": "Review Process",
      "body": "Document changes in .toon first then generate docs and run strict checks before merge."
    },
    {
      "title": "Contradiction Tracking",
      "body": "Use a contradiction matrix when decisions conflict unresolved risks must stay visible."
    },
    {
      "title": "Quality Gates",
      "body": "Minimum check is agent-docs check strict and generation freshness checks should pass in CI."
    },
    {
      "title": "Versioning",
      "body": "Commit source docs and generated outputs together so requirements trail can be traced through history."
    }
  ]
}
```
