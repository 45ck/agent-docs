---
id: TASK-002
title: "{{Label}} Tagging System"
state: in_progress
kind: functional
depends_on:
  - TASK-001
required_evidence:
  implementation: E0
description: "Attaches {{Label}} tags to {{TodoItem}}s for categorization"
---

# Label Tagging System

The labeling system allows users to attach one or more {{Label}} tags to any {{TodoItem}}. Labels are free-form strings that serve as lightweight categories, such as "work", "personal", or "urgent". A {{TodoItem}} can carry multiple labels, and the same label string can appear on many items, forming a many-to-many relationship.

Adding a label to an item is idempotent; applying the same label twice has no additional effect. Labels can be removed individually from an item, and when no items reference a particular label string it is eligible for cleanup. The label data is stored in a dedicated junction table in the SQLite database, linked by the item's unique identifier.

Users can filter their todo list to show only items that carry a specific {{Label}}, which integrates with the broader {{Filter}} capabilities described in the filter spec. This makes labels a primary organizational tool for managing large numbers of tasks.
