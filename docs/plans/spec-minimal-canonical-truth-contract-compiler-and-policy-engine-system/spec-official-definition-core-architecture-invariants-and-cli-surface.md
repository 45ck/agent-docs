## agent-docs

**agent-docs is a repository control system for agentic software engineering.**  
It makes one small set of structured sources authoritative, derives the human docs from them, enforces repo policies in hooks/CI, and keeps contracts, terminology, traceability, and generated artifacts in sync so agent harnesses cannot easily create drift, duplication, or doc sludge. This keeps the current strengths of the repo strict source artifacts, generated markdown, validation, reports, and gate installation while replacing the weak point where contracts are still treated as external shell commands.

## Product thesis

The product is **one system with one core job**:

**control the repo so agents produce coherent changes.**

It does that through four things:

1. canonical structured sources
2. contract/model governance
3. enforcement and verification
4. generated views for humans

That matches the current repos strict artifact/governance model and the RFCs stronger inner architecture of canonical semantic model, IR, importers, emitters, capability maps, loss reporting, compatibility checks, glossary governance, and runtime validators.

## What it is not

It is **not**:

* a general-purpose programming language
* a universal type system for all software
* an ORM
* an infra DSL
* a workflow engine
* a replacement for every existing standard

Its wedge is **shared repo truth and boundary governance**, not all software semantics. The RFC already correctly narrows scope to shared concepts, operations, events, docs, examples, aliases, compatibility, and runtime validation hooks, while excluding arbitrary business logic, full DB modeling, UI behavior, orchestration, and infra for v1.

## The core definition

**agent-docs = canonical source layer + contract compiler + repo policy engine + generated documentation/reporting**

### 1. Canonical source layer

This is the smallest set of files allowed to be truth.

It owns:

* requirements and decisions
* glossary and naming
* contracts/models for shared public structures
* verification intent
* operational intent

The current repo already has structured source artifacts, metadata validation, relation policies, terminology checks via DOMAINTREE, manifest freshness checks, and strict markdown policy. Keep that discipline.

### 2. Contract compiler layer

This becomes native.

It owns:

* canonical semantic model
* stable IR
* importers from existing standards
* emitters to languages/standards/docs
* capability maps
* semantic loss reporting
* compatibility diff/break/impact logic
* runtime validators and contract tests

This is the part the RFC defines well and the current repo does not yet own natively.

### 3. Repo policy engine

This is how the system becomes anti-mess instead of nice docs.

It enforces:

* no freeform markdown as canonical truth
* no duplicate public types/contracts outside approved locations
* no public contract without docs/owner/examples
* no forbidden aliases
* no stale generated artifacts
* no merge if checks fail

The current repo already has `check`, `generate`, `report`, `doctor`, and `install-gates`, plus optional `noslop` integration. Keep those, but make them operate on the native contract graph rather than just wrapping external commands.

### 4. Generated views

Humans consume projections, not raw truth.

Generate:

* markdown docs
* TOON views if useful
* traceability matrix
* coverage matrix
* impact matrix
* defect/risk reports
* interface docs
* changelogs
* consumer impact summaries

This is already a strength in the repo and should remain one.

## Non-negotiable invariants

These must be mandatory in every repo using agent-docs:

1. **One canonical source of truth for shared/public models and contracts**
2. **Generated docs, not hand-maintained duplicate docs**
3. **Glossary with aliases and forbidden aliases**
4. **Compatibility checks and impact analysis for contract changes**
5. **Generated artifact freshness checks**
6. **Hook/CI enforcement**
7. **No silent semantic loss during generation**

These are the actual anti-mess guarantees. They come directly from the strongest parts of the current repo and the RFC.

## What is optional

Everything else should be opt-in through profiles or packs.

Examples:

* product/requirements pack
* architecture/decision pack
* testing/verification pack
* operations/runbook pack
* service/API profile
* event/messaging profile
* frontend/HCI profile
* data/migration profile
* language emitter packs
* importer packs

That gives breadth without bloating the core.

## Canonical artifact model

