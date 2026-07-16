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

| Command                                                                  | What it does                                                                                                         |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                                                            | Starts the local dev server (in-memory fakes, no AWS). Prints base URL + token as JSON.                              |
| `npm test`                                                               | Unit + integration tests (vitest), incl. the end-to-end journey test. `npm run test:watch` for watch mode.           |
| `npm run lint`                                                           | ESLint (type-aware).                                                                                                 |
| `npm run typecheck`                                                      | `tsc --noEmit` (strict).                                                                                             |
| `npm run format` / `format:check`                                        | Prettier write / verify.                                                                                             |
| `npm run build`                                                          | Bundles the Lambda handler to `dist/lambda/index.mjs` (esbuild).                                                     |
| `npm run check:architecture`                                             | dependency-cruiser rules from `.dependency-cruiser.cjs`.                                                             |
| `npm run check:docs`                                                     | Required docs exist, links resolve, AGENTS.md commands exist.                                                        |
| `npm run check`                                                          | **Full verification**: format, lint, typecheck, tests, build, architecture, docs. CI runs exactly this plus `synth`. |
| `npm run synth -- -c domainName=api.example.com -c certificateArn=<arn>` | CDK synth of both stacks; needs required contexts but no AWS credentials.                                            |
| `npm run create-client`                                                  | Generates a client token + DynamoDB item; `--write` puts it to a real table.                                         |

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

### CDK context

`infra/app.ts` reads the deployment configuration centrally:

| Context                | Required | Default          | Meaning                                                                         |
| ---------------------- | -------- | ---------------- | ------------------------------------------------------------------------------- |
| `domainName`           | yes      | none             | Public subdomain shared by path-mounted APIs, for example `api.example.com`.    |
| `certificateArn`       | yes      | none             | ARN of an issued ACM certificate in the ALB's AWS Region covering `domainName`. |
| `ingressStackName`     | no       | `SharedIngress`  | Shared VPC, ALB, certificate attachment, and HTTPS listener stack name.         |
| `stackName`            | no       | `DeployApi`      | CI/CD API service stack name.                                                   |
| `pathPrefix`           | no       | `/cicd`          | External mount path; the ALB removes it before invoking the application.        |
| `listenerRulePriority` | no       | `100`            | Unique priority in the shared HTTPS listener registry.                          |
| `deployTargetPrefix`   | no       | `deploy-target-` | Lambda function-name prefix allowed by the API Lambda's IAM policy.             |

`domainName` and `certificateArn` are mandatory for synthesis and deployment. There is no HTTP fallback. Local development remains the supported no-AWS/no-TLS environment.

## Worktree Isolation

All local state is in-memory and per-process; the dev server and tests bind ephemeral ports (`PORT=0`). Parallel git worktrees can run `npm run dev`, `npm test`, and `npm run check` simultaneously without collisions. `dist/` and `cdk.out/` are per-worktree and gitignored.

## Deploying to AWS

Use a public subdomain such as `api.example.com`, not a zone apex. Request and DNS-validate its ACM certificate before running CDK; GoDaddy remains authoritative. The complete copy-pasteable fresh-deployment and existing-environment cutover workflows are in [AWS_DEPLOYMENT_CHECKLIST.md](AWS_DEPLOYMENT_CHECKLIST.md).

For a fresh deployment, after the certificate status is `ISSUED`:

```bash
export DOMAIN_NAME=api.example.com
export CERTIFICATE_ARN=arn:aws:acm:us-east-1:123456789012:certificate/example
export INGRESS_STACK_NAME=SharedIngress
export API_STACK_NAME=DeployApi
export PATH_PREFIX=/cicd
export LISTENER_RULE_PRIORITY=100
export DEPLOY_TARGET_PREFIX=deploy-target-

npm run check
npm run build
npx cdk bootstrap "aws://${CDK_DEFAULT_ACCOUNT}/${AWS_REGION}"
npx cdk deploy --app 'tsx infra/app.ts' --all \
  -c domainName="$DOMAIN_NAME" \
  -c certificateArn="$CERTIFICATE_ARN" \
  -c ingressStackName="$INGRESS_STACK_NAME" \
  -c stackName="$API_STACK_NAME" \
  -c pathPrefix="$PATH_PREFIX" \
  -c listenerRulePriority="$LISTENER_RULE_PRIORITY" \
  -c deployTargetPrefix="$DEPLOY_TARGET_PREFIX"
```

The shared stack outputs `AlbDnsName`, `HttpsListenerArn`, and `DomainName`; the service stack outputs `ApiUrl`, `TableName`, and `ArtifactBucketName`. Create the application CNAME in GoDaddy only after `AlbDnsName` exists. This CNAME is separate from ACM's validation CNAME.

Provision a client and smoke-test through the custom HTTPS base URL:

```bash
TABLE_NAME=<TableName-output> npm run create-client -- \
  --client-id ci-x --scopes upload,deploy --functions deploy-target-x --write
curl -fsS "https://${DOMAIN_NAME}${PATH_PREFIX}/healthz"
```

Application routes remain `/healthz` and `/v1/*`; the ALB maps the public `/cicd/*` paths to them. Package uploads use the returned presigned S3 URL directly and bypass the ALB.

## Troubleshooting

- **Upload to the presigned URL fails locally**: the fake S3 accepts only PUT.
- **401 from every endpoint locally**: the token must match `LOCAL_DEV_TOKEN` (default `local-dev-token`).
- **Cold-start crash `Missing required environment variable`**: deploy via the CDK stack, which sets `TABLE_NAME`/`ARTIFACT_BUCKET`.
- **Deploy recorded as `failed` with `ResourceNotFoundException`**: the target function does not exist (locally: use `demo-function`; deployed: function must exist and match the IAM prefix).
- **Synthesis reports missing `domainName` or `certificateArn`**: pass both required CDK contexts; an HTTPS-only deployment cannot synthesize without them.
- **An unrecognized public path returns 404**: this is the shared listener's fixed default action. Confirm the request includes the configured service prefix.
