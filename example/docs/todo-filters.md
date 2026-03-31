---
id: TASK-006
title: "{{Filter}} and Search"
state: draft
kind: functional
depends_on:
  - TASK-001
description: "Filters and searches {{TodoItem}}s by various criteria"
---

# Filter and Search

The {{Filter}} module provides query capabilities that let users narrow down their todo list based on multiple criteria. Supported filters include {{Label}} matching, {{Priority}} level, {{Completion}} status, and free-text search across item titles and descriptions. Filters can be combined so that, for example, a user can request all high-priority incomplete items tagged with "work".

Filters are represented as a plain object with optional fields for each criterion. The persistence layer translates this filter object into parameterized SQL WHERE clauses, ensuring both safety and performance. Text search uses SQLite's LIKE operator with case-insensitive matching for simplicity, though a future iteration could adopt FTS5 for more advanced search.

The filter system is consumed by both the CLI list command and any future interfaces. It returns the same sorted item list as the standard retrieval path, with the additional constraint of the active filters applied. When no filters are specified, the behavior is identical to a plain list operation, maintaining a single code path for item retrieval.
