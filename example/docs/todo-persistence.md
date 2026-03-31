---
id: TASK-004
title: "SQLite {{Persistence}} Layer"
state: in_progress
kind: functional
required_evidence:
  implementation: E0
description: "Stores and retrieves todo data using SQLite via better-sqlite3"
---

# SQLite Persistence Layer

The {{Persistence}} layer manages all durable storage for the Tasko application using SQLite through the better-sqlite3 library. The database file is created in the user's data directory on first run, and schema migrations are applied automatically to bring the database up to the current version. This ensures that upgrading the application never requires manual database intervention.

The schema includes a primary `todos` table holding item fields (id, title, description, due_date, priority, completed, created_at, updated_at) and a `todo_labels` junction table that maps item IDs to label strings. All write operations use explicit transactions to maintain atomicity, and the WAL journal mode is enabled for improved concurrent read performance.

The persistence module exposes a repository interface consumed by the core and label modules. This interface abstracts SQL details behind methods like `insert`, `update`, `delete`, `findById`, and `findAll`, keeping domain logic free of query construction. Connection lifecycle is managed internally, with the database handle opened lazily and closed on process exit.
