# Empty Repository Bootstrap

Use this guide to create the smallest complete environment in which future agents can make reliable changes. Build depth-first: establish one working path through setup, application code, verification, and CI before expanding breadth.

## Phase 0: Establish Intent

Inspect the repository and the initiating request before asking questions. Record the answers in `docs/PRODUCT.md`.

Determine:

- the user and the concrete outcome the product must deliver;
- the first end-to-end behavior that proves the product works;
- runtime and deployment targets;
- data sensitivity, authentication needs, and external integrations;
- required language or framework constraints;
- what is explicitly out of scope.

If no stack is specified, propose one conventional stack that fits the product. Explain only decisions with meaningful tradeoffs. Ask for approval when a choice affects product behavior, long-term operations, security, or material cost. Otherwise choose a sensible default and record it.

The first product specification should define observable acceptance criteria, not a feature inventory.

## Phase 1: Create the Reproducible Foundation

Initialize the repository and add:

- a standard source and test layout for the selected ecosystem;
- pinned runtime and tool versions;
- one package manager and its lockfile;
- formatter, linter, typechecker, test runner, and build tooling;
- `.gitignore`, `.editorconfig`, `README.md`, `LICENSE` when known, and an environment-variable example file;
- task entry points such as a `Makefile`, `justfile`, or package scripts;
- CI that installs from the lockfile and runs the same commands used locally.

Expose predictable command contracts:

- install/setup: `make setup` or ecosystem equivalent;
- run locally: `make dev`;
- unit/integration tests: `make test`;
- lint: `make lint`;
- typecheck: `make typecheck`;
- production build: `make build`;
- all required checks: `make check`.

Use names idiomatic to the ecosystem when a task runner would add unnecessary complexity. The final `AGENTS.md` must list exact commands.

Commands must be non-interactive, idempotent where practical, and return nonzero on failure. Local and CI behavior must not silently diverge.

## Phase 2: Build One Walking Skeleton

Implement the thinnest end-to-end slice that exercises the chosen architecture. Depending on the product, this might be:

- request -> boundary validation -> domain logic -> persistence -> response;
- UI action -> API call -> rendered success/error state;
- CLI input -> domain operation -> deterministic output;
- library API -> core implementation -> consumer-level test.

Include:

- typed or schema-validated inputs and outputs;
- explicit error behavior;
- structured logs with useful operation context and no secrets;
- a health check or deterministic smoke test;
- tests at the cheapest layer that proves each important behavior;
- one integration or end-to-end check for the critical path.

Avoid speculative frameworks, generalized plugin systems, or multiple example features. The first slice exists to prove that the harness can build, run, observe, and validate the product.

## Phase 3: Encode Boundaries and Feedback

Define the intended dependency direction in `ARCHITECTURE.md`, then enforce the highest-value rules using available tools. Examples include:

- module boundary or import rules;
- schema validation at network, file, queue, and database boundaries;
- forbidden dependency and cycle checks;
- generated-code drift checks;
- migrations tested against a temporary database;
- file naming, structured logging, and maximum-complexity rules;
- security and dependency scanning appropriate to the stack.

Add checks incrementally. Each check must protect a real invariant and print a remediation-oriented failure message. See `GUARDRAILS.md`.

## Phase 4: Make the Repository Legible

Create the project-specific knowledge map described in `KNOWLEDGE.md`.

Write down:

- product vocabulary and acceptance criteria;
- architecture, package ownership, and dependency direction;
- exact setup and verification commands;
- configuration sources and local-service dependencies;
- trust boundaries and sensitive-data rules;
- quality expectations and known gaps;
- why consequential decisions were made.

Prefer links to focused sources of truth over duplicated explanations. If code or configuration can generate a reference accurately, generate it and mark it as generated.

## Phase 5: Support Isolated Agent Work

Make parallel worktrees safe:

- derive ports and local resource names from configurable values;
- isolate databases, queues, caches, and temporary directories;
- avoid repository-external mutable state;
- provide seed/reset commands for local dependencies;
- ensure cleanup is scoped to the current worktree;
- document any service that cannot be isolated.

If the product has a UI or service runtime, make its behavior directly inspectable through health endpoints, structured logs, deterministic test fixtures, and screenshots or traces where the tooling supports them.

## Phase 6: Prove the Bootstrap

From a clean state:

1. Follow only `README.md` and `docs/DEVELOPMENT.md` to install dependencies.
2. Start the product and run its health or smoke check.
3. Run formatting verification, lint, typecheck, tests, build, and documentation checks.
4. Run CI-equivalent checks locally.
5. Search tracked files for secrets and machine-specific absolute paths.
6. Confirm failures are actionable by intentionally exercising at least one safe validation failure.
7. Update `docs/QUALITY.md` with evidence, gaps, and the date verified.
8. Rewrite root `AGENTS.md` as the concise map for the resulting repository.

Do not claim completion when commands were not run. Record blocked checks, their exact blocker, and the safest next action.

## Avoid

- a giant `AGENTS.md` that duplicates every document;
- placeholder architecture chosen before the first working slice;
- checks that exist only in CI and cannot be reproduced locally;
- hidden setup steps, global machine dependencies, or manually edited generated files;
- broad test suites with no critical-path integration test;
- documentation that states aspirations as if they are implemented;
- retries used to hide deterministic failures or flaky tests;
- adding tools without wiring them into the normal agent feedback loop.
