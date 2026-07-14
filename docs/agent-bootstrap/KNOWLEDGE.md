# Repository Knowledge System

The repository is the system of record for information an agent needs to make a correct change. Knowledge hidden in chat, tickets, private documents, or a maintainer's memory is unavailable to future runs.

The goal is progressive disclosure: a short map points to focused, durable sources of truth.

## Root `AGENTS.md`

Keep the final root file short enough to scan in one pass. It should contain:

1. A one-paragraph description of the repository.
2. A path map of major applications, packages, infrastructure, and tests.
3. Exact commands for setup, development, focused tests, full verification, and build.
4. The few non-negotiable rules that apply to almost every change.
5. Links to product, architecture, development, quality, and security documents.
6. Links to active execution plans and specialized instructions.
7. A brief definition of done.

Do not place framework tutorials, full style guides, long architecture explanations, or every possible command in `AGENTS.md`. Link to their canonical documents.

When a subtree has materially different commands or constraints, place a scoped `AGENTS.md` in that subtree. It should extend the root map and contain only local guidance.

## Canonical Documents

### `ARCHITECTURE.md`

Describe what exists, not what is hoped for:

- system context and deployable units;
- package or module responsibilities;
- allowed dependency direction;
- critical request and data flows;
- storage and external-service boundaries;
- architectural invariants and where they are enforced;
- links to deeper design decisions.

Keep diagrams text-based and versionable when a diagram materially improves understanding.

### `docs/PRODUCT.md`

Record:

- target users and their desired outcomes;
- product vocabulary;
- current scope and explicit non-goals;
- the critical user journeys;
- measurable acceptance criteria;
- external constraints and unresolved product decisions.

Separate verified behavior from proposals.

### `docs/DEVELOPMENT.md`

Record:

- prerequisites and pinned versions;
- clean-checkout setup;
- all standard commands;
- configuration and secret-loading behavior;
- local dependency startup, seed, reset, and cleanup;
- worktree isolation;
- common failure modes with fixes.

Every command in this document must be copyable and periodically verified.

### `docs/QUALITY.md`

Record:

- test layers and what each proves;
- checks required before merge;
- reliability, performance, and accessibility targets where relevant;
- current coverage or quality evidence;
- known gaps with owners or next actions;
- the date and commit at which claims were last verified.

Do not use an unexplained score. Tie quality claims to commands, reports, tests, or observable outcomes.

### `docs/SECURITY.md`

Record:

- trust boundaries and threat assumptions;
- authentication and authorization model;
- sensitive-data classification and retention;
- input validation and output encoding expectations;
- secret management;
- dependency and vulnerability handling;
- security reporting and incident expectations.

Never include real credentials, tokens, private keys, or exploitable production details.

## Indexed Collections

Use small index files so agents can discover relevant material without reading every document.

### `docs/design-docs/`

Store durable architecture and engineering decisions. Each document should include:

- status: proposed, accepted, superseded, or retired;
- context and problem;
- decision and rationale;
- alternatives considered;
- consequences and enforcement;
- links to superseding or related decisions.

The index should summarize each document in one line and identify its status.

### `docs/product-specs/`

Store observable product behavior. Each specification should include users, scenarios, acceptance criteria, edge cases, and out-of-scope behavior. Link specifications to implementation and tests after they exist.

### `docs/exec-plans/`

Use `active/` for complex work in progress and `completed/` for retained history. Track debt in `tech-debt.md`.

An execution plan should be self-contained enough for a new agent to continue. Include:

- goal and user-visible outcome;
- scope and non-goals;
- relevant repository paths;
- implementation sequence;
- validation commands and acceptance criteria;
- progress checklist;
- decisions, discoveries, and blockers;
- final outcome and follow-up work.

Small, low-risk changes may use a transient plan instead of a checked-in document.

### `docs/generated/`

Store machine-generated references that improve legibility, such as API contracts, database schemas, route inventories, or dependency graphs.

Each generated artifact must identify its source and regeneration command. CI should fail when generated output is stale. Do not hand-edit these files.

## Freshness and Ownership

Documentation changes are part of implementation, not optional follow-up work.

- Update affected docs and examples in the same change as behavior.
- Put a verification date or source link on claims likely to drift.
- Add a lightweight link and structure check to the full verification command.
- Periodically scan for stale commands, dead links, abandoned active plans, duplicated guidance, and behavior that contradicts docs.
- Promote repeatedly missed guidance into an executable check.
- Delete or mark superseded guidance instead of leaving contradictory instructions.

Prefer one authoritative statement with links over copied text. When documents disagree, code and executable tests show current behavior, but the inconsistency is a defect that must be resolved.
