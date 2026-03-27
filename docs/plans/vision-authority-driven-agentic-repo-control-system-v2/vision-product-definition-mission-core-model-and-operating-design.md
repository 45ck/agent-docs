# agent-docs v2

## One-line definition

**agent-docs is an agentic repo control system that makes shared models, contracts, boundaries, and generated docs authoritative enough that coding agents cannot easily create messy duplication, stale docs, or unsafe drift.**

It keeps the strongest parts of the current repo strict source format, generated markdown by default, validation, reports, contract-stage workflows, and quality-hook installation and recenters the product around **agent execution correctness**, not just planning artifacts.

---

## Mission

Make the clean path the default path for agent harnesses.

In practice, that means:

* agents should discover existing models before inventing new ones
* shared/public structures should have one authoritative home
* docs should be generated from structure, not drift separately
* boundaries and ownership should be machine-enforced
* context given to agents should be compact, relevant, and deduplicated
* repo governance should be strict where it matters and lightweight where it does not

---

## The problem it solves

Current agent harnesses fail in predictable ways:

* duplicate types or contracts get created
* existing types are missed
* docs grow bloated and stale
* public boundaries leak into random packages
* different languages drift apart
* agents receive too much or the wrong context
* CI catches style, but not semantic mess

The current `agent-docs` already tackles part of this by enforcing structured source artifacts, markdown policy, terminology/reference checks, artifact reports, and optional contract workflows. But its current built-in center is still artifact-heavy and document-oriented.

v2 fixes that by making the primary objects:

* concepts
* contracts
* symbols
* boundaries
* ownership
* policies
* agent context bundles

---

## Core philosophy

### 1. Structure first

Freeform prose is secondary. Structured models and relations are primary.

This is already aligned with the current repo, which defaults source documents to `.toon` and treats markdown as generated output only by default.

### 2. Public/shared things need one authority

A shared model cannot be kind of everywhere.

### 3. Agents need queryable truth, not large docs

The system must answer:

* what already exists
* what is canonical
* what can I reuse
* what will this change break
* what is the smallest relevant context

### 4. Docs are outputs, not the truth

Human-readable docs still matter, but they are generated from structured truth.

### 5. Risk-based enforcement

Be hardest on:

* public contracts
* exported/shared types
* cross-package boundaries
* generated artifacts

Be lighter on:

* private local implementation details

---

## What agent-docs is

It is **one product with one mandatory core and optional packs**.

Not a random bundle of tools.  
Not several disconnected products sharing a name.

---

# Product shape

## Mandatory core

Every repo using `agent-docs` should have these capabilities.

### 1. Workspace index

Repo-wide machine index of:

* exported symbols
* contracts
* public types
* interfaces
* events
* operations
* ownership
* imports/exports
* language/source locations

Purpose:

* let agents find existing things before creating new ones
* power impact analysis and compact context

### 2. Canonical contract zone

A declared place for shared/public models and contracts.

Examples:

* `/contracts`
* `/schemas`
* `/packages/contracts`

Purpose:

* stop public boundary types from being invented in random packages
* create one reusable source of truth

### 3. Duplicate and drift detection

Detect:

* exact duplicate exported shapes
* near-duplicate public shapes
* duplicate concepts with different names
* public types outside canonical zones
* drift between canonical contracts and implementations

### 4. Agent preflight

Before an agent creates or edits a public/shared thing, it should be able to query:

* nearest existing symbol
* nearest existing shape
* canonical import path
* owner
* related contracts
* affected tests/docs/modules

### 5. Boundary and ownership policy

Machine-enforced rules for:

* where public/shared shapes may be defined
* what packages may depend on what
* who owns a public concept
* what kinds of changes require generated updates

### 6. Compact context generation

Produce small machine-oriented bundles for:

* symbol context
* contract context
* task context
* impact context
* diff context

This avoids replacing bloated docs with bloated bundles.

---

## Optional packs

These remain in the system, but they are not the center.

### Artifact/governance pack

Keep and modernize the current artifact model:

* ADR
* PRD
* SRD
* JOURNEY
* DOMAINTREE
* POLICY
* TESTCASE
* DEFECT
* RISK
* INTERFACE
* COMPONENT
* RUNBOOK
* DECISION

These exist today and are useful, but should become an optional higher-level governance layer rather than the main identity of the product.

### Reporting pack

Expanded reports:

