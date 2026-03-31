# specgraph-skills

A [skill-harness](https://github.com/45ck/skill-harness) plugin providing workflow skills for the [specgraph](https://github.com/45ck/agent-docs) spec verification engine.

## Skills

| Skill | Purpose |
|-------|---------|
| `spec-writer` | Write spec documents with correct YAML frontmatter, evidence requirements, and section structure |
| `evidence-gap-review` | Analyse `specgraph verify` output and identify the lowest-effort actions to close evidence gaps |
| `waiver-writer` | Write evidence waivers with justification, expiry, and approval fields |
| `verify-interpreter` | Interpret `specgraph verify` output and recommend next steps |
| `annotation-writer` | Add `@spec` JSDoc annotations to TypeScript/JavaScript source files |

## Installation via skill-harness

```bash
# Install all skills from this plugin
skill-harness install --packs specgraph-skills

# Or install individual skills
skill-harness install --agents spec-writer,evidence-gap-review
```

## Manual installation

Copy the `skills/` directory contents to `~/.claude/skills/` or `~/.agents/skills/`:

```bash
cp -r plugins/specgraph-skills/skills/* ~/.claude/skills/
```

## Usage with skill-harness setup-project

The `skill-harness setup-project` command installs `@45ck/agent-docs` and runs `specgraph init` automatically. These skills extend that workflow with agent-usable guidance for day-to-day specgraph operations.

```bash
# Bootstrap a new project (installs agent-docs + initialises specgraph)
skill-harness setup-project --dir ./my-project

# Then use skills in your agent workflow
# e.g. ask Claude: "use the spec-writer skill to create AUTH-001"
```
