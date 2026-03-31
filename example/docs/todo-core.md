---
id: TASK-001
title: "Core {{TodoItem}} Management"
state: in_progress
kind: functional
depends_on:
  - TASK-004
required_evidence:
  implementation: E0
description: "Manages the lifecycle of {{TodoItem}} entities"
---

# Core TodoItem Management

The core module provides full CRUD operations for {{TodoItem}} entities. Each item consists of a title, an optional description, a {{DueDate}}, a {{Priority}} level, a list of attached {{Label}} tags, and a completed flag indicating {{Completion}} status. Items are assigned a unique identifier upon creation and are persisted to the SQLite store immediately.

Users can create new items with at minimum a title, update any mutable field on an existing item, mark items as complete or incomplete, and permanently delete items they no longer need. All mutations are transactional to ensure data integrity even if the process is interrupted mid-operation.

Retrieval supports fetching a single item by ID or listing all items with optional sorting. The default sort order places incomplete items first, ordered by {{Priority}} descending and {{DueDate}} ascending, so the most urgent work surfaces at the top of the list.
