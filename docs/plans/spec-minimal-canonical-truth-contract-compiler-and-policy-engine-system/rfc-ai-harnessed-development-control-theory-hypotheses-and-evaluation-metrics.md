## How agent-docs improves AI-harnessed development

### Thesis

AI harnesses such as Claude Code and Codex CLI are already capable of reading repositories, editing files, running commands, using tools, and operating with varying degrees of autonomy inside a local workspace. Claude Code exposes hooks, path-scoped rules, managed settings, tool restrictions, MCP integrations, and subagent capability controls. Codex CLI likewise exposes sandboxing, approvals, project-scoped config, and rules for commands outside the sandbox. ([Claude API Docs][1])

The practical consequence is that development quality is no longer shaped only by the model. It is shaped by the **repository operating environment** around the model. agent-docs improves vibe coding by converting an under-specified repo into a governed workspace with canonical truth, generated documentation, compatibility checks, terminology control, and enforcement hooks. Your current repo already does part of this through structured source artifacts, generated markdown, validation, traceability, and hook/CI installation, while the RFC extends this into a native contract/compiler layer with a stable IR, compatibility engine, glossary governance, and runtime validation.

### Theory of change

Normal AI-assisted coding fails in a repeatable pattern:

* the agent does not know what is canonical
* it recreates concepts that already exist
* prose docs and code drift apart
* generated artifacts go stale
* changes are made without clear impact analysis
* autonomy is either too restricted to be useful or too open to be safe

agent-docs changes the repo from a loose file tree into a **controlled decision surface**.

Instead of the agent asking, What should I do in this messy repo?, the repo answers:

* these are the canonical concepts
* these names are allowed
* these documents are source, these are generated
* these contracts are public
* these changes are breaking or safe
* these files are writable, these are protected
* these outputs must be regenerated before the task is complete

That matters because Claude Code and Codex both have real enforcement surfaces: hooks, rules, tool restrictions, subagent capability limits, sandboxing, and approval policies. agent-docs gives those surfaces something precise to enforce. ([Claude API Docs][1])

### Core hypotheses

#### H1. Canonical contract truth reduces duplicate structures

If shared/public models are defined once and emitted into code/docs/validators, agents will create fewer duplicate DTOs, schemas, and near-equivalent types.

**Mechanism:** duplication is usually a discovery and authority problem, not a typing problem. The RFCs canonical semantic model, glossary, and IR directly attack that failure mode.

**Predictions:**

* fewer new public types created outside approved locations
* fewer semantically overlapping models
* fewer manual merge these two types review comments

#### H2. Generated docs reduce documentation drift

If markdown is treated as generated output rather than hand-maintained truth, the repo will accumulate less stale prose and fewer contradictory docs.

**Mechanism:** current agent-docs already treats markdown as generated output by default and validates markdown policy and manifest freshness.

**Predictions:**

* fewer stale docs after contract changes
* fewer PRs where docs and code disagree
* fewer manual doc-fix follow-ups

#### H3. Glossary governance improves agent reuse of existing concepts

If canonical terms, aliases, and forbidden aliases are explicit, agents will more often reuse existing concepts instead of inventing new synonyms.

**Mechanism:** the RFCs glossary model and duplicate/near-duplicate linting shift the task from vague semantic memory to explicit repo lookup.

**Predictions:**

* lower frequency of synonym drift like `Customer/User/Member`
* more consistent naming across language boundaries
* fewer reviewer comments about terminology inconsistency

#### H4. Compatibility checks reduce high-speed breaking changes

If contract diff, break-check, and impact analysis are mandatory, agents can move fast without silently shipping breaking interface changes.

**Mechanism:** the RFC makes compatibility a first-class feature rather than an afterthought.

**Predictions:**

* fewer accidental breaking API/event/schema changes
* fewer downstream consumer regressions
* faster review on additive changes because risk is classified earlier

