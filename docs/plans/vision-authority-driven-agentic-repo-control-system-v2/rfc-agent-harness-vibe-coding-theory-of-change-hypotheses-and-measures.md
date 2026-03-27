# How `agent-docs` improves vibe coding with agent harnesses

## Thesis

`agent-docs` improves AI-assisted development by changing the unit of control from **prompt wording alone** to **structured repo truth**.

In a harness such as Claude Code or Codex CLI, the model already has mechanisms for project memory, permissions, hooks, tool use, approvals, and specialized task delegation. Claude Code supports project and user memory via `CLAUDE.md`, project/user settings in JSON, hooks before and after tool execution, MCP tool connections, and configurable subagents with separate context windows and tool scopes. Codex CLI is a local coding agent with approval workflows. MCP itself is a schema-first tool protocol, and OpenAI Structured Outputs can force model output to match developer-supplied JSON Schema exactly.

The implication is straightforward:

**If the repo exposes canonical models, contracts, policies, boundaries, and compact context as machine-readable control surfaces, the harness becomes more deterministic, less duplicative, and less context-fragile.** This is the core theory behind `agent-docs`.

---

## Theory of change

### 1. From prompt-and-pray to environment-shaped behavior

Without repo-level structure, the harness is forced to infer:

* what types already exist
* what is canonical
* where public models belong
* what related docs/tests/contracts must change
* what edits are dangerous

Claude Code and MCP already support tool discovery, tool invocation, permissions, hooks, and project-level configuration. That means behavior can be shaped by the environment, not only by prose instructions. `agent-docs` uses that by turning repo truth into queryable tools, checks, and generated context bundles.

### 2. From freeform docs to structured operational memory

Claude Code project memory is explicitly intended to store project architecture, coding standards, and common workflows in `CLAUDE.md`. Subagents can also be configured with separate context windows and scoped tools. `agent-docs` improves this by making the memory more structured and less bloated: instead of telling the agent everything, it supplies the smallest authoritative bundle for the current task.

### 3. From ambiguous tools to typed actions

MCP tools expose `inputSchema` and optional `outputSchema` using JSON Schema, and OpenAI Structured Outputs are designed so responses can exactly match developer-supplied JSON Schemas. `agent-docs` benefits from this because its contract registry, duplicate checks, preflight queries, and context bundles can be surfaced as typed tools rather than soft natural-language conventions.

### 4. From permissive autonomy to bounded autonomy

Claude Code supports allow/ask/deny permission rules, sandboxing, and hooks that can run before or after tool use. Codex CLI exposes approval workflows so users can choose how hands-on to be. `agent-docs` improves agentic development by plugging repo-specific meaning into those control points: for example, blocking creation of public boundary types outside canonical zones, requiring preflight before exported-model creation, or forcing regeneration of docs/contracts when a canonical model changes.

---

## Hypotheses

## H1. `agent-docs` reduces duplicate model and type creation

**Mechanism:**  
Agents duplicate types mainly when they do not discover existing structures in time. If `agent-docs` exposes a repo-wide symbol index, a canonical contract zone, and a required preflight query before creating exported/shared types, the harness can search existing shapes before inventing new ones. This is especially compatible with MCPs model-controlled tool discovery and Claude Codes hook system.

**Prediction:**  
Repos using `agent-docs` will show fewer:

* duplicate public DTOs
* near-identical exported interfaces
* parallel same meaning, different name models

**Why this matters for vibe coding:**  
It lets fast natural-language coding stay fast without turning the repo into a graveyard of almost-the-same types.

---

## H2. `agent-docs` improves first-pass correctness of agent changes

**Mechanism:**  
Claude Code can be configured with project memory, shared settings, hooks, and subagents; Codex CLI supports approval workflows; MCP and Structured Outputs support schema-constrained inputs and outputs. If `agent-docs` supplies canonical models, policy metadata, and typed preflight tools into those surfaces, the agent is more likely to choose the correct import, edit the right file, and update the right dependent artifacts on the first pass.

**Prediction:**  
Repos using `agent-docs` will see improvements in:

* first-pass merge success
* reduction in forgot related file errors
* reduction in used wrong type or missed existing abstraction mistakes

**Why this matters for vibe coding:**  
The harness feels more capable without needing a larger prompt or more manual babysitting.

---

## H3. `agent-docs` reduces context pollution and hallucinated repo understanding

**Mechanism:**  
Claude Code subagents operate in separate context windows and can have scoped tools. Project memory and settings can also be shared at the repo level. `agent-docs` complements this by generating compact, task-specific context bundles rather than long prose docs. That should reduce accidental contamination of the main context window and lower the chance that the agent carries stale assumptions across tasks.

**Prediction:**  
With `agent-docs`, context passed into tasks will become:

