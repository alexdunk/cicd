# Architecture

## System Context

One deployable unit: an AWS Lambda function (`src/lambda.ts`, bundled by `npm run build`) invoked by an **Application Load Balancer target group** (not API Gateway). It talks to three AWS services:

- **S3** (artifact bucket): build packages, written by clients via presigned PUT URLs, read by the Lambda control plane during deploys.
- **DynamoDB** (single table): build metadata, deployment records, and client credentials (token hashes).
- **Lambda control plane**: `UpdateFunctionCode` against target functions.

```text
CI client ──HTTPS──> ALB ──invoke──> API Lambda ──> DynamoDB (metadata)
   │                                     │────────> Lambda UpdateFunctionCode ──> target fn
   └────────presigned PUT────────────────┼────────> S3 (presign/head only)
                                         S3 <──code fetch── Lambda service
```

Infrastructure is defined with **AWS CDK (TypeScript)** in `infra/` (see [design doc 0004](docs/design-docs/0004-cdk-for-infrastructure.md)).

## Request Pipeline (decorator pattern)

The handler is composed of decorators, each wrapping the next. **The order is defined in exactly one place: `createPipeline()` in `src/http/pipeline.ts`.**

```text
ALB event -> src/http/alb.ts (shape conversion)
  -> withLogging        (request id, request-scoped logger, start/end lines)
    -> withErrorHandling (AppError -> stable JSON error; unknown -> opaque 500)
      -> withAuthorization (bearer token -> SHA-256 lookup -> client on context)
        -> router          (method+pattern dispatch to endpoint handlers)
```

Each decorator is a `(next: Handler) => Handler` in `src/http/decorators/` and is independently tested in `tests/unit/decorators.test.ts`. Endpoint handlers stay thin: parse/validate the body (`src/http/request-schemas.ts`), check scope/allow-list (`src/http/endpoints/authz.ts`), call a service.

## Module Responsibilities

| Path                 | Responsibility                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------- |
| `src/domain/`        | Pure entities and state machines (build, deployment, client, errors). No I/O.            |
| `src/ports/`         | Interfaces over infrastructure (stores, artifacts, function updater, clock, logger).     |
| `src/services/`      | Application logic: build lifecycle, deployment orchestration.                            |
| `src/http/`          | Transport: ALB conversion, decorators, router, schemas, endpoints, pipeline composition. |
| `src/adapters/aws/`  | DynamoDB/S3/Lambda implementations of the ports.                                         |
| `src/adapters/fake/` | In-memory implementations for tests and local dev.                                       |
| `src/observability/` | Structured JSON console logger.                                                          |
| `src/local/`         | Local dev server embedding the pipeline + fakes (incl. fake S3 endpoint).                |
| `src/lambda.ts`      | Production composition root (real AWS adapters).                                         |
| `infra/`             | CDK stack: table, bucket, function, ALB.                                                 |

## Dependency Direction

Inner layers never import outer layers:

```text
domain  <-  ports  <-  services  <-  http  <-  { lambda.ts, local/ }
domain  <-  adapters (implement ports)
```

Rules enforced by `npm run check:architecture` (`.dependency-cruiser.cjs`):

- `src/domain` imports nothing outside `src/domain` (plus Node stdlib);
- `src/ports` imports only `src/domain`;
- `src/services` never imports http/adapters/local;
- `src/http` never imports concrete adapters — dependencies arrive via the `Dependencies` interface;
- `src/adapters` never imports http/services;
- no circular dependencies.

## Composition Roots

Exactly two, both calling the same `createPipeline()`:

- `src/lambda.ts`: real AWS adapters; config from environment variables (fails fast at cold start when missing). **Must never import fakes** (enforced).
- `src/local/dev-server.ts`: fakes only; **must never import `src/adapters/aws`** (enforced). Used by `npm run dev`, `npm run smoke`, and the integration test.

## Data Model

Single DynamoDB table, layout documented in [design doc 0002](docs/design-docs/0002-storage-model.md) and implemented (with zod row validation on read) in `src/adapters/aws/dynamo-stores.ts`.

## Architectural Invariants

- Package bytes never pass through the API (ALB ~1 MB body limit); uploads use presigned S3 URLs.
- Every deployment state change is appended to the deployment's `transitions` list; illegal transitions throw (`src/domain/deployment.ts`).
- Raw bearer tokens are never stored or logged; only SHA-256 hashes are persisted.
- All external input is parsed with zod at the boundary (`src/http/request-schemas.ts` for requests, row schemas for DynamoDB reads).
