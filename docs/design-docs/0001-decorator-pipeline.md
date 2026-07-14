# 0001: Decorator Pipeline for the Lambda Handler

- Status: accepted (bootstrap, 2026-07-14)

## Context

The product brief requires the Lambda handler to be composed as a pipeline using the decorator pattern — logger, error handler, authorizer, service router — with each concern independently testable and the composition order explicit in one place.

## Decision

Each concern is a `HandlerDecorator = (next: Handler) => Handler` over a transport-neutral `Handler = (req: ApiRequest, ctx: RequestContext) => Promise<ApiResponse>` (`src/http/types.ts`). ALB event/response shapes are converted at the outermost edge only (`src/http/alb.ts`), so decorators never see ALB specifics and the identical pipeline serves the local dev server.

Order is fixed solely in `createPipeline()` (`src/http/pipeline.ts`): **logging → error handling → authorization → router**.

- Logging outermost: every request, including auth failures, produces start/end log lines with request id, status, duration, and client id.
- Error handling inside logging: error responses still get logged; `AppError` maps to stable JSON codes, anything else to an opaque 500.
- Authorization before routing: no route logic runs unauthenticated (except the `/healthz` allow-list inside the authorizer).
- Router innermost: dispatches on method + `{param}` patterns to endpoint handlers.

Cross-request state travels on `RequestContext`, created fresh per request.

## Alternatives Considered

- **middy** (Lambda middleware framework): adds a dependency and its own middleware semantics for something expressible in ~15 lines of types; rejected to keep decorators plain functions.
- **Express/Fastify behind ALB**: heavier runtime, obscures the ALB event contract, and conflicts with the explicit decorator requirement.

## Consequences and Enforcement

- Decorators are unit-tested in isolation (`tests/unit/decorators.test.ts`); the composition is tested end to end (`tests/unit/api-pipeline.test.ts`, `tests/integration/end-to-end.test.ts`).
- `src/http` cannot import concrete adapters (dependency-cruiser rule `http-does-not-touch-adapters`), keeping the pipeline testable with fakes.
