# CI/CD Build & Deployment API

An API for CI pipelines and deployment tooling (machine clients only) that does two things:

1. **Upload a build**: register a build, receive a presigned S3 URL, upload the Lambda deployment zip directly to S3, and confirm completion.
2. **Deploy a build**: point a target AWS Lambda function at the stored package (`UpdateFunctionCode`), with every state transition recorded and queryable.

Runs as a single AWS Lambda behind an Application Load Balancer target group. Metadata lives in DynamoDB, packages in S3, authentication is per-client bearer tokens (stored as SHA-256 hashes) with scopes and per-function deploy allow-lists.

## Quick Start

```bash
npm ci          # setup (Node 24, see .nvmrc)
npm run dev     # local server with in-memory AWS fakes — no AWS account needed
npm run check   # full verification (format, lint, typecheck, tests, build, guardrails)
```

`npm run dev` prints its base URL and a seeded token (`local-dev-token`). Example:

```bash
curl -s -X POST "$BASE/v1/builds" \
  -H "Authorization: Bearer local-dev-token" \
  -H 'content-type: application/json' \
  -d '{"name":"my-service","gitCommit":"abc1234"}'
```

## API Routes

| Method | Path                              | Requires                               |
| ------ | --------------------------------- | -------------------------------------- |
| GET    | `/healthz`                        | nothing (ALB health check)             |
| POST   | `/v1/builds`                      | `upload` scope                         |
| POST   | `/v1/builds/{buildId}/complete`   | `upload` scope                         |
| GET    | `/v1/builds/{buildId}`            | `upload` scope                         |
| GET    | `/v1/builds`                      | `upload` scope                         |
| POST   | `/v1/deployments`                 | `deploy` scope + allow-listed function |
| GET    | `/v1/deployments/{deploymentId}`  | `deploy` scope                         |
| GET    | `/v1/deployments?function=<name>` | `deploy` scope                         |

Every route except `/healthz` needs `Authorization: Bearer <token>`. Route definitions live in `src/http/endpoints/`; request schemas in `src/http/request-schemas.ts`. The full walkthrough, configuration, and AWS deployment steps are in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Documentation

Start at [AGENTS.md](AGENTS.md) — the concise repository map. It links to product scope, architecture, development, quality, and security docs.

## Infrastructure

Defined with AWS CDK in [`infra/`](infra/): DynamoDB table, artifact bucket, API Lambda, and ALB. `npm run synth` validates it without credentials; deployment is a credentialed manual step documented in [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#deploying-to-aws).