* smaller
* more relevant
* less repetitive
* more stable across sessions

**Why this matters for vibe coding:**  
It preserves the fluidity of just ask the model while reducing the hidden cost of context drift.

---

## H4. `agent-docs` turns docs from passive prose into active control surfaces

**Mechanism:**  
The current harness ecosystem rewards machine-readable structure. MCP tools are described with schemas, and Structured Outputs can force exact conformance to JSON Schema. Therefore, when model definitions, ownership, boundaries, and relations are represented structurally, they do not merely document the repo they become executable controls the agent can query and the harness can validate.

**Prediction:**  
Generated docs produced from canonical contracts will drift less than freeform markdown, and the same source structures can serve three roles at once:

* documentation
* agent context
* validation/checking

**Why this matters for vibe coding:**  
It keeps the speed of informal development while replacing vague repo memory with typed operational memory.

---

## H5. `agent-docs` improves safe autonomy rather than merely reducing autonomy

**Mechanism:**  
Claude Code supports permissions, sandbox settings, hooks, and project/user policy files; Codex CLI supports approval workflows. `agent-docs` lets those mechanisms become semantically aware. Instead of a generic ask before edits, the harness can enforce repo-specific rules such as:

* ask before changing canonical contracts
* deny exported shared models outside the contract zone
* require regeneration after contract edits
* block edits to protected boundary files without passing checks

**Prediction:**  
Teams can allow more autonomous agent behavior without proportionally increasing repo mess or accidental semantic drift.

**Why this matters for vibe coding:**  
The goal is not to slow the harness down. It is to let it move faster inside a constrained corridor.

---

## H6. `agent-docs` improves multi-agent or subagent specialization

**Mechanism:**  
Claude Code supports specialized subagents, each with separate context and tool permissions. `agent-docs` gives those subagents a shared structured substrate: one subagent can own contract lookup, another duplicate detection, another doc generation, another impact analysis. Because each subagent can be given narrower tools and narrower context, the overall system should become less error-prone than a single generalist agent trying to hold the whole repo in mind.

**Prediction:**  
Subagent-based workflows will outperform a single monolithic agent on tasks that require:

* architecture awareness
* contract consistency
* broad repo impact tracking

**Why this matters for vibe coding:**  
It preserves the natural-language UX while quietly moving toward disciplined agentic engineering.

---

## H7. `agent-docs` improves cross-session consistency

**Mechanism:**  
Claude Code supports project-level shared memory and settings checked into source control. That means teams can store stable instructions and policies at the repo layer rather than re-explaining them every session. `agent-docs` strengthens that by converting repo norms into explicit contracts, policies, indexes, and generated summaries, reducing dependence on transient prompt context.

**Prediction:**  
Over time, agent behavior will become more consistent across:

* different contributors
* different sessions
* different tasks
* different harnesses using the same repo controls

**Why this matters for vibe coding:**  
It reduces the sometimes genius, sometimes chaos profile of AI-assisted coding.

---

## H8. `agent-docs` shifts vibe coding toward vibe engineering

**Mechanism:**  
Codex CLI and Claude Code already let models read, modify, and run code locally with approvals, permissions, tool integrations, and repo-level configuration. `agent-docs` does not try to replace that fluidity; it adds a semantic scaffold beneath it. The result is a mode where the developer still works conversationally and quickly, but the repo itself pushes back against duplication, stale docs, unsafe boundaries, and drift.

**Prediction:**  
The subjective feeling remains fast, natural, low-friction, but the objective artifact quality becomes closer to disciplined engineering.

---

## Practical theory summary

The improvement comes from four linked effects:

1. **Better retrieval before creation**  
   The harness can discover existing symbols/contracts before inventing new ones.

2. **Better structure at the boundary layer**  
   Public models, events, and interfaces become canonical and queryable.

3. **Better control over agent actions**  
   Hooks, permissions, sandboxes, approvals, and subagents can enforce repo-specific rules.

4. **Better context efficiency**  
   The harness gets smaller, more relevant, more structured context instead of broad prose.

Together, these mechanisms predict that `agent-docs` will improve AI-assisted development not by making the model smarter in isolation, but by making the **repo more legible and more governable to the model**.

---

## Suggested measurement section

To test the theory, track:

* duplicate public type rate
* preflight lookup rate before new exported type creation
* first-pass success rate of agent-generated PRs
* stale-doc incidents
* contract drift incidents
* average context bundle size
* boundary violation count
* number of manual approval interruptions per task
* time from request to safe merged change

A successful `agent-docs` rollout should reduce mess without destroying speed.

---

## One-sentence conclusion

`agent-docs` improves vibe coding because it turns an AI harness from a **prompt-driven improviser** into a **repo-aware actor operating inside structured semantic guardrails**.
