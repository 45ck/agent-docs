---
id: DOMAINTREE-001
kind: DOMAINTREE
title: Data Domain Model for To-Do Example
status: accepted
scope: app
owner: Engineering
date: 2026-03-03
canonicalKey: todo-app-domain
tags: domain, model
dependsOn: SRD-001
---

## DOMAINTREE-001 Data Domain Model for To-Do Example

Generated from docs/DOMAINTREE-001.toon

- status: accepted
- path: docs/DOMAINTREE-001.toon

## Root Entity

Task is the primary aggregate persisted as JSON in localStorage.

## Attributes

id string from crypto randomUUID title text notes text priority enum dueDate ISO text completed boolean tags array and createdAt timestamp.

## Invariants

Tasks require a non-empty title. Completion state drives all filter calculations.

## Computed State

Overdue is derived from dueDate and current date excluding completed items.

## Relationships

Tasks have no external relationships in this example for onboarding clarity.

## Validation Rules

Priority is constrained to low medium or high. Missing dueDate disables overdue evaluation.

## Raw Snapshot
```json
{
  "id": "DOMAINTREE-001",
  "kind": "DOMAINTREE",
  "title": "Data Domain Model for To-Do Example",
  "status": "accepted",
  "scope": "app",
  "owner": "Engineering",
  "date": "2026-03-03",
  "canonicalKey": "todo-app-domain",
  "tags": [
    "domain",
    "model"
  ],
  "dependsOn": [
    "SRD-001"
  ],
  "references": [],
  "supersedes": [],
  "supersededBy": [],
  "conflictsWith": [],
  "metadata": {
    "terms": [
      "task",
      "notes",
      "priority",
      "dueDate",
      "completed",
      "overdue",
      "tag",
      "story"
    ]
  },
  "sections": [
    {
      "title": "Root Entity",
      "body": "Task is the primary aggregate persisted as JSON in localStorage."
    },
    {
      "title": "Attributes",
      "body": "id string from crypto randomUUID title text notes text priority enum dueDate ISO text completed boolean tags array and createdAt timestamp."
    },
    {
      "title": "Invariants",
      "body": "Tasks require a non-empty title. Completion state drives all filter calculations."
    },
    {
      "title": "Computed State",
      "body": "Overdue is derived from dueDate and current date excluding completed items."
    },
    {
      "title": "Relationships",
      "body": "Tasks have no external relationships in this example for onboarding clarity."
    },
    {
      "title": "Validation Rules",
      "body": "Priority is constrained to low medium or high. Missing dueDate disables overdue evaluation."
    }
  ]
}
```
