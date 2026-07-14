# Security

## Trust Boundaries and Threat Assumptions

- Everything arriving through the ALB is untrusted: headers, bodies, query strings. All request bodies are parsed with zod (`src/http/request-schemas.ts`) before use; unknown routes 404; malformed input gets a 400 with field-level details and no internals.
- DynamoDB rows are validated with zod on read (`src/adapters/aws/dynamo-stores.ts`) because table contents are outside the type system's control.
- Callers are machines (CI pipelines). There is no user-generated HTML, so XSS is out of scope; responses are JSON with `content-type: application/json`.
- The S3 bucket and DynamoDB table are private; the only write path into the bucket for clients is a presigned PUT URL scoped to one object key, valid 15 minutes.

## Authentication and Authorization

- **Authentication**: opaque bearer tokens, one per client. The API stores only the SHA-256 hash (DynamoDB key `CLIENT#<sha256hex>`); a request's token is hashed and looked up by the authorizer decorator (`src/http/decorators/with-authorization.ts`). Raw tokens exist only in the client's secret store and, once, in the output of `npm run create-client`.
- **Authorization** is two-layered, checked next to the protected operation (`src/http/endpoints/authz.ts`):
  - scopes: `upload` (build endpoints) and `deploy` (deployment endpoints);
  - per-client allow-list of deployable target functions.
- IAM provides a third, coarser bound: the API's role may call `UpdateFunctionCode` only on functions matching the `deployTargetPrefix` context value (default `deploy-target-`).
- Every authenticated request logs `clientId`; the deployment record stores `requestedBy`.
- `/healthz` is the only unauthenticated route (ALB health checks).

## Sensitive Data

| Data                                      | Classification | Handling                                                                          |
| ----------------------------------------- | -------------- | --------------------------------------------------------------------------------- |
| Bearer tokens                             | Secret         | Never stored, never logged; SHA-256 hash only. The logger never receives headers. |
| Build packages                            | Customer code  | Private S3 bucket, SSE-S3, TLS enforced, 90-day lifecycle expiry.                 |
| Metadata (names, commits, function names) | Internal       | DynamoDB, retained indefinitely (audit trail).                                    |

Negative test: `tests/unit/api-pipeline.test.ts` asserts logs never contain the bearer token; error-handling tests assert internal error details never reach responses.

## Secret Management

No secrets in the repository (`.env.example` contains only non-secret local defaults; the checked-in `local-dev-token` value is local-only and useless remotely). Client tokens are provisioned with `npm run create-client` and must be stored in the CI system's secret store. Rotation = create a new client item, update the CI secret, delete the old item.

## Transport

The CDK stack serves HTTPS when a `certificateArn` context value is provided, otherwise plain HTTP **for private test environments only**. Bearer tokens must not traverse the public internet over HTTP; providing a certificate is a deployment requirement for production (tracked in [exec-plans/tech-debt.md](exec-plans/tech-debt.md)).

## Dependencies and Vulnerabilities

`npm ci` from the lockfile with exact-pinned versions; `npm audit` at install time (0 known vulnerabilities at bootstrap). No automated scanner is wired into CI yet (tracked in tech-debt).

## Reporting

Repository owner triages security issues; no external reporting program exists for this internal tool.
