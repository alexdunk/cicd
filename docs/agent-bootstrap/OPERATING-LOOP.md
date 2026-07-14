# Agent Operating Loop

The harness is successful when an agent can move from intent to a verified change using repository-local context and tools, escalating only decisions that require human judgment.

## Change Loop

### 1. Orient

- Read root `AGENTS.md`.
- Inspect the current working tree before changing files.
- Follow links only into the product area, architecture, specification, or plan relevant to the task.
- Identify the narrowest command that validates the current behavior.
- Confirm whether an active execution plan already owns the work.

Do not read the entire knowledge base by default.

### 2. Establish Evidence

For a bug, reproduce the failure before fixing it when practical. For a feature, identify the current behavior and write observable acceptance criteria.

Capture evidence in the cheapest durable form:

- a focused failing test;
- a deterministic command and output;
- a request/response fixture;
- a screenshot, trace, or log query for runtime behavior;
- a concise execution-plan note for a discovery that changes the approach.

Do not implement from an unverified assumption when the repository can provide evidence.

### 3. Plan at the Right Scale

Use a lightweight transient plan for a small, low-risk change.

Create `docs/exec-plans/active/<short-name>.md` when work:

- spans multiple subsystems or deployable units;
- changes architecture, data models, public contracts, security, or deployment;
- requires migrations or coordinated rollout;
- has unresolved technical choices;
- is likely to continue across agent sessions.

Keep checked-in plans current while work proceeds. Record decisions and discoveries, not a diary of routine commands.

### 4. Implement Depth-First

Prefer a thin complete slice over many disconnected partial changes.

- Follow established boundaries and nearby patterns.
- Validate inputs at trust boundaries.
- Include tests and observability with behavior, not as later cleanup.
- Keep generated output generated.
- Avoid unrelated refactoring.
- Update canonical documentation when behavior or commands change.

If progress stalls, ask which capability is missing: context, a tool, a fixture, an abstraction, a check, or a product decision. Improve the harness when the missing capability will recur.

### 5. Verify from Narrow to Broad

Run:

1. the focused check for changed behavior;
2. relevant static and integration checks;
3. the full repository verification command;
4. a build or runtime smoke check when the change can affect packaging, startup, configuration, or deployment.

Inspect logs and artifacts, not only exit codes. Report any check that could not run and why.

### 6. Review the Result

Review the diff as a skeptical maintainer:

- Does it meet each acceptance criterion?
- Are failure and authorization paths covered?
- Did it violate dependency direction or duplicate an existing abstraction?
- Are logs safe and useful?
- Are configuration, migrations, and deployment behavior reversible or compatible?
- Did documentation become stale?
- Is the change legible to the next agent?

Use additional specialized agent reviews for security, performance, migrations, or user-interface behavior when risk warrants them. Resolve concrete findings and rerun affected checks.

### 7. Hand Off

Summarize:

- the user-visible outcome;
- important implementation or design decisions;
- exact verification performed;
- risks, blocked checks, migrations, or follow-up work.

Move a completed execution plan to `docs/exec-plans/completed/` and record its outcome. Do not hide unfinished work inside a completed plan.

## Human Escalation

Escalate when a decision:

- changes product scope or user-visible behavior without clear acceptance criteria;
- creates a new security, privacy, compliance, or data-retention posture;
- incurs material recurring cost or vendor lock-in;
- requires production credentials, destructive data changes, or irreversible infrastructure actions;
- has multiple valid architectural choices with meaningfully different long-term consequences;
- conflicts with repository sources of truth and cannot be resolved from evidence.

Present the evidence, the smallest set of viable options, and a recommendation. Do not escalate routine implementation choices already bounded by repository conventions.

## Continuous Harness Improvement

Treat repeated agent failure as a harness defect.

When the same issue recurs:

1. Correct the immediate problem.
2. Identify the missing or ambiguous capability.
3. Put durable context in the canonical document.
4. Add a mechanical check when the rule is objective and valuable.
5. Add a fixture, command, or diagnostic path when validation was difficult.
6. Remove duplicated or superseded guidance.

The preferred progression is:

`tribal knowledge -> repository documentation -> executable check -> automatic remediation`

Not every preference should become a rule. Promote guidance only when consistency, correctness, security, or future agent legibility justifies the constraint.

## Repository Gardening

Run a periodic maintenance task that searches for:

- stale commands, dead links, and conflicting instructions;
- abandoned active plans and unactionable debt entries;
- architecture exceptions that have outlived their reason;
- flaky or repeatedly retried tests;
- copied helpers and divergent implementations of the same invariant;
- unvalidated external data shapes;
- generated artifacts that drift from their sources;
- quality or security claims without current evidence.

Prefer small targeted repairs that are easy to review. Update `docs/QUALITY.md` with meaningful trends and remaining gaps. The goal is continuous garbage collection, not periodic large cleanup projects.

## Definition of Done for a Change

A change is done when:

- acceptance criteria are satisfied;
- focused and required full checks pass;
- critical failure paths are tested;
- architecture, security, and data invariants remain intact;
- runtime behavior is inspectable;
- relevant docs, specifications, and plans match reality;
- the handoff states what was verified and what remains uncertain.
