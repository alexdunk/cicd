# Architecture

## System Context

The API deployable unit is an AWS Lambda function (`src/lambda.ts`, bundled by `npm run build`) invoked through its target group on a **shared Application Load Balancer** (not API Gateway). The public API is mounted at `/cicd` by default; the ALB rewrites the path before invocation, leaving the application's internal `/healthz` and `/v1/*` routes unchanged. The function talks to three AWS services:

- **S3** (artifact bucket): build packages, written by clients via presigned PUT URLs, read by the Lambda control plane during deploys.
- **DynamoDB** (single table): build metadata, deployment records, and client credentials (token hashes).
- **Lambda control plane**: `UpdateFunctionCode` against target functions.

```text
GoDaddy DNS: api.example.com
              │
              ▼
     shared HTTPS ALB listener
       ├── /cicd and /cicd/* --rewrite--> /* --> CI/CD Lambda target group
       ├── /orders and /orders/*         --> future Orders target group
       └── default                       --> fixed 404

CI client ──HTTPS /cicd/*──> shared ALB ──invoke──> API Lambda ──> DynamoDB
   │                                                       │────> Lambda UpdateFunctionCode ──> target fn
   └────────────────presigned PUT──────────────────────────┼────> S3
                                                           S3 <──code fetch── Lambda service
```

Presigned package uploads go from the client directly to S3 and bypass the ALB. Package bytes therefore remain outside the ALB's approximately 1 MB request-body limit.

Infrastructure is defined with **AWS CDK (TypeScript)** in `infra/` (see [design doc 0004](docs/design-docs/0004-cdk-for-infrastructure.md) and [design doc 0005](docs/design-docs/0005-shared-alb-path-routing.md)).

## Infrastructure Ownership and Routing

- `SharedIngressStack` owns the public foundation: VPC, internet-facing ALB, ACM certificate attachment, and one HTTPS listener on port 443. Its unmatched-path action is a fixed 404; it never forwards by default.
- `DeployApiStack` owns the service resources: DynamoDB table, S3 bucket, API Lambda, Lambda target group, and non-default listener rule.
- The default listener rule priority for this API is `100`. Priorities are unique across the shared listener and are allocated in the registry in [design doc 0005](docs/design-docs/0005-shared-alb-path-routing.md).
- The CI/CD rule matches both `/cicd` and `/cicd/*`, then rewrites `^/cicd/?(.*)$` to `/$1`. For example, public `/cicd/healthz` reaches internal `/healthz`, and public `/cicd/v1/builds` reaches internal `/v1/builds`.
- There is no port 80 listener or HTTP fallback. The shared listener requires an issued ACM certificate covering the configured public domain.

The foundation outputs `AlbDnsName`, `HttpsListenerArn`, and `DomainName`. A future API stack imports `HttpsListenerArn`, chooses an unallocated priority, creates its own Lambda target group and prefix rule, and rewrites its external prefix before forwarding. It must not create another ALB, alter the default action, or couple its application router to the external mount path.

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
| `infra/`             | CDK shared-ingress foundation and service stack: data, function, target group, route.    |

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
- `src/local/dev-server.ts`: fakes only; **must never import `src/adapters/aws`** (enforced). Used by `npm run dev` and the integration test.

## Data Model

Single DynamoDB table, layout documented in [design doc 0002](docs/design-docs/0002-storage-model.md) and implemented (with zod row validation on read) in `src/adapters/aws/dynamo-stores.ts`.

## Architectural Invariants

- Package bytes never pass through the API (ALB ~1 MB body limit); uploads use presigned S3 URLs.
- Production ingress is HTTPS-only. External path prefixes are removed at the ALB boundary; internal application routes do not include `/cicd`.
- The shared listener has a fixed 404 default. Every service rule owns one target group, one prefix, and one unique listener priority.
- Every deployment state change is appended to the deployment's `transitions` list; illegal transitions throw (`src/domain/deployment.ts`).
- Raw bearer tokens are never stored or logged; only SHA-256 hashes are persisted.
- All external input is parsed with zod at the boundary (`src/http/request-schemas.ts` for requests, row schemas for DynamoDB reads).
