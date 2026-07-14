# Development

## Prerequisites

- Node.js 24 (`.nvmrc`; anything satisfying `engines.node >= 22` works).
- npm (lockfile is `package-lock.json`).
- No Docker, no AWS account, and no other global tools are required for local work.

## Setup

```bash
npm ci
```

## Commands

| Command                           | What it does                                                                                                         |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                     | Starts the local dev server (in-memory fakes, no AWS). Prints base URL + token as JSON.                              |
| `npm test`                        | Unit + integration tests (vitest), incl. the end-to-end journey test. `npm run test:watch` for watch mode.           |
| `npm run lint`                    | ESLint (type-aware).                                                                                                 |
| `npm run typecheck`               | `tsc --noEmit` (strict).                                                                                             |
| `npm run format` / `format:check` | Prettier write / verify.                                                                                             |
| `npm run build`                   | Bundles the Lambda handler to `dist/lambda/index.mjs` (esbuild).                                                     |
| `npm run check:architecture`      | dependency-cruiser rules from `.dependency-cruiser.cjs`.                                                             |
| `npm run check:docs`              | Required docs exist, links resolve, AGENTS.md commands exist, route inventory fresh.                                 |
| `npm run generate:routes`         | Regenerates `docs/generated/routes.md` from route definitions.                                                       |
| `npm run check`                   | **Full verification**: format, lint, typecheck, tests, build, architecture, docs. CI runs exactly this plus `synth`. |
| `npm run synth`                   | CDK synth of `infra/` (validates infrastructure code; needs no credentials).                                         |
| `npm run create-client`           | Generates a client token + DynamoDB item; `--write` puts it to a real table.                                         |

## Local Development

`npm run dev` runs everything in one process with no AWS access:

- the exact production pipeline composition (`createPipeline`);
- in-memory DynamoDB-equivalent stores;
- a fake S3 at `/_fake-s3/*` that accepts the presigned-style PUTs the API hands out;
- a fake Lambda control plane knowing two functions: `demo-function`, `orders-service` (deploying to anything else records a failed deployment, mirroring AWS).

A dev client is seeded at startup: token `local-dev-token` (override with `LOCAL_DEV_TOKEN`), scopes `upload`+`deploy`, allow-list = the two fake functions.

Walk the journey manually (get `baseUrl` from the startup line):

```bash
curl -s $BASE/healthz
curl -s -X POST $BASE/v1/builds -H "Authorization: Bearer local-dev-token" \
  -H 'content-type: application/json' -d '{"name":"my-service","gitCommit":"abc1234"}'
# PUT any bytes to the returned uploadUrl, then:
curl -s -X POST $BASE/v1/builds/<buildId>/complete -H "Authorization: Bearer local-dev-token"
curl -s -X POST $BASE/v1/deployments -H "Authorization: Bearer local-dev-token" \
  -H 'content-type: application/json' -d '{"buildId":"<buildId>","targetFunction":"demo-function"}'
```

## Configuration

| Variable          | Where    | Meaning                                                                      |
| ----------------- | -------- | ---------------------------------------------------------------------------- |
| `PORT`            | local    | Dev-server port. Default `0` = ephemeral (worktree-safe).                    |
| `LOCAL_DEV_TOKEN` | local    | Seeded dev bearer token. Default `local-dev-token`.                          |
| `TABLE_NAME`      | deployed | DynamoDB table name; set by the CDK stack. Cold start fails fast if missing. |
| `ARTIFACT_BUCKET` | deployed | S3 bucket for packages; set by the CDK stack.                                |
| `LOG_LEVEL`       | both     | `debug`/`info`/`warn`/`error`; default `info`.                               |

`.env.example` documents the local values. No secrets are committed; there is no `.env` loader — export variables in the shell.

## Worktree Isolation

All local state is in-memory and per-process; the dev server and tests bind ephemeral ports (`PORT=0`). Parallel git worktrees can run `npm run dev`, `npm test`, and `npm run check` simultaneously without collisions. `dist/` and `cdk.out/` are per-worktree and gitignored.

## Deploying to AWS

1. `npm run build` (the stack packages `dist/lambda`).
2. `npx cdk deploy --app 'tsx infra/app.ts'` with AWS credentials. Optional context: `-c certificateArn=...` (HTTPS listener), `-c deployTargetPrefix=...` (IAM bound for deployable functions, default `deploy-target-`), `-c stackName=...`.
3. Provision a client: `TABLE_NAME=<output TableName> npm run create-client -- --client-id ci-x --scopes upload,deploy --functions deploy-target-x --write`.
4. Smoke: `curl <output ApiUrl>/healthz`.

## Troubleshooting

- **Upload to the presigned URL fails locally**: the fake S3 accepts only PUT.
- **401 from every endpoint locally**: the token must match `LOCAL_DEV_TOKEN` (default `local-dev-token`).
- **`check:docs` says routes.md is stale**: run `npm run generate:routes` and commit.
- **Cold-start crash `Missing required environment variable`**: deploy via the CDK stack, which sets `TABLE_NAME`/`ARTIFACT_BUCKET`.
- **Deploy recorded as `failed` with `ResourceNotFoundException`**: the target function does not exist (locally: use `demo-function`; deployed: function must exist and match the IAM prefix).
