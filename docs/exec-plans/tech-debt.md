# Tech Debt

Prioritized; each entry has evidence and a next action. Remove entries when resolved.

## 1. HTTP listener without a certificate is possible

- Evidence: `infra/deploy-api-stack.ts` falls back to an HTTP :80 listener when no `certificateArn` context is given; bearer tokens must not cross the internet in cleartext.
- Next action: once a domain/ACM cert exists, pass `-c certificateArn=...`, then make the fallback an error instead of HTTP.

## 2. No pagination cursors on list endpoints

- Evidence: `GET /v1/builds` and `GET /v1/deployments?function=` accept `limit` but return no `nextToken`; DynamoDB `Query` results beyond the limit are silently truncated (`src/adapters/aws/dynamo-stores.ts`).
- Next action: add `nextToken` (base64 of `LastEvaluatedKey`) when a consumer needs deep history.

## 3. AWS adapters are untested against real service behavior

- Evidence: `src/adapters/aws/*` is covered by typechecking only; unit/integration tests use fakes. Divergence risk: key layout, presign parameters, `waitUntilFunctionUpdatedV2` behavior.
- Next action: optional integration test against LocalStack or a sandbox account, run manually/nightly, not in the default `npm run check`.

## 4. No dependency vulnerability scanning in CI

- Evidence: `.github/workflows/ci.yml` runs `npm ci` (audit at install) but no explicit scanner or scheduled audit.
- Next action: add a scheduled `npm audit --omit=dev --audit-level=high` job or enable Dependabot.

## 5. Deployment concurrency is unguarded

- Evidence: two simultaneous `POST /v1/deployments` for the same function both call `UpdateFunctionCode`; AWS serializes them (`ResourceConflictException` handled as a failed deployment) but there is no API-level lock or queue.
- Next action: acceptable for now (failure is recorded honestly); if it bites, add a conditional in-progress marker per function in DynamoDB. See docs/design-docs/0003-synchronous-deploys.md.
