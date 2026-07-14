# Product: CI/CD Build & Deployment API

## Users and Outcome

Users are **machine clients**: CI pipelines and deployment tooling. No human-facing UI exists or is planned. The outcome the product delivers: a CI pipeline can publish a Lambda deployment package once and later deploy it to an approved AWS Lambda function with a single API call, with an auditable record of every deployment.

## Vocabulary

| Term            | Meaning                                                                                                                           |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Build           | Metadata record for one Lambda deployment package (zip) stored in S3. Identified by `buildId`.                                    |
| Package         | The zip bytes themselves. Stored only in S3; never passes through the API.                                                        |
| Deployment      | One attempt to update a target Lambda function's code from a build's package. Identified by `deploymentId`.                       |
| Client          | A CI pipeline or tool holding an opaque bearer token, with scopes (`upload`, `deploy`) and an allow-list of deployable functions. |
| Target function | The AWS Lambda function a deployment updates via `UpdateFunctionCode`.                                                            |
| Transition      | A recorded deployment state change: `requested`, `in_progress`, `succeeded`, `failed`.                                            |

## Critical Journey (verified, see spec 0001)

1. `POST /v1/builds` registers a build; the response contains a presigned S3 upload URL (valid 15 minutes).
2. The client PUTs the package to the presigned URL (direct to S3).
3. `POST /v1/builds/{buildId}/complete` confirms the upload; the API verifies the object exists in S3.
4. `POST /v1/deployments` with `buildId` + `targetFunction` updates the target function's code from S3 and records every state transition.
5. `GET /v1/deployments/{deploymentId}` and `GET /v1/deployments?function=<name>` return status and history.

Acceptance criteria live in [product-specs/0001-build-upload-and-deploy.md](product-specs/0001-build-upload-and-deploy.md). The full route list is generated in [generated/routes.md](generated/routes.md).

## Scope and Non-Goals

In scope now: build registration/upload/completion, synchronous deployment to one function, deployment status and per-function history, bearer-token authentication with scopes and target allow-lists.

Explicit non-goals (revisit only with an owner decision):

- rollbacks, canary/gradual traffic shifting, Lambda alias management;
- deploying anything other than Lambda zip packages (no containers, no S3-hosted static sites);
- human login, UI, or token self-service;
- multi-region or cross-account deployments;
- asynchronous/queued deployments (deploys run within the request; see design-docs/0003).

## External Constraints

- Runtime is a single Lambda behind an ALB target group; request/response bodies are limited to ~1 MB, which is why packages go directly to S3 via presigned URLs.
- ALB idle timeout bounds synchronous deploy duration (default 60s; the Lambda waits up to 60s for `UpdateFunctionCode` to settle).
- IAM bounds deployable functions to a name prefix (default `deploy-target-`, configurable via CDK context `deployTargetPrefix`); per-client allow-lists narrow further.

## Unresolved Product Decisions

- Package retention: artifact bucket objects currently expire after 90 days (conventional default, recorded in `infra/deploy-api-stack.ts`). Confirm with the owner if builds must remain deployable for longer.
- Token rotation/revocation workflow is manual (delete/insert the DynamoDB item). Decide whether an admin endpoint is warranted.
