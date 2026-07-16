# Plan 001: Remove test and documentation ceremony

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the "STOP conditions" section occurs, stop and report — do not improvise. When done, update the status row for this plan in `plans/README.md` unless a reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat edc0bc4..HEAD -- tests/helpers/test-harness.ts tests/unit/api-pipeline.test.ts tests/unit/decorators.test.ts tests/unit/router.test.ts tests/integration/end-to-end.test.ts src/http/pipeline.ts src/http/router.ts src/local/dev-server.ts docs/QUALITY.md docs/exec-plans/completed/0001-bootstrap.md docs/exec-plans/completed/0002-shared-alb-path-routing.md`
>
> If any in-scope file changed since this plan was written, compare the "Current state" excerpts against the live code before proceeding. On a material mismatch, STOP and report.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests / tech-debt / docs
- **Planned at**: commit `edc0bc4`, 2026-07-16

## Why this matters

This small API has accumulated more repository ceremony than product code needs: a shared test harness whose main factory has one consumer, duplicated assertions across test layers, and a 517-line completed execution plan that remains in the active documentation graph. The refactor should remove ownership indirection and stale process history without flattening production boundaries that protect authentication, direct-to-S3 upload, deployment audit history, ALB conversion, or infrastructure retention. Prefer a few duplicated test-only fixture lines over a shared abstraction that hides ownership.

## Current state

- `tests/helpers/test-harness.ts:1-96` mixes three concerns:
  - deterministic clock and ID fixtures;
  - a capturing logger used by decorator and router tests;
  - `createHarness()`, a complete fake pipeline factory imported only by `tests/unit/api-pipeline.test.ts`.
- `tests/unit/api-pipeline.test.ts:3` imports `createHarness`, `KNOWN_FUNCTION`, and `UPLOAD_ONLY_TOKEN`. Its `registerAvailableBuild()` helper deliberately places bytes in the fake artifact store because direct HTTP PUT behavior is covered by the integration test.
- `tests/unit/decorators.test.ts:14` imports `captureLogger`, `testIds`, and `CapturedLog` from the harness. Two tests duplicate stronger pipeline contracts:
  - `:84-87` repeats unauthenticated `/healthz`;
  - `:90-93` repeats missing-header `401`.
- `tests/unit/router.test.ts:5,11` imports the full capturing logger helper only to provide an unused `RequestContext.logger`.
- `tests/integration/end-to-end.test.ts:89-93` repeats the exact transition array already checked in domain and pipeline tests. Its `:96-105` unknown-token and health tests repeat cheaper layers; the unique integration value is the real HTTP journey and direct PUT to the fake presigned URL at `:40-88`.
- `src/http/pipeline.ts:30` exports `Pipeline`, but no other module imports the type.
- `src/http/router.ts:4` exports `RouteHandler`, but it is only used by the local `Route` interface.
- `src/local/dev-server.ts:38` casts `LOG_LEVEL` as `never`, while `src/lambda.ts:17,41` uses the existing `LogLevel` type.
- `docs/QUALITY.md:26-31` contains a dated manual snapshot claiming 42 tests across 6 files; the current suite has 55 tests across 7 files.
- `docs/QUALITY.md:12` claims the integration test includes a `401`; after deduplication, authentication remains covered by decorator and pipeline tests.
- `docs/exec-plans/completed/0001-bootstrap.md:13,15,19` refers to removed `npm run smoke`, removed generated-route checks, and superseded HTTP fallback behavior.
- `docs/exec-plans/completed/0002-shared-alb-path-routing.md` is 517 lines of executor instructions, current-state excerpts, and logs for already-completed work. The durable architecture decision is already recorded in `docs/design-docs/0005-shared-alb-path-routing.md`.

Applicable repository conventions:

- TypeScript is strict ESM with `.ts` import suffixes; match surrounding files.
- External request and DynamoDB data validation stays in zod schemas.
- Dependency direction remains `domain ← ports ← services ← http ← entrypoints`.
- Every deployment state change continues through `transitionDeployment`.
- Tests use Vitest and should assert observable contracts at the cheapest useful layer.
- Prettier owns formatting; do not hand-align generated formatting.

## Commands you will need

| Purpose                     | Command                                                                                                                                    | Expected on success                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Install in a fresh worktree | `npm ci`                                                                                                                                   | exit 0                                                                            |
| Focused tests               | `npm test -- tests/unit/api-pipeline.test.ts tests/unit/decorators.test.ts tests/unit/router.test.ts tests/integration/end-to-end.test.ts` | exit 0; all selected tests pass                                                   |
| Full verification           | `npm run check`                                                                                                                            | exit 0; format, lint, typecheck, tests, build, architecture, and docs checks pass |
| Scope review                | `git status --short`                                                                                                                       | only in-scope files are changed, plus deletion of `tests/helpers/test-harness.ts` |

## Scope

**In scope** (the only files the executor may modify):

- `tests/helpers/test-harness.ts` (delete)
- `tests/unit/api-pipeline.test.ts`
- `tests/unit/decorators.test.ts`
- `tests/unit/router.test.ts`
- `tests/integration/end-to-end.test.ts`
- `src/http/pipeline.ts`
- `src/http/router.ts`
- `src/local/dev-server.ts`
- `docs/QUALITY.md`
- `docs/exec-plans/completed/0001-bootstrap.md`
- `docs/exec-plans/completed/0002-shared-alb-path-routing.md`

**Out of scope** (do not touch):

- Production route behavior, response shapes, authorization rules, and request schemas.
- Domain state machines, service orchestration, ports, adapters, and infrastructure.
- `tests/unit/domain.test.ts`, `tests/unit/alb.test.ts`, and `tests/unit/infra.test.ts`.
- `scripts/check-docs.ts`, dependency-cruiser configuration, package scripts, and dependencies.
- Design docs and product specs; they remain the durable records of behavior and decisions.
- Any new shared fake-dependency or logger abstraction. The goal is deletion and colocation, not replacement indirection.

## Git workflow

- Work on the isolated executor branch created for this plan.
- Make one logical commit using the repository's imperative style, for example: `Remove test and documentation ceremony`.
- Do not push, merge, or open a pull request.

## Steps

### Step 1: Colocate the pipeline harness with its sole consumer

Move the complete behavior of `createHarness()` from `tests/helpers/test-harness.ts` into `tests/unit/api-pipeline.test.ts` above `registerAvailableBuild()`. Move these values and helpers with it:

- deterministic `testClock()`;
- deterministic `testIds()`;
- local `CapturedLog` and `captureLogger`;
- `TEST_TOKEN`, `UPLOAD_ONLY_TOKEN`, and `KNOWN_FUNCTION`;
- fake stores, fake artifact store, fake function updater, seeded clients, dependency wiring, default authenticated `send()`.

Keep all moved symbols module-private. Import the required fake adapters, domain types/functions, pipeline types, HTTP request type, and logger types directly from `src/`.

Do not introduce a new shared fixture file or a `createFakeDependencies()` production abstraction. Keep `registerAvailableBuild()` as the readable three-step pipeline setup that deliberately bypasses HTTP upload transport.

**Verify**: `npm test -- tests/unit/api-pipeline.test.ts` → exit 0; every pipeline test passes.

### Step 2: Make decorator and router fixtures local, then delete the harness module

In `tests/unit/decorators.test.ts`, define the small local fixtures it actually needs:

- local `CapturedLog`;
- local recursive `captureLogger()` preserving bound-field merge behavior;
- local deterministic `testIds()`.

In `tests/unit/router.test.ts`, replace `captureLogger([])` with a module-local no-op logger object implementing `log()` and `with()`. It must return itself from `with()` and must not capture unused data.

Delete `tests/helpers/test-harness.ts`. Confirm no import or content reference to `test-harness` remains.

**Verify**: `npm test -- tests/unit/api-pipeline.test.ts tests/unit/decorators.test.ts tests/unit/router.test.ts` → exit 0; all selected tests pass.

### Step 3: Remove only assertions duplicated by stronger layers

Delete these two complete decorator tests:

- `lets /healthz through without a token`;
- `rejects a missing Authorization header with 401`.

Keep decorator tests for malformed and unknown bearer tokens, successful client attachment, request logging, stable `AppError` mapping, and opaque unexpected errors. These protect distinct parsing, context, observability, and secrecy behavior.

In `tests/integration/end-to-end.test.ts`:

- keep the single full HTTP register → direct PUT → complete → deploy → status → history journey;
- remove the exact `requested → in_progress → succeeded` transition-array assertion from the history section, while retaining the assertion that history contains the new deployment ID;
- delete the standalone unknown-token test;
- delete the standalone health-check test.

Do not delete or weaken:

- direct PUT to the returned upload URL;
- failed deployment persistence;
- token non-leakage in logs;
- malformed bearer handling;
- opaque `500` behavior;
- domain transition tests;
- ALB or infrastructure tests.

The complete suite should decrease from 55 tests to 51 tests.

**Verify**: `npm test -- tests/unit/api-pipeline.test.ts tests/unit/decorators.test.ts tests/integration/end-to-end.test.ts` → exit 0; selected tests pass.

### Step 4: Remove tiny dead TypeScript surface

- In `src/http/pipeline.ts`, make `Pipeline` module-private by removing only its `export` keyword. Keep the named type and the explicit `createPipeline()` return type.
- In `src/http/router.ts`, make `RouteHandler` module-private by removing only its `export` keyword. Keep `Route` exported because endpoint modules consume it.
- In `src/local/dev-server.ts`, import `LogLevel` from `src/ports/logger.ts` and replace the `as never` cast with the same `as LogLevel` approach used by `src/lambda.ts`.

Do not change runtime behavior or add environment parsing in this plan.

**Verify**: `npm run typecheck` → exit 0 with no errors.

### Step 5: Replace stale historical documentation with concise outcomes

In `docs/QUALITY.md`:

- update the integration-test layer description so it no longer claims the E2E file proves `401`;
- delete the dated `## Evidence` section and its manual test counts, historical synth note, and one-time bootstrap checks;
- keep `Required Before Merge` and `Known Gaps`.

