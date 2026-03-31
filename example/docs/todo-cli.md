---
id: TASK-005
title: "CLI Interface"
state: in_progress
kind: functional
depends_on:
  - TASK-001
  - TASK-002
  - TASK-003
required_evidence:
  implementation: E0
description: "Provides command-line commands for managing todos"
---

# CLI Interface

The CLI is the primary user interface for Tasko, built with the commander library. It exposes the following commands: `tasko add` to create a new {{TodoItem}} with optional flags for {{Priority}}, {{DueDate}}, and {{Label}} tags; `tasko list` to display all items in a formatted table; `tasko done <id>` to mark an item as complete; `tasko label <id> <label>` to attach or remove a {{Label}}; and `tasko delete <id>` to permanently remove an item.

Each command parses its arguments, delegates to the appropriate domain module, and prints the result to stdout. Error conditions such as missing items or invalid input produce clear messages on stderr and exit with a non-zero code. The `tasko list` command supports flags like `--priority`, `--label`, and `--done` to filter output, bridging the CLI layer to the underlying {{Filter}} capabilities.

The CLI entry point initializes the {{Persistence}} layer on startup and tears it down on exit. Help text is auto-generated from command definitions, and a `--version` flag reports the current Tasko version. The interface is designed to feel familiar to users of tools like git and npm.
