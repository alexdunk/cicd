# Executable Guardrails

Agents move faster when the repository makes correct paths obvious and incorrect paths fail early. Enforce invariants rather than prescribing every implementation detail.

## Guardrail Priority

Add guardrails in this order:

1. Correctness and data safety.
2. Trust boundaries and authorization.
3. Architecture and dependency direction.
4. Reproducible build and deployment behavior.
5. Reliability and observability.
6. Consistency rules that materially improve future changes.

Do not create a custom linter for a preference that a formatter, compiler, established linter, or simpler design can enforce.

## Boundary Validation

Treat all external data as untrusted, including HTTP requests, files, environment variables, database rows outside the application's control, queue messages, webhook payloads, and third-party SDK responses.

- Parse data into explicit types or schemas at the boundary.
- Reject invalid states with a stable, useful error.
- Keep authorization checks close to protected operations.
- Use parameterized data access and safe output encoding.
- Do not infer undocumented response shapes by probing live data.
- Prefer typed SDKs or checked-in contracts for external systems.

Add negative tests for malformed input and unauthorized access, not only happy-path tests.

## Architecture Enforcement

Choose boundaries that fit the product and can be explained simply. Record allowed dependency direction in `ARCHITECTURE.md`.

Mechanically check high-risk edges with ecosystem tools or small repository scripts:

- prevent dependency cycles;
- forbid inner domain layers from importing UI, transport, or infrastructure layers;
- route cross-cutting services through explicit interfaces;
- keep domain packages from reaching directly into another domain's persistence;
- verify generated clients and schemas are current;
- limit exceptions to a reviewed allowlist with a reason and expiry condition.

Error messages should name the violated rule, the offending edge, the intended dependency path, and the document that explains it.

## Verification Pyramid

Use the cheapest reliable feedback first:

- static checks for formatting, types, imports, and schemas;
- unit tests for domain behavior and edge cases;
- integration tests for storage, external adapters, and process boundaries;
- a small number of end-to-end tests for critical user journeys;
- deployment smoke checks for runtime configuration.

Every production defect should prompt this question: what is the cheapest durable check that would prevent this class of defect? Add that check when its value exceeds its maintenance cost.

Tests must be deterministic and independently runnable. Control time, randomness, network access, and mutable fixtures. A retry may diagnose environmental flakiness; it must not conceal a reproducible failure.

## Local and CI Parity

CI must call the same repository-owned commands agents run locally. The full local verification command should cover all required merge checks except checks that truly require protected infrastructure.

CI should:

- install from lockfiles;
- use pinned runtime and tool versions;
- cache only reproducible artifacts;
- run independent checks in parallel when useful;
- upload concise diagnostic artifacts for failures;
- verify migrations and generated files where applicable;
- fail on undocumented changes to public contracts.

Do not make a remote CI run the first place an agent can discover a normal lint, test, or build failure.

## Agent-Readable Runtime

Make running software inspectable without private dashboards or manual interpretation.

- Emit structured logs with timestamps, severity, operation names, correlation identifiers, and safe context.
- Provide health and readiness checks that distinguish startup, dependency, and configuration failures.
- Expose metrics and traces for critical paths when operational complexity justifies them.
- Provide deterministic fixtures or seed data for common workflows.
- Keep logs and test artifacts scoped to the current run or worktree.
- Document queries or commands that diagnose common failures.

Never log secrets, raw credentials, full authentication tokens, or sensitive user payloads.

## Worktree Isolation

Assume multiple agents may run the repository simultaneously in separate git worktrees.

- Allow ports to be assigned or overridden.
- Namespace containers, databases, queues, caches, volumes, and temporary paths.
- Avoid global process names and unscoped cleanup commands.
- Do not write runtime state into tracked source directories.
- Make setup and teardown idempotent.
- Print the selected endpoints and resource names at startup.

A worktree should be disposable: deleting it must not damage another task's environment.

## Failure Message Standard

A guardrail failure is part of the agent interface. It should answer:

1. What failed?
2. Where did it fail?
3. Which invariant was violated?
4. What is the likely correction?
5. Which command reruns the focused check?
6. Where is the deeper documentation?

Prefer:

> `orders/domain` imports `orders/http`, which reverses the allowed dependency direction. Move the shared type into `orders/domain` or call the domain through its public service interface. Run `make test-architecture`. See `ARCHITECTURE.md#orders`.

Avoid:

> Invalid dependency.

## Documentation Checks

At minimum, automate:

- internal link validation;
- required knowledge-file presence;
- detection of empty placeholders;
- validation that commands referenced by `AGENTS.md` exist;
- stale generated-document detection;
- active execution-plan structure.

Start small. A clear repository script run by the full verification command is better than an elaborate documentation platform that future agents cannot maintain.