In `docs/exec-plans/completed/0001-bootstrap.md`:

- remove `npm run smoke`;
- remove the claim that generated-route freshness is checked;
- rewrite the superseded HTTP-fallback sentence as historical context or remove it; the current HTTPS-only decision is recorded elsewhere.

Replace `docs/exec-plans/completed/0002-shared-alb-path-routing.md` with a concise completed outcome record of roughly 20-40 lines containing:

- title and completion date;
- goal;
- outcome: shared ingress ownership, HTTPS-only listener, `/cicd` match/rewrite, fixed 404 default, service-owned target group/rule, retained stateful resources;
- verification summary: `npm run check` and representative-context synth passed when completed;
- durable decision link to `../../design-docs/0005-shared-alb-path-routing.md`;
- operator runbook link to `../../AWS_DEPLOYMENT_CHECKLIST.md`.

Do not retain executor instructions, old code excerpts, command logs, drift checks, or step-by-step implementation history. Git history preserves those details.

**Verify**: `npm run check:docs` → exit 0 and prints `check:docs OK`.

### Step 6: Format and run the complete gate

Run Prettier only on the in-scope files that still exist:

`npx prettier --write tests/unit/api-pipeline.test.ts tests/unit/decorators.test.ts tests/unit/router.test.ts tests/integration/end-to-end.test.ts src/http/pipeline.ts src/http/router.ts src/local/dev-server.ts docs/QUALITY.md docs/exec-plans/completed/0001-bootstrap.md docs/exec-plans/completed/0002-shared-alb-path-routing.md`

