# Tech Debt

Prioritized; each entry has evidence and a next action. Remove entries when resolved.

## 1. No pagination cursors on list endpoints

- Evidence: `GET /v1/builds` and `GET /v1/deployments?function=` accept `limit` but return no `nextToken`; DynamoDB `Query` results beyond the limit are silently truncated (`src/adapters/aws/dynamo-stores.ts`).
- Next action: add `nextToken` (base64 of `LastEvaluatedKey`) when a consumer needs deep history.

## 2. AWS adapters are untested against real service behavior

- Evidence: `src/adapters/aws/*` is covered by typechecking only; unit/integration tests use fakes. Divergence risk: key layout, presign parameters, `waitUntilFunctionUpdatedV2` behavior.
- Next action: optional integration test against LocalStack or a sandbox account, run manually/nightly, not in the default `npm run check`.

## 3. No dependency vulnerability scanning in CI

- Evidence: `.github/workflows/ci.yml` runs `npm ci` (audit at install) but no explicit scanner or scheduled audit.
- Next action: add a scheduled `npm audit --omit=dev --audit-level=high` job or enable Dependabot.

## 4. Deployment concurrency is unguarded

- Evidence: two simultaneous `POST /v1/deployments` for the same function both call `UpdateFunctionCode`; AWS serializes them (`ResourceConflictException` handled as a failed deployment) but there is no API-level lock or queue.
- Next action: acceptable for now (failure is recorded honestly); if it bites, add a conditional in-progress marker per function in DynamoDB. See docs/design-docs/0003-synchronous-deploys.md.

## Resolved

- **HTTP fallback (resolved 2026-07-16):** the shared ingress now requires `domainName` and `certificateArn`, exposes only an HTTPS listener on port 443, and fails synthesis when either context is missing. Local development remains the no-AWS/no-TLS test environment.