* traceability
* coverage
* impact
* defect
* duplicate concepts
* boundary violations
* ownership gaps
* stale generated artifacts

The current repo already supports traceability, defect, coverage, and impact reports.

### Contract emitters pack

Optional language/output generation:

* TypeScript
* C#
* JSON Schema
* OpenAPI
* later: Python, Rust, Proto, etc.

### Beads/issues pack

Keep optional issue linkage and validation.  
The current repo already supports optional Beads issue validation and external `specRefs`.

### Human-docs pack

Generated markdown or TOON exports for humans.  
This already exists and should remain output-only.

---

# Profiles

Use profiles, not arbitrary feature soup.

## `minimal`

For repos that want anti-mess basics.

Includes:

* workspace index
* duplicate detection
* preflight queries
* markdown generated-output policy
* basic boundary rules

## `contracts`

For repos with shared APIs/models/events.

Includes:

* everything in `minimal`
* canonical contract zone
* contract checks/diff
* public boundary enforcement
* contract generation hooks or built-ins

## `governed`

For serious engineering repos.

Includes:

* everything in `contracts`
* terminology checks
* relation policies
* ownership checks
* reports
* artifact/governance pack

This builds on what current `agent-docs check` already validates: source structure, references, status values, conflict symmetry, contradiction matrix, code mappings, markdown policy, freshness, terminology, and relation rules.

## `full-agentic`

The complete harness-oriented mode.

Includes:

* everything in `governed`
* compact context bundles
* impact engine for symbols/contracts
* stronger duplicate similarity checks
* cross-language drift detection
* agent-oriented query tools
* stricter hook/CI integration

---

# What is authoritative

This must be explicit.

## Authority map

### Canonical contract zone

Authoritative for:

* public/shared models
* public/shared payloads
* API/event contracts
* cross-language shared semantics

### Workspace index

Authoritative for:

* what exists in code right now
* where it lives
* what imports it
* what exports it
* what changed

### Artifact layer

Authoritative for:

* rationale
* policy
* planning links
* decision history
* risk/compliance overlays

### Generated markdown/docs

Never authoritative.

This avoids the ambiguity that kills agent workflows.

---

# Object model

## Core objects

### Concept

A canonical business/domain idea.  
Fields:

* id
* name
* aliases
* description
* owner
* stability
* tags

### Contract

A shared/public structure.  
Fields:

* id
* name
* kind (`model`, `api`, `event`, `error`, `config`, `interface`)
* canonicalPath
* fields/members
* constraints
* aliases
* owner
* visibility
* version
* generatedTargets

### Symbol

An indexed code-level exported item.  
Fields:

* name
* language
* file
* module/package
* visibility
* fingerprint
* relatedContract
* owner
* importPath

### Boundary

A policy object declaring allowed definition/import/export rules.

### ContextBundle

A machine-optimized summary for a concrete question.

### Artifact

Optional governance/planning object from the existing artifact model.

---

# How it works operationally

## Lifecycle

### 1. Index

Scan the repo and build:

* symbol graph
* contract graph
* import/export map
* ownership map
* duplicate candidates

### 2. Check

Validate:

* boundary rules
* duplicate rules
* ownership
* freshness
* markdown policy
* contracts
* artifacts
* terminology
* relations

### 3. Preflight

When an agent is about to create or edit something important, it queries the system first.

### 4. Generate

Generate:

* docs
* compact context bundles
* manifests
* emitted contract outputs
* reports

### 5. Report

Surface drift, gaps, and risky zones.

---

# CLI definition

## Core commands

### Setup

```bash
agent-docs init
agent-docs doctor
agent-docs install-gates
```

These already exist in the current repo and remain foundational.

### Validation

```bash
agent-docs check --strict
agent-docs boundaries check
agent-docs ownership check
agent-docs dupes check
agent-docs freshness check
```

### Index and discovery

```bash
agent-docs index
agent-docs find-symbol Customer
agent-docs find-shape --fields id,email,name
agent-docs find-contract Invoice
agent-docs why-type UserProfile
```

### Agent preflight

```bash
agent-docs preflight type "invoice with id total currency status"
agent-docs preflight edit src/foo.ts
agent-docs preflight export src/bar.ts
```

### Context

```bash
agent-docs context symbol Customer
agent-docs context contract Invoice
agent-docs context task add-email-verification
agent-docs context diff HEAD~1..HEAD
```

### Contracts

```bash
agent-docs contract check
agent-docs contract diff
agent-docs contract emit --lang ts
agent-docs contract emit --lang csharp
```