#### H5. Runtime validators improve reliability more than static types alone

If emitted outputs include validators, fixtures, and contract tests rather than just types, AI-generated code will fail earlier and closer to the boundary.

**Mechanism:** the RFC explicitly treats runtime validation as mandatory, not optional decoration.

**Predictions:**

* fewer typed but wrong at runtime failures
* more defects caught in local/CI validation
* lower bug density at integration boundaries

#### H6. Repo-level enforcement increases safe autonomy

If agent-docs is bound into hooks, CI, tool restrictions, sandboxing, and approval workflows, the harness can operate with more autonomy without proportionally increasing risk.

**Mechanism:** Claude Code supports hooks, managed denials, sandbox enforcement, tool restrictions, and subagent capability control; Codex supports sandboxing, approvals, project-scoped config, and command rules outside the sandbox. ([Claude API Docs][1])

**Predictions:**

* fewer approval prompts for routine safe work
* fewer risky edits outside approved zones
* higher percentage of successful unattended low-risk tasks

#### H7. Structured repo control lowers context waste

If the repo exposes a small number of authoritative structured sources and generated indexes, the agent will spend fewer tokens rediscovering the project each run.

**Mechanism:** both harnesses operate within workspace context; Codex explicitly supports file search and in-session instruction injection, and Claude Code supports path-scoped rules and skills/subagents. A better-structured repo reduces exploration overhead. ([Claude API Docs][2])

**Predictions:**

* shorter exploratory phases before first meaningful edit
* fewer irrelevant file reads
* lower per-task token/time cost for repeated work in the same repo

#### H8. Vibe coding becomes closer to governed engineering

agent-docs will not eliminate exploratory AI coding; it will constrain it so that improvisation happens inside bounded rules rather than across unconstrained repo entropy.

**Mechanism:** the current repo already validates references, IDs, conflict symmetry, relation policies, terminology, code traceability, and generated freshness, and installs hooks that can run contract and quality checks.

**Predictions:**

* fewer looks good but structurally wrong outputs
* more reviewable, incremental changes
* higher trust in agent-produced PRs

### Strongest claim

The strongest credible claim is not:

> agent-docs makes AI coding perfect.

It is:

> agent-docs increases the expected quality, consistency, and safe autonomy of AI-harnessed development by making the repository itself legible, enforceable, and regenerable.

That claim is grounded in two facts:

* the harnesses already provide real control surfaces for tools, rules, approvals, hooks, and sandboxing; ([Claude API Docs][1])
* your product direction is explicitly moving from artifact governance alone toward canonical contracts, compatibility, glossary control, runtime validation, and generated outputs.

### What this does not solve

It will not solve:

* bad product decisions
* incorrect business logic inside otherwise valid boundaries
* weak tests if verification rules are shallow
* poor codegen quality if emitters are immature
* every project type equally well

Your RFC is already correct to keep the wedge narrow: shared boundaries, canonical concepts, docs, compatibility, and generated bindings, not all software semantics.

### Suggested evaluation metrics

Use these to test the theory:

* duplicate public type rate
* glossary violation rate
* stale generated artifact rate
* breaking-change catch rate before merge
* integration defect rate at boundaries
* median approvals per task
* median files explored before first edit
* PR review comments about drift/duplication/docs mismatch
* percent of low-risk tasks completed without human correction

### One-sentence version

**agent-docs improves AI-harnessed development by turning the repo from passive context into an active control system: canonical truth, generated views, enforced policies, and compatibility-aware boundaries that let agents move faster with less drift and less mess.**

If you want, Ill turn this into a formal RFC section with numbered hypotheses, metrics, threats to validity, and an evaluation plan.

[1]: https://docs.anthropic.com/en/docs/claude-code/hooks "Hooks reference - Claude Code Docs"
[2]: https://docs.anthropic.com/en/docs/claude-code/memory "How Claude remembers your project - Claude Code Docs"
