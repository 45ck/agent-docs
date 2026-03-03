---
id: JOURNEY-001
kind: JOURNEY
title: User Journey for Demo To-Do App
status: accepted
scope: app
owner: Experience
date: 2026-03-03
canonicalKey: todo-app-journey
tags: onboarding, workflow, ux
dependsOn: PRD-001
---

## JOURNEY-001 User Journey for Demo To-Do App

Generated from docs/JOURNEY-001.toon

- status: accepted
- path: docs/JOURNEY-001.toon

## Entry

Open the repo and run npm install then npm run docs:generate npm run docs:check and npm run dev.

## Primary Flow

Create tasks with title priority due date tags and notes. Use filters to view active overdue and high priority work.

## Edit and Review

Mark tasks complete reopen or remove stale items. Use search to inspect active and completed entries.

## Documentation Workflow

Update TOON artifacts before behavior changes regenerate docs and rerun strict checks.

## Exit

Keep generated docs clean and rerun checks after every docs or UI change.

## Raw Snapshot
```json
{
  "id": "JOURNEY-001",
  "kind": "JOURNEY",
  "title": "User Journey for Demo To-Do App",
  "status": "accepted",
  "scope": "app",
  "owner": "Experience",
  "date": "2026-03-03",
  "canonicalKey": "todo-app-journey",
  "tags": [
    "onboarding",
    "workflow",
    "ux"
  ],
  "dependsOn": [
    "PRD-001"
  ],
  "supersedes": [],
  "supersededBy": [],
  "conflictsWith": [],
  "sections": [
    {
      "title": "Entry",
      "body": "Open the repo and run npm install then npm run docs:generate npm run docs:check and npm run dev."
    },
    {
      "title": "Primary Flow",
      "body": "Create tasks with title priority due date tags and notes. Use filters to view active overdue and high priority work."
    },
    {
      "title": "Edit and Review",
      "body": "Mark tasks complete reopen or remove stale items. Use search to inspect active and completed entries."
    },
    {
      "title": "Documentation Workflow",
      "body": "Update TOON artifacts before behavior changes regenerate docs and rerun strict checks."
    },
    {
      "title": "Exit",
      "body": "Keep generated docs clean and rerun checks after every docs or UI change."
    }
  ]
}
```