This evolves the current `contracts [check|generate]` command from an external-command orchestrator into a built-in first-class subsystem. Right now, contracts are configured via commands in `.agent-docs/config.json`.

### Reports

```bash
agent-docs report --all
agent-docs report --type traceability
agent-docs report --type dupes
agent-docs report --type impact
agent-docs report --type ownership
```

Current report types already include traceability, defect, coverage, and impact.

---

# Policy model

## Boundary rules

Examples:

* only canonical contract zones may define public boundary models
* apps may not export shared DTOs directly
* private packages may not expose public contracts
* local implementation types may exist, but not as cross-package authority

## Duplicate rules

Examples:

* exact duplicate public types are errors
* highly similar exported shapes are warnings or errors depending on profile
* duplicate concepts with different canonical names require explicit aliasing
* public/shared shape outside canonical zone is an error

## Ownership rules

Examples:

* every public contract must have an owner
* ownerless public symbols fail in `governed` and `full-agentic`
* contract changes without owner mapping are blocked

## Freshness rules

Examples:

* generated outputs must match manifest/source hash parity
* index must be fresh relative to changed files
* context bundles older than current index are invalid

The current repo already has strict freshness and generated-manifest parity options in config.

---

# What stays from current agent-docs

## Kept

* strict source philosophy
* generated markdown policy
* check/generate/init/report/doctor/install-gates lifecycle
* relation and terminology validation
* issue/spec references
* report generation
* noslop-aware hook installation
* artifact pack support

These are all visible in the current README and should survive.

## Changed

* contracts become built-in, not just external commands
* artifacts become optional packs, not the main identity
* workspace index becomes first-class
* duplicate detection becomes first-class
* agent preflight becomes first-class
* compact context becomes first-class

## Removed or demoted

* broad planning artifacts as the primary product identity
* freeform doc production as a main goal
* any implication that markdown itself is a source of truth

---

# Relationship to noslop

## Division of responsibility

### `@45ck/noslop`

Controls behavior:

* hard repo quality gates
* anti-bypass workflow
* fast/slow checks
* protected-path discipline

### `agent-docs`

Controls meaning:

* canonical shared models/contracts
* duplication prevention
* boundary governance
* agent discovery/preflight
* generated docs/context/reports

The current repo already explicitly supports installing hooks that run optional `noslop` checks before `agent-docs check`.

Together, the stack becomes:

* **noslop**: do not behave sloppily
* **agent-docs**: do not model the repo sloppily

---

# Repo structure

A good v2 structure:

```text
.agent-docs/
  config.json
  manifest.json
  index/
    symbols.json
    contracts.json
    ownership.json
    dupes.json
  reports/
  hooks/
  templates/

contracts/
  domain/
  api/
  events/
  config/

docs/
  source/        # optional artifact sources if enabled
generated/
  docs/
  reports/
  context/
  contracts/
```

---

# Success criteria

agent-docs v2 succeeds if it measurably reduces:

* duplicate public/shared types
* duplicate concepts with different names
* stale generated docs
* random public DTO definitions across packages
* agent-created drift between contract and implementation
* wasted context sent to agents

And increases:

* reuse of canonical shared models
* preflight lookups before creation
* clarity of ownership
* impact visibility
* confidence in agent-generated changes

---

# Non-goals

agent-docs is not:

* a general-purpose programming language
* a full workflow engine
* an ORM
* a PM tool replacement
* a universal docs platform
* a replacement for all language-native tooling

It is a **repo control system for agent correctness and cleanliness**.

---

# v1 cut

The smallest real v2 is:

1. workspace index
2. canonical contract zone
3. duplicate detection
4. preflight queries
5. boundary rules
6. generated context bundles
7. current check/generate/report/install-gates retained
8. artifacts kept as optional pack

That gives immediate value without trying to ship everything at once.

---

# Final definition

**agent-docs is a modular but authority-driven agentic repo control system.**  
Its mandatory core prevents duplication, drift, and boundary mess for coding agents.  
Its optional packs add governance, artifacts, reports, and human-facing outputs.  
Its docs are generated.  
Its contracts are canonical.  
Its context is compact.  
Its rules are enforceable.  
Its purpose is to make messy agent behavior difficult and clean agent behavior natural.

If you want, the next step is the exact **v2 README/spec skeleton** with command docs, module list, config schema, and profiles written as if you were about to implement it.