Then run the complete repository gate.

**Verify**: `npm run check` → exit 0.

Review `git status --short` and `git diff --stat`. No file outside Scope may be changed.

## Test plan

- No new tests are required; this is a behavior-preserving ownership and deduplication refactor.
- Existing pipeline tests remain the HTTP-contract coverage for unauthenticated health and missing-token `401`.
- Existing decorator tests remain the focused coverage for malformed/unknown bearer tokens, successful context attachment, logging, error mapping, and opaque `500`.
- The integration test remains the only proof that bytes PUT to the returned upload URL bypass API endpoints.
- Domain, ALB, and infrastructure suites remain unchanged.
- Verification:
  - focused test commands after Steps 1-3 all exit 0;
  - complete suite reports 51 passing tests;
  - `npm run check` exits 0.

## Done criteria

- [ ] `tests/helpers/test-harness.ts` is deleted.
- [ ] `rg "test-harness" tests src` returns no matches.
- [ ] `createHarness`, deterministic pipeline fixtures, and fixture constants are module-private in `tests/unit/api-pipeline.test.ts`.
- [ ] Decorator and router tests use only local logger/ID fixtures.
- [ ] The suite has 51 passing tests; direct-upload, malformed-auth, opaque-500, token-secrecy, failed-deployment-audit, ALB, and infrastructure coverage remain.
- [ ] `Pipeline` and `RouteHandler` are no longer exported.
- [ ] `src/local/dev-server.ts` no longer contains `as never`.
- [ ] The completed shared-ALB plan is 20-40 lines and links to the durable decision and runbook.
- [ ] `docs/QUALITY.md` contains no dated test-count snapshot.
- [ ] `rg "npm run smoke|generated-route freshness|42 tests across 6 files|as never" docs src tests` returns no matches.
- [ ] `npm run check` exits 0.
- [ ] `git status --short` lists only in-scope changes.

## STOP conditions

Stop and report; do not improvise if:

- The drift check shows material changes to any in-scope file after `edc0bc4`.
- Removing a listed duplicate test causes a behavior to have no remaining coverage at any layer.
- Deleting the harness requires changing production APIs or introducing a new shared production abstraction.
- The integration journey no longer performs a real HTTP PUT to the returned upload URL.
- A focused verification or `npm run check` fails twice after a reasonable in-scope correction.
- Completing the work requires changing any out-of-scope file.

## Maintenance notes

- Future test helpers should be shared only after at least two test files need the same non-trivial behavior; one-consumer factories belong beside their consumer.
- Completed execution plans should retain concise outcomes and durable links, not implementation transcripts. Git history is the detailed archive.
- Reviewers should scrutinize that no security/audit assertions were deleted under the label of duplication and that the integration journey still proves direct upload.
- Production services, ports, decorators, zod boundaries, dependency-cruiser rules, and infrastructure tests were deliberately left unchanged because they encode real boundaries rather than ceremony.
