# 0003: Deploys Run Synchronously Within the Request

- Status: accepted (bootstrap, 2026-07-14)

## Context

`POST /v1/deployments` must update the target function's code and record state transitions. The update could run inline or be queued to a worker.

## Decision

The deploy runs inside the request: record `requested`, persist `in_progress`, call `UpdateFunctionCode` and wait (up to 60s) for the function update to settle, then persist `succeeded` (HTTP 201) or `failed` (HTTP 502, with the audit record retained and queryable).

Rationale: `UpdateFunctionCode` for zip packages settles in seconds; the ALB default idle timeout (60s) and the API Lambda timeout (120s) accommodate it. CI clients are already long-polling processes. A queue would add an asynchronous state machine, a worker, and status-polling complexity with no present benefit.

## Alternatives Considered

- **SQS + worker Lambda**: required if deploys become slow (large images, gradual traffic shifting) or bursty; deliberately deferred. The transition model (`requested/in_progress/succeeded/failed`) is already asynchronous-shaped, so a queue can be introduced without changing the API contract or data model.

## Consequences and Enforcement

- The state machine in `src/domain/deployment.ts` rejects illegal transitions and appends every change to `transitions`; unit-tested including the failure path.
- If ALB timeouts are observed on real deploys, revisit this doc (tracked as a risk in docs/exec-plans/tech-debt.md).