Reduce the repos many artifact kinds into a smaller conceptual core.

### Canonical source kinds

* **Requirement**
* **Decision**
* **Contract**
* **Verification**
* **Operation**
* **Glossary**
* **Policy**

### Generated or derived views

* PRD
* SRD
* ADR
* INTERFACE docs
* TESTCASE docs
* RUNBOOK docs
* traceability reports
* coverage reports
* impact reports
* defect/risk summaries

The current repo has many built-in kinds like ADR, PRD, SRD, JOURNEY, DOMAINTREE, POLICY, TESTCASE, DEFECT, RISK, INTERFACE, COMPONENT, RUNBOOK, and DECISION. That is useful, but they should no longer all be treated as equally primary.

## Contract model

The native contract core should follow the RFC:

* small semantic core
* target-specific traits
* stable serializable diffable IR
* importers first
* emitters second
* capability model
* loss reports
* compatibility engine
* runtime validators
* glossary governance

The RFCs proposed core nodes, trait model, IR properties, importer/emitter plan, capability map, loss-report format, compatibility classes, and glossary rules are the right foundation.

## CLI definition

Keep one umbrella CLI: `agent-docs`.

### Core commands

* `agent-docs init`
* `agent-docs check`
* `agent-docs generate`
* `agent-docs report`
* `agent-docs doctor`
* `agent-docs install-gates`

These already exist and should stay.

### Native contract commands

* `agent-docs contract import <source-type> <path>`
* `agent-docs contract emit <target> <contracts-path>`
* `agent-docs contract diff`
* `agent-docs contract break-check`
* `agent-docs contract impact`
* `agent-docs contract docs`
* `agent-docs contract doctor`

These should stop being shell-outs and become first-class, matching the RFCs proposed CLI surface and compatibility engine.

### Policy/quality commands

* `agent-docs lint glossary`
* `agent-docs lint duplicates`
* `agent-docs lint freshness`
* `agent-docs verify traceability`
* `agent-docs verify runtime`
* `agent-docs verify examples`

## Repo layout

Use a repo structure like this:

```text
.agent-docs/
  config.json
  manifest.json
  reports/
  policies/
  glossary/
  hooks/

docs-src/
  requirements/
  decisions/
  verification/
  operations/

contracts/
  domain/
  services/
  events/
  policies/

generated/
  docs/
  openapi/
  json-schema/
  typescript/
  csharp/
  reports/

tools/
  cli/
  core-ir/
  compat-engine/
  importers/
  emitters/
  policy-engine/
```

This is basically the current artifact/governance layout plus the RFCs contract-oriented structure merged into one system.

## How it works in practice

Agent loop:

1. agent reads repo index, glossary, policies, and relevant contracts
2. agent proposes changes
3. agent-docs checks whether the concept already exists
4. agent-docs blocks duplicate public structures or forbidden naming
5. agent-docs regenerates docs/bindings/validators
6. agent-docs runs compatibility, freshness, and traceability checks
7. noslop enforces code quality and repo boundaries
8. CI rejects drift

That is the combined anti-mess system you want.

## Relationship to noslop

Define the split cleanly:

* **agent-docs** controls truth, structure, contracts, docs, and repo-level semantic governance
* **noslop** controls coding discipline, quality gates, protected paths, and low-level repo hygiene

Together they form the impossible to be messy stack.

## Final definition

Use this as the official statement:

**agent-docs is an agentic repository control system that makes a minimal structured source of truth authoritative, compiles shared contracts and models into generated docs and bindings, enforces glossary and compatibility rules, and integrates with repo gates so agent harnesses cannot easily introduce drift, duplication, stale documentation, or uncontrolled public interfaces.**

And the internal design rule should be:

**small mandatory anti-mess core, optional domain packs, generated human views, no silent loss, no duplicate truth.**

That is the clean version.

The next step should be to lock:

* the canonical artifact taxonomy
* the contract IR schema
* the mandatory invariants
* the CLI command surface
* the package split between core, contracts, policy, generators, and profiles
