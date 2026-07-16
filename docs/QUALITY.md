# Quality

## Test Layers and What Each Proves

| Layer                 | Where                                                 | Proves                                                                                                                                                                  |
| --------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain unit tests     | `tests/unit/domain.test.ts`                           | Build/deployment state machines reject illegal transitions; token hashing is deterministic and non-reversible in logs.                                                  |
| Decorator unit tests  | `tests/unit/decorators.test.ts`                       | Each pipeline decorator in isolation: request logging, AppError mapping, opaque 500s, bearer-token authentication incl. malformed/unknown tokens.                       |
| Router/ALB unit tests | `tests/unit/router.test.ts`, `tests/unit/alb.test.ts` | Route dispatch, path params, 404s; ALB event/response conversion incl. base64 bodies and header normalization.                                                          |
| Pipeline tests        | `tests/unit/api-pipeline.test.ts`                     | Full decorator composition over fakes: happy paths plus 400/401/403/404/409/502 failure paths, allow-list enforcement, no token leakage into logs.                      |
| CDK contract tests    | `tests/unit/infra.test.ts`                            | Shared HTTPS ingress ownership and fixed 404; outputs; `/cicd` match/rewrite and priority; `/healthz` target health; no service-owned ALB; retained stateful resources. |
| Integration test      | `tests/integration/end-to-end.test.ts`                | The critical journey over real HTTP against the dev server (same pipeline composition as production): register → upload → complete → deploy → status → history.         |

## Required Before Merge

Run `npm run check`, then synthesize with representative required contexts:

```bash
npm run synth -- \
  -c domainName=api.example.com \
  -c certificateArn=arn:aws:acm:us-east-1:123456789012:certificate/00000000-0000-0000-0000-000000000000
```

`npm run check` covers format, lint, typecheck, tests, build, architecture rules, and docs checks. CDK contract tests assert that production has one shared HTTPS listener, a fixed 404 default, and the service-owned path rewrite while application route tests continue to exercise the unchanged internal `/healthz` and `/v1/*` contract.

## Known Gaps

See [exec-plans/tech-debt.md](exec-plans/tech-debt.md) — most relevant to quality: AWS adapters (`src/adapters/aws/*`) are exercised only by the type checker, not by tests against real or emulated AWS; coverage reporting is not wired up (vitest `--coverage` works but no threshold is enforced).
