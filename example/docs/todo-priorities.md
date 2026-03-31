---
id: TASK-003
title: "{{Priority}} Ranking"
state: in_progress
kind: functional
depends_on:
  - TASK-001
required_evidence:
  implementation: E0
description: "Assigns low, medium, or high {{Priority}} to each {{TodoItem}}"
---

# Priority Ranking

Every {{TodoItem}} carries a {{Priority}} value that indicates its relative importance. The allowed levels are low, medium, and high. When a new item is created without an explicit priority, it defaults to medium. Users can update the priority of any existing item at any time.

Priority directly affects the default sort order when listing items. High-priority tasks appear before medium, which appear before low. Within the same priority tier, items are further sorted by {{DueDate}} so that the most time-sensitive work surfaces first. This two-level ordering ensures that users see their most critical and urgent items at the top of the list without manual reordering.

The priority value is stored as a string enum in the SQLite database and is validated on write. Attempts to set an invalid priority value are rejected with a descriptive error message before any data is persisted.
