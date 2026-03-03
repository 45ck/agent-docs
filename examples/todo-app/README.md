# To-Do App example powered by agent-docs planning artifacts

This example demonstrates how to use @45ck/agent-docs in a real project.

## Features in the example app
- Add, complete, archive, and restore tasks.
- Task metadata: priority, tags, due dates, notes.
- Filters: All / Active / Completed / Overdue / High priority.
- Search by title or tags.
- Sort by creation date, priority, or due date.
- Local persistence via `localStorage`.
- Full planning and documentation workflow with `agent-docs`:
  - Source docs in `docs/*.toon`
  - Validation via `agent-docs check`
  - Output via `agent-docs generate --format both`

## Quick start

```bash
cd examples/todo-app
npm install
npm run dev
```

## Documentation workflow

```bash
npm run docs:check          # validate planning artifacts
npm run docs:generate       # generate markdown + toon docs into generated/
npm run docs:doctor         # environment validation
```

To run against this project from the monorepo root:

```bash
cd C:\Projects\agent-docs
node dist/index.js check examples/todo-app --strict
node dist/index.js generate examples/todo-app --format both
```
