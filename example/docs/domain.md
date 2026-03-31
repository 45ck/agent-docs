---
id: DOMAIN-001
title: "Tasko Domain"
state: draft
kind: DOMAINTREE
description: "Domain model for the Tasko todo-list application"
terms:
  - TodoItem
  - Label
  - Priority
  - DueDate
  - Completion
  - Filter
  - Persistence
  - Tag
---

# Tasko Domain Model

The Tasko application is a CLI-based todo-list manager built with TypeScript and SQLite. Its domain revolves around the central concept of a {{TodoItem}}, which represents a unit of work that a user wants to track. Each {{TodoItem}} carries metadata such as a {{Priority}} level, an optional {{DueDate}}, and a {{Completion}} status indicating whether the task has been finished.

Supporting concepts extend the core model. A {{Label}} is a user-defined string tag that can be attached to one or more {{TodoItem}}s for categorization. {{Tag}} is the underlying mechanism through which labels are associated with items, enabling many-to-many relationships. {{Priority}} classifies items as low, medium, or high to help users focus on what matters most.

The infrastructure layer introduces {{Persistence}}, which covers how domain objects are stored and retrieved from the SQLite database. {{Filter}} represents the query capabilities that allow users to narrow down their todo list by label, priority, completion status, or free-text search. Together, these concepts form a cohesive domain that balances simplicity with practical task management needs.
