# Quality

## Test Layers and What Each Proves

| Layer                 | Where                                                 | Proves                                                                                                                                                                |
| --------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain unit tests     | `tests/unit/domain.test.ts`                           | Build/deployment state machines reject illegal transitions; token hashing is deterministic and non-reversible in logs.                                                |
| Decorator unit tests  | `tests/unit/decorators.test.ts`                       | Each pipeline decorator in isolation: request logging, AppError mapping, opaque 500s, bearer-token authentication incl. malformed/missing/unknown tokens.             |
| Router/ALB unit tests | `tests/unit/router.test.ts`, `tests/unit/alb.test.ts` | Route dispatch, path params, 404s; ALB event/response conversion incl. base64 bodies and header normalization.                                                        |
| Pipeline tests        | `tests/unit/api-pipeline.test.ts`                     | Full decorator composition over fakes: happy paths plus 400/401/403/404/409/502 failure paths, allow-list enforcement, no token leakage into logs.                    |
| Integration test      | `tests/integration/end-to-end.test.ts`                | The critical journey over real HTTP against the dev server (same pipeline composition as production): register → upload → complete → deploy → status → history → 401. |

## Required Before Merge

`npm run check` (format, lint, typecheck, tests, build, architecture rules, docs checks) plus `npm run synth`. CI (`.github/workflows/ci.yml`) runs exactly these.

## Evidence (verified 2026-07-14, pre-initial-commit tree)

- `npm run check`: passes end to end; 42 tests across 6 files, 0 failures.
- `npm run synth`: synthesizes the stack without credentials (deprecation warnings from within aws-cdk-lib are expected and harmless).
- Guardrail failure modes exercised intentionally: a forbidden `domain → adapters` import fails `check:architecture` naming the rule and doc; a stale `docs/generated/routes.md` fails `check:docs` with the regeneration command.
- Secret/path hygiene: tracked files contain no credentials and no machine-specific absolute paths (checked via grep during bootstrap).

## Known Gaps

See [exec-plans/tech-debt.md](exec-plans/tech-debt.md) — most relevant to quality: AWS adapters (`src/adapters/aws/*`) are exercised only by the type checker, not by tests against real or emulated AWS; coverage reporting is not wired up (vitest `--coverage` works but no threshold is enforced).
