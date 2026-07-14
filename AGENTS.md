# CI/CD Build & Deployment API

A TypeScript API for machine clients (CI pipelines): upload a Lambda deployment package via a presigned S3 URL, then deploy it to an approved AWS Lambda function (`UpdateFunctionCode`), with an auditable deployment history. Runs as a single Lambda behind an ALB target group; metadata in DynamoDB, packages in S3.

## Repository Map

| Path                                       | Contents                                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| `src/domain/`                              | Pure entities and state machines (no I/O).                                                              |
| `src/ports/`                               | Interfaces over infrastructure.                                                                         |
| `src/services/`                            | Application logic (build lifecycle, deploy orchestration).                                              |
| `src/http/`                                | Decorator pipeline, router, schemas, endpoints. Composition order lives in `src/http/pipeline.ts` only. |
| `src/adapters/aws/` + `src/adapters/fake/` | Real and in-memory port implementations.                                                                |
| `src/lambda.ts` / `src/local/`             | Production and local composition roots.                                                                 |
| `infra/`                                   | AWS CDK stack (table, bucket, Lambda, ALB).                                                             |
| `tests/`                                   | Unit, pipeline, and integration tests.                                                                  |
| `scripts/`                                 | Build, docs checks, route generation, client provisioning.                                              |
| `docs/`                                    | Knowledge base (see links below).                                                                       |

## Commands

- Setup: `npm ci`
- Develop: `npm run dev` (local server, in-memory fakes, no AWS; prints URL + token)
- Focused tests: `npm test` (or `npm run test:watch`)
- Full verification: `npm run check` — required before merge; CI runs this plus `npm run synth`
- Build Lambda bundle: `npm run build`
- Everything else: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#commands)

## Non-Negotiable Rules

1. Package bytes never pass through the API (ALB ~1 MB limit) — uploads use presigned S3 URLs only.
2. Raw bearer tokens are never stored or logged; only SHA-256 hashes (see `src/domain/client.ts`).
3. Parse all external input with zod at the boundary: requests in `src/http/request-schemas.ts`, DynamoDB rows in the store adapters.
4. Respect dependency direction (domain ← ports ← services ← http ← entrypoints); `npm run check:architecture` enforces it.
5. Every deployment state change goes through `transitionDeployment` so the audit trail stays complete.
6. Regenerate `docs/generated/routes.md` (`npm run generate:routes`) when routes change; update affected docs in the same change.

## Knowledge Base

- Product scope, vocabulary, journeys: [docs/PRODUCT.md](docs/PRODUCT.md)
- Architecture and invariants: [ARCHITECTURE.md](ARCHITECTURE.md)
- Setup, config, troubleshooting, deploy: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)
- Test strategy and evidence: [docs/QUALITY.md](docs/QUALITY.md)
- Auth model, secrets, trust boundaries: [docs/SECURITY.md](docs/SECURITY.md)
- Decisions: [docs/design-docs/INDEX.md](docs/design-docs/INDEX.md) · Specs: [docs/product-specs/INDEX.md](docs/product-specs/INDEX.md)
- Plans: [docs/exec-plans/active/README.md](docs/exec-plans/active/README.md) · Debt: [docs/exec-plans/tech-debt.md](docs/exec-plans/tech-debt.md)
- How to work here (plan → implement → verify → hand off): [docs/agent-bootstrap/OPERATING-LOOP.md](docs/agent-bootstrap/OPERATING-LOOP.md)

## Definition of Done

Acceptance criteria met with tests at the cheapest layer (failure paths included); `npm run check` passes; architecture/security invariants intact; affected docs, specs, and generated files updated in the same change; handoff states what was verified and what remains.
