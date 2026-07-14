# Spec 0001: Build Upload and Deploy

- Status: implemented and verified (2026-07-14)
- Implementation: `src/http/endpoints/builds.ts`, `src/http/endpoints/deployments.ts`, `src/services/`
- Tests: `tests/integration/end-to-end.test.ts` (journey), `tests/unit/api-pipeline.test.ts` (edge cases), `npm run smoke`

## Users and Scenario

A CI pipeline holds a bearer token with scopes `upload` + `deploy` and an allow-list containing `target-fn`. It has produced `package.zip` for a Lambda function and wants it running on `target-fn`.

## Acceptance Criteria (all verified by tests)

1. `POST /v1/builds` with `{"name":"svc","gitCommit":"abc1234"}` returns **201** with a `build` (status `pending_upload`, `createdBy` = client id) and an `uploadUrl` valid for 15 minutes. Requires scope `upload`.
2. PUT of the package bytes to `uploadUrl` goes directly to S3 (locally: fake S3); the API never receives the bytes.
3. `POST /v1/builds/{buildId}/complete` returns **200** with status `available` and the object's size. If nothing was uploaded: **400** telling the client to upload first. If already completed: **409**.
4. `POST /v1/deployments` with `{"buildId","targetFunction"}`:
   - requires scope `deploy` (**403** otherwise) and `targetFunction` in the client's allow-list (**403** otherwise);
   - **400** if the build is not `available`; **404** if the build does not exist;
   - on success returns **201** with a deployment whose `status` is `succeeded`, `result.codeSha256` set, and `transitions` = `requested → in_progress → succeeded`;
   - if the Lambda API rejects the update, returns **502** with `status` = `failed` and the error message; the record is retained.
5. `GET /v1/deployments/{deploymentId}` returns **200** with the full record including transitions, or **404**.
6. `GET /v1/deployments?function=<name>` returns the function's deployments newest-first (`limit` 1–200, default 50). The `function` parameter is required (**400** otherwise).
7. Any request without a valid token (except `GET /healthz`) returns **401**. Every authenticated request is logged with its `clientId`.

## Edge Cases Covered

Malformed JSON body (400), invalid field values with field-level details (400), unknown routes (404 JSON), duplicate completion (409), deploy of a pending build (400), unknown target function at the control plane (502 + failed record).

## Out of Scope

Rollbacks, aliases/traffic shifting, deleting builds, listing deployments across all functions.
