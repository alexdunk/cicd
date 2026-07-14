# Exec Plan 0001: Repository Bootstrap (completed 2026-07-14)

## Goal

Turn the empty template into a working CI/CD build-and-deploy API per the product brief: TypeScript, Lambda behind ALB, decorator pipeline, presigned S3 uploads, DynamoDB metadata, bearer-token auth, local dev without AWS, in-repo IaC.

## Outcome

Delivered in one slice; all verification commands pass (see docs/QUALITY.md for evidence):

- Decorator pipeline (logging → error → auth → router) with the order fixed in `src/http/pipeline.ts`; each decorator unit-tested.
- Full journey implemented and tested: register → presigned upload → complete → deploy (`UpdateFunctionCode`) → status/history, with per-transition audit records.
- Fakes for S3/DynamoDB/Lambda control plane power `npm run dev`, `npm run smoke`, and the integration test; no AWS needed locally; ephemeral ports keep worktrees isolated.
- CDK stack (`infra/`): DynamoDB table + GSI, artifact bucket, API Lambda, ALB target group with `/healthz` health check; `npm run synth` validates in CI.
- Guardrails: dependency-cruiser architecture rules, docs checks (links, required files, command references, generated-route freshness), CI running `npm run check` + synth.

## Decisions Made (recorded as design docs 0001–0004)

Decorator pipeline shape; single-table DynamoDB layout; synchronous deploys; CDK for infrastructure. Conventional defaults chosen without escalation: 90-day artifact retention, 15-minute presign TTL, `deploy-target-` IAM prefix, HTTP fallback listener for cert-less test deploys (flagged in SECURITY.md and tech-debt).

## Follow-Up Work

Tracked in [../tech-debt.md](../tech-debt.md): HTTPS enforcement, pagination cursors, real-AWS adapter tests, vulnerability scanning, deployment concurrency.
