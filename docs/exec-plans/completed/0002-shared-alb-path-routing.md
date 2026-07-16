# Plan 001: Create shared ALB ingress and route the deploy API by path

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the “STOP conditions” section occurs, stop and report—do not improvise. When done, record the outcome in this document and move it from `docs/exec-plans/active/` to `docs/exec-plans/completed/`.
>
> **Drift check (run first)**: `git diff --stat 3e97076..HEAD -- infra tests/unit README.md AGENTS.md ARCHITECTURE.md docs package.json`
> If any in-scope file changed since this plan was written, compare the “Current state” excerpts against the live code before proceeding. On a material mismatch, treat it as a STOP condition.

## Status

- **State**: completed 2026-07-16
- **Priority**: P1
- **Effort**: L (multi-day, including infrastructure tests, migration documentation, and AWS smoke verification)
- **Risk**: HIGH (changes public ingress ownership and replaces the currently dedicated ALB in any deployed environment)
- **Depends on**: none
- **Category**: tech-debt / architecture
- **Planned at**: commit `3e97076`, 2026-07-16

## Why this matters

The intended platform has one public domain and one Application Load Balancer shared by many APIs. Each API is mounted below a unique path such as `/cicd/*`, `/orders/*`, or `/users/*`. The repository currently creates a dedicated VPC, ALB, and listener inside `DeployApiStack`, which makes a one-ALB-per-service topology the default and prevents this API from establishing a reusable shared-ingress contract.

After this plan lands, an initial deployment will create the shared VPC, ALB, HTTPS listener, and the CI/CD API together. The CI/CD API will be reachable at `https://<domain>/cicd/*`. Future API stacks will reuse the listener ARN and add only their own target group, unique rule priority, path condition, and rewrite.

This is an infrastructure and documentation change. The application’s internal route contract remains `/healthz` and `/v1/*`; the ALB removes `/cicd` before invoking the Lambda.

## Decisions and acceptance criteria

The executor must implement these decisions, not reopen them:

1. **One ingress owner**: a new `SharedIngressStack` owns the VPC, internet-facing ALB, ACM certificate attachment, and one HTTPS listener on port 443.
2. **One service owner**: `DeployApiStack` continues to own DynamoDB, S3, the API Lambda, its IAM permissions, a Lambda target group, and the CI/CD listener rule. It must not create a VPC, ALB, certificate, or listener.
3. **Certificate bootstrap with GoDaddy DNS**: the operator requests an ACM public certificate with AWS CLI, creates ACM’s validation CNAME in GoDaddy, waits for `ISSUED`, and passes `certificateArn` to CDK. The foundation stack attaches but does not request the certificate.
4. **HTTPS is mandatory**: remove the production HTTP fallback. Missing `domainName` or `certificateArn` context must fail synthesis with a clear message.
5. **Path mount**: the default external prefix is `/cicd`. The listener rule matches both `/cicd` and `/cicd/*`.
6. **Path rewrite**: the rule rewrites `^/cicd/?(.*)$` to `/$1` before forwarding. Thus `/cicd/healthz` becomes `/healthz`, and `/cicd/v1/builds` becomes `/v1/builds`.
7. **No application prefix coupling**: do not change `src/http/router.ts`, endpoint route definitions, or the local server to know about `/cicd`.
8. **Safe default listener action**: unmatched paths return a fixed JSON or plain-text 404 from the ALB. There is no catch-all forward to this Lambda.
9. **Health checks**: the Lambda target group health check remains enabled at internal path `/healthz`.
10. **Future API contract**: the shared stack outputs at least `AlbDnsName`, `HttpsListenerArn`, and `DomainName`. Documentation assigns and records unique listener-rule priorities; this API defaults to priority `100`.
11. **Stable API output**: `DeployApiStack` outputs `ApiUrl=https://<domain><pathPrefix>`, not the raw ALB hostname.
12. **Initial composition**: `infra/app.ts` instantiates both stacks and passes the shared listener ARN into `DeployApiStack`, creating an explicit CDK dependency through the token reference.
13. **No data migration**: DynamoDB and S3 logical IDs and `RETAIN` policies remain unchanged within the existing deploy API stack so its stateful resources are not replaced.

## Current state

### Relevant files

- `infra/deploy-api-stack.ts` — currently combines shared ingress and service-specific resources in one stack.
- `infra/app.ts` — currently creates only `DeployApiStack` and treats HTTPS as optional.
- `README.md` — describes one API behind an ALB but does not describe a shared path mount.
- `ARCHITECTURE.md` — system context currently shows an ALB without ingress ownership or prefix rewriting.
- `docs/DEVELOPMENT.md` — current deployment command permits HTTP and returns a raw ALB URL.
- `docs/SECURITY.md` — acknowledges HTTP fallback, which this plan removes.
- `docs/AWS_DEPLOYMENT_CHECKLIST.md` — the operator checklist does not currently exist in the working tree; create it for GoDaddy validation, initial shared-ingress deployment, and one shared hostname.
- `docs/design-docs/0004-cdk-for-infrastructure.md` — records CDK but not the shared-ingress ownership decision.
- `tests/unit/` — has transport tests but no infrastructure assertions.

### Evidence excerpts

`infra/deploy-api-stack.ts:12-20` currently assigns every resource to one stack:

```ts
/**
 * All infrastructure for the deploy API: DynamoDB table, artifact bucket,
 * API Lambda, and an ALB whose target group invokes the Lambda directly
 * (no API Gateway).
 */
export class DeployApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
```

`infra/deploy-api-stack.ts:86-107` creates the dedicated network ingress and permits HTTP:

```ts
const vpc = new ec2.Vpc(this, 'Vpc', {
  maxAzs: 2,
  natGateways: 0,
  subnetConfiguration: [{ name: 'public', subnetType: ec2.SubnetType.PUBLIC }],
});

const alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
  vpc,
  internetFacing: true,
});

const certificateArn = this.node.tryGetContext('certificateArn') as string | undefined;
const listener = certificateArn
  ? alb.addListener('Https', {/* certificate */})
  : alb.addListener('Http', { port: 80 });
```

`infra/deploy-api-stack.ts:109-123` makes the API the listener default and outputs the raw ALB hostname:

```ts
listener.addTargets('Api', {
  targets: [new targets.LambdaTarget(apiFunction)],
  healthCheck: {
    enabled: true,
    path: '/healthz',
    interval: cdk.Duration.seconds(60),
    healthyHttpCodes: '200',
  },
});

new cdk.CfnOutput(this, 'ApiUrl', {
  value: `${certificateArn ? 'https' : 'http'}://${alb.loadBalancerDnsName}`,
});
```

`infra/app.ts:8-15` documents the current contexts:

```ts
 * - stackName: override for parallel environments (default DeployApi).
 * - certificateArn: ACM certificate for the HTTPS listener. Without it the
 *   ALB serves plain HTTP, which is acceptable only for private test setups;
 * - deployTargetPrefix: Lambda function-name prefix this API may deploy to
```

`docs/SECURITY.md:34-36` records the transport debt:

```md
## Transport

The CDK stack serves HTTPS when a `certificateArn` context value is provided,
otherwise plain HTTP **for private test environments only**.
```

### Repository conventions to preserve

- Infrastructure remains AWS CDK v2 in TypeScript under `infra/`; see `docs/design-docs/0004-cdk-for-infrastructure.md`.
- Context values are read and documented centrally in `infra/app.ts`.
- Stateful resources use `RemovalPolicy.RETAIN`.
- Lambda target integration uses `aws-elasticloadbalancingv2-targets.LambdaTarget`, which grants invocation permission when bound to the target group.
- External request paths are converted only at the ALB boundary; application layers remain transport-neutral.
- Every public infrastructure or route change updates README and affected knowledge-base documents in the same change.
- Tests use Vitest under `tests/**/*.test.ts` and explicit behavior assertions rather than snapshots.
- Full verification is `npm run check`, followed by `npm run synth`.

## Commands you will need

| Purpose                      | Command                                                                                                         | Expected on success                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Install                      | `npm ci`                                                                                                        | exit 0                                                                       |
| Build Lambda asset           | `npm run build`                                                                                                 | exit 0 and `dist/lambda/index.mjs` exists                                    |
| Focused infrastructure tests | `npm test -- tests/unit/infra.test.ts`                                                                          | all infrastructure tests pass                                                |
| Typecheck                    | `npm run typecheck`                                                                                             | exit 0, no errors                                                            |
| Documentation links          | `npm run check:docs`                                                                                            | prints `check:docs OK`                                                       |
| Full verification            | `npm run check`                                                                                                 | exit 0; format, lint, typecheck, tests, build, architecture, and docs pass   |
| CDK synthesis                | `npm run synth`                                                                                                 | exit 0 and both stacks synthesize                                            |
| Inspect replacements         | `npx cdk diff --app 'tsx infra/app.ts' --all -c domainName="$DOMAIN_NAME" -c certificateArn="$CERTIFICATE_ARN"` | shows the expected ingress split; no DynamoDB table or S3 bucket replacement |

## Scope

**In scope** (the only implementation and documentation files to modify):

- `infra/shared-ingress-stack.ts` (create)
- `infra/deploy-api-stack.ts`
- `infra/app.ts`
- `tests/unit/infra.test.ts` (create)
- `README.md`
- `AGENTS.md`
- `ARCHITECTURE.md`
- `docs/DEVELOPMENT.md`
- `docs/SECURITY.md`
- `docs/QUALITY.md`
- `docs/AWS_DEPLOYMENT_CHECKLIST.md` (create)
- `docs/design-docs/0005-shared-alb-path-routing.md` (create)
- `docs/design-docs/INDEX.md`
- `docs/exec-plans/tech-debt.md`
- `docs/exec-plans/active/0002-shared-alb-path-routing.md` (status and final outcome only)

**Out of scope** (do not touch):

- `src/domain/`, `src/ports/`, `src/services/`, `src/http/`, and `src/adapters/` — application behavior and internal routes do not change.
- Authentication scopes, bearer-token format, client allow-lists, or DynamoDB data layout.
- Target Lambda creation or deployment-package behavior.
- Moving the domain registration from GoDaddy or changing authoritative DNS to Route 53.
- Automatically editing GoDaddy DNS through an API.
- Creating generalized infrastructure constructs for every possible future service; document the integration contract, but implement only the shared ingress and this API.
- WAF, rate limiting, private networking, multi-region ingress, CloudFront, API Gateway, or mutual TLS.
- HTTP-to-HTTPS redirect listener; the stated target is one HTTPS listener. Add this only through a separate approved decision.
- Deploying, destroying, or cutting over real AWS resources without explicit operator authorization.

## Git workflow

- Suggested branch: `advisor/001-shared-alb-path-routing`.
- Recent history uses generic `ship it` messages and does not establish a meaningful convention. Use descriptive commits, for example `Refactor ingress into a shared ALB stack`.
- Keep infrastructure/tests and documentation as reviewable logical commits if practical.
- Do not push, deploy, open a PR, change GoDaddy DNS, or modify real AWS resources unless the operator explicitly instructs it.

## Steps

### Step 1: Add failing infrastructure acceptance tests

Create `tests/unit/infra.test.ts` using `aws-cdk-lib/assertions.Template`. Avoid requiring a pre-existing `dist/lambda` asset by making the deploy stack accept a `lambda.Code` value from its caller; tests will pass `lambda.Code.fromInline(...)`, while `infra/app.ts` passes `lambda.Code.fromAsset('dist/lambda')`.

Write desired-state tests that initially fail and then become the regression suite:

1. `SharedIngressStack` synthesizes exactly one VPC, one internet-facing ALB, and one HTTPS listener.
2. The listener uses the supplied certificate ARN and has a fixed 404 default action.
3. `SharedIngressStack` outputs ALB DNS name, listener ARN, and domain name.
4. `DeployApiStack` synthesizes no VPC, ALB, listener, or ACM certificate.
5. `DeployApiStack` creates a Lambda target group with `/healthz` health checks.
6. Its listener rule matches `/cicd` and `/cicd/*`, has priority 100, forwards to the Lambda target group, and includes a URL rewrite from `^/cicd/?(.*)$` to `/$1`.
7. The API URL output is `https://api.example.com/cicd`.
8. Existing table and bucket properties remain on-demand/private/encrypted/retained as before.

Use exact CloudFormation property assertions for the rule’s `Conditions`, `Actions`, and `Transforms`; do not use a full-template snapshot.

**Verify**: `npm test -- tests/unit/infra.test.ts` → fails only because the new stack/props/rule do not exist yet. Record the failure as the feature baseline.

### Step 2: Create the shared ingress stack

Create `infra/shared-ingress-stack.ts` with an explicit props interface:

```ts
export interface SharedIngressStackProps extends cdk.StackProps {
  readonly certificateArn: string;
  readonly domainName: string;
}
```

The stack must:

- Validate that both strings are non-empty. Validation may live in `infra/app.ts`, but errors must name the missing context value.
- Create the existing minimal VPC shape: two public Availability Zones, no NAT gateways.
- Create one internet-facing ALB.
- Import the issued ACM certificate by ARN.
- Create one HTTPS listener on port 443.
- Give the listener a fixed 404 default action so no service is an accidental catch-all.
- Expose the listener as a public readonly property so the initial CDK app can pass `listener.listenerArn` into the API stack.
- Output `AlbDnsName`, `HttpsListenerArn`, and `DomainName`.
- Keep the security group limited to the listener behavior CDK requires; do not add unrelated ingress ports.

The stack must not create DynamoDB, S3, an application Lambda, or a listener rule.

**Verify**: `npm run typecheck` → exit 0.

### Step 3: Refactor DeployApiStack into a service stack

Change `infra/deploy-api-stack.ts` to remove VPC, ALB, certificate, and listener construction. Introduce explicit props:

```ts
export interface DeployApiStackProps extends cdk.StackProps {
  readonly apiCode: lambda.Code;
  readonly domainName: string;
  readonly listenerArn: string;
  readonly listenerRulePriority: number;
  readonly pathPrefix: string;
  readonly deployTargetPrefix: string;
}
```

Keep the table, bucket, Lambda, grants, IAM deployment boundary, and their construct IDs unchanged. Replace `lambda.Code.fromAsset('dist/lambda')` with `props.apiCode`; `infra/app.ts` becomes responsible for supplying the production asset.

Create an `ApplicationTargetGroup` configured for Lambda targets, add `new targets.LambdaTarget(apiFunction)`, and preserve the `/healthz` health check. Then create a non-default `AWS::ElasticLoadBalancingV2::ListenerRule` targeting `props.listenerArn`.

Use the L1 `elbv2.CfnListenerRule` for the rule because the installed CDK L2 `ApplicationListenerRuleProps` does not expose URL transforms, while `CfnListenerRule` in `aws-cdk-lib` 2.261.0 does expose `transforms`.

The rule shape must be equivalent to:

```ts
new elbv2.CfnListenerRule(this, 'ApiRule', {
  listenerArn: props.listenerArn,
  priority: props.listenerRulePriority,
  conditions: [
    {
      field: 'path-pattern',
      pathPatternConfig: {
        values: [props.pathPrefix, `${props.pathPrefix}/*`],
      },
    },
  ],
  transforms: [
    {
      type: 'url-rewrite',
      urlRewriteConfig: {
        rewrites: [
          {
            regex: `^${escapedPrefix}/?(.*)$`,
            replace: '/$1',
          },
        ],
      },
    },
  ],
  actions: [
    {
      type: 'forward',
      targetGroupArn: apiTargetGroup.targetGroupArn,
    },
  ],
});
```

Do not interpolate an unvalidated arbitrary regex. Validate `pathPrefix` against a deliberately narrow format such as `^/[a-z0-9][a-z0-9-]*$`; then the literal prefix is safe in the rewrite regex. Validate priority as an integer from 1 through 50,000.

Output:

```ts
new cdk.CfnOutput(this, 'ApiUrl', {
  value: `https://${props.domainName}${props.pathPrefix}`,
});
```

Ensure the target group depends on the Lambda permission as required by the CDK Lambda target binding. Do not hand-code a broader `lambda:InvokeFunction` permission if `LambdaTarget` already creates the scoped permission.

**Verify**: `npm test -- tests/unit/infra.test.ts` → all infrastructure tests pass.

### Step 4: Compose both stacks for the initial deployment

Refactor `infra/app.ts` to require and document these context values:

| Context                | Required | Default          | Meaning                                                               |
| ---------------------- | -------- | ---------------- | --------------------------------------------------------------------- |
| `domainName`           | yes      | none             | One public hostname, for example `api.example.com`                    |
| `certificateArn`       | yes      | none             | Issued ACM certificate in the deployment region covering `domainName` |
| `ingressStackName`     | no       | `SharedIngress`  | Foundation stack name                                                 |
| `stackName`            | no       | `DeployApi`      | CI/CD service stack name; preserve current default                    |
| `pathPrefix`           | no       | `/cicd`          | External mount point                                                  |
| `listenerRulePriority` | no       | `100`            | Unique priority on the shared HTTPS listener                          |
| `deployTargetPrefix`   | no       | `deploy-target-` | Existing IAM boundary for deployable Lambda names                     |

Instantiate `SharedIngressStack` first. Instantiate `DeployApiStack` second with:

- `apiCode: lambda.Code.fromAsset('dist/lambda')`
- the domain, prefix, priority, and deploy-target prefix contexts
- `listenerArn: ingress.httpsListener.listenerArn`

Use descriptions that distinguish shared ingress from the CI/CD service. Do not add an “existing ALB mode” to this initial implementation. Future repositories consume the `HttpsListenerArn` output and reproduce the service-stack listener-rule pattern without owning the ALB.

**Verify**: `npm run build && npm run synth` → exit 0 and synthesize two stacks.

### Step 5: Record the architecture decision and operator workflow

Create `docs/design-docs/0005-shared-alb-path-routing.md` with status `accepted`. It must record:

- one domain and one ALB are shared across multiple path-mounted APIs;
- the foundation stack owns VPC/ALB/certificate attachment/listener;
- service stacks own Lambda target groups and listener rules;
- ALB URL transforms remove external prefixes before requests reach services;
- unique listener priorities are a shared operational namespace;
- the certificate is requested and DNS-validated before CDK because GoDaddy remains authoritative;
- future APIs import the listener ARN and must not create another ALB;
- alternatives rejected: per-service ALBs/subdomains, application-aware prefixes, and conditional ownership in every service stack.

Update `docs/design-docs/INDEX.md` and revise `docs/design-docs/0004-cdk-for-infrastructure.md` only enough to point context ownership at the new decision; do not rewrite history.

Update `ARCHITECTURE.md` with a diagram similar to:

```text
GoDaddy DNS: api.example.com
              │
              ▼
     shared HTTPS ALB listener
       ├── /cicd/*  --rewrite--> /* --> CI/CD Lambda target group
       ├── /orders/*             --> future Orders target group
       └── default               --> fixed 404
```

Make clear that S3 presigned uploads continue to bypass the ALB, so the 1 MB request-body invariant remains intact.

**Verify**: `npm run check:docs` → prints `check:docs OK`.

### Step 6: Rewrite deployment documentation for initial shared ingress

Update `README.md`, `AGENTS.md`, `docs/DEVELOPMENT.md`, `docs/SECURITY.md`, `docs/QUALITY.md`, and `docs/exec-plans/tech-debt.md` consistently. Create `docs/AWS_DEPLOYMENT_CHECKLIST.md` as the complete operator runbook.

The AWS checklist must provide an ordered, copy-pasteable workflow:

1. Configure `AWS_PROFILE`, `AWS_REGION`, `DOMAIN_NAME`, stack names, `/cicd`, priority 100, deploy target prefix, and target function.
2. Request an ACM public certificate in the same region as the ALB with `aws acm request-certificate --validation-method DNS`.
3. Retrieve the validation CNAME with `aws acm describe-certificate`.
4. Explain the exact GoDaddy mapping: remove the root-domain suffix from ACM’s record name, use the remainder as GoDaddy’s CNAME Name, use the ACM validation hostname as Value, and include neither `https://` nor a path.
5. Wait with `aws acm wait certificate-validated` and confirm status `ISSUED`.
6. Run `npm run check`, `npm run build`, CDK bootstrap, and `npx cdk deploy --all` with required contexts.
7. Retrieve `AlbDnsName` and create a GoDaddy application CNAME: Name `api` (for `api.example.com`), Value the ALB DNS hostname. Explain that this is distinct from the ACM validation CNAME and must not point to an ALB IP address.
8. Retrieve the API service outputs, provision the client, and smoke-test `https://api.example.com/cicd/healthz`.
9. Run the existing upload/deploy journey under base URL `https://api.example.com/cicd`.
10. Document how a future API consumes `HttpsListenerArn`, selects a unique priority, creates its own Lambda target group, matches its own prefix, and rewrites that prefix.

Remove the obsolete Route 53 alias instructions unless retained in a clearly labeled alternative section. Remove all suggestions that production or test deployment can omit `certificateArn`; local development remains the supported no-AWS/no-TLS test environment.

Update the security transport section to say production infrastructure exposes HTTPS only. Update tech debt to mark the HTTP fallback item resolved or remove it with a dated outcome. Update QUALITY to list `tests/unit/infra.test.ts` as CDK contract coverage.

The README route table should retain internal routes, but its introduction must explain that deployed public URLs prepend the configured mount path. For example, internal `/v1/builds` is externally `/cicd/v1/builds` with the default prefix.

**Verify**: `npm run check:docs` → prints `check:docs OK`; `rg -n "plain HTTP|omit.*certificateArn|Route 53 alias|dedicated ALB" README.md AGENTS.md ARCHITECTURE.md docs infra` → no obsolete claims except explicitly labeled historical or rejected alternatives.

### Step 7: Run narrow-to-broad verification

Run checks in this order and fix only issues within the in-scope files:

1. `npm test -- tests/unit/infra.test.ts`
2. `npm run typecheck`
3. `npm run check:docs`
4. `npm run check`
5. `npm run synth`

Expected: all exit 0. Confirm synthesis emits both the shared ingress and deploy API stacks.

Then inspect the synthesized templates without credentials:

```bash
rg -n 'AWS::ElasticLoadBalancingV2::LoadBalancer|AWS::ElasticLoadBalancingV2::Listener|AWS::ElasticLoadBalancingV2::ListenerRule|UrlRewriteConfig|/cicd' cdk.out
```

Expected:

- exactly one ALB and one HTTPS listener, in the shared ingress template;
- the `/cicd` listener rule and URL rewrite in the deploy API template;
- no HTTP listener;
- no second ALB in the deploy API template.

**Verify**: `git diff --check` → no whitespace errors; `git status --short` → only in-scope files plus the plan status are modified.

### Step 8: Prepare, but do not execute, the AWS migration

For an already-deployed environment, run a credentialed CDK diff only with operator approval. The expected migration creates a new shared ingress stack and removes the old dedicated ingress resources from `DeployApiStack`. The DynamoDB table, S3 bucket, and API Lambda should not be replaced.

The runbook must sequence a real migration as follows:

1. Issue and validate the ACM certificate without changing application DNS.
2. Deploy both stacks and verify the new ALB target group is healthy using its AWS DNS name only for lower-level diagnostics; do not treat that hostname as a valid HTTPS public endpoint because the certificate covers the custom domain.
3. Change the GoDaddy `api` CNAME to the new ALB DNS hostname.
4. Verify `https://<domain>/cicd/healthz` and one authenticated read request.
5. Observe logs and target health through the DNS TTL window.
6. Only then permit CloudFormation to remove the obsolete dedicated ALB/VPC resources.

If this repository has never been deployed, the migration section is not executed; deploy both stacks normally and add the GoDaddy application CNAME after the ALB DNS output exists.

**Verify**: human review confirms the runbook distinguishes fresh deployment from existing-environment cutover and contains no destructive command.

## Test plan

Create `tests/unit/infra.test.ts`, modeled stylistically after the explicit assertions in `tests/unit/alb.test.ts`, but using `aws-cdk-lib/assertions`.

Required cases:

- Shared ingress creates exactly one VPC and one internet-facing ALB.
- Shared ingress creates exactly one HTTPS listener with the supplied ACM certificate and a fixed 404 default.
- Shared ingress emits the listener ARN, ALB DNS, and domain outputs.
- Deploy API creates no VPC, ALB, listener, or ACM certificate.
- Deploy API creates one Lambda target group with enabled `/healthz` checks.
- Deploy API listener rule matches the exact prefix and wildcard prefix.
- Listener rule priority comes from props.
- Listener rule rewrites the prefix and forwards to the API target group.
- API URL output contains HTTPS, the configured domain, and prefix.
- Invalid empty domain, malformed path prefix, and out-of-range/non-integer priorities fail with clear messages.
- Existing S3/DynamoDB security and retention properties remain asserted.

Do not add live AWS tests. Do not test GoDaddy. Operator steps are verified by documentation review and, later, a separately authorized smoke deployment.

Verification: `npm test -- tests/unit/infra.test.ts` → all new tests pass; `npm test` → all repository tests pass.

## Done criteria

All criteria must hold:

- [x] `SharedIngressStack` owns the only VPC, ALB, ACM attachment, and HTTPS listener.
- [x] `DeployApiStack` owns its Lambda target group and `/cicd` listener rule but no ALB/listener/VPC.
- [x] Missing certificate or domain context fails synthesis; there is no HTTP fallback.
- [x] The rule matches `/cicd` and `/cicd/*`, rewrites to internal paths, and uses priority 100 by default.
- [x] Existing application route definitions and API response contracts are unchanged.
- [x] DynamoDB and S3 logical construct IDs and retention policies are unchanged.
- [x] `ApiUrl` is the custom HTTPS base URL including `/cicd`.
- [x] Shared outputs provide the contract future API stacks need.
- [x] GoDaddy ACM-validation and ALB-CNAME steps are documented distinctly.
- [x] Fresh deployment and existing-environment cutover are both documented.
- [x] `npm test -- tests/unit/infra.test.ts` exits 0.
- [x] `npm run check` exits 0.
- [x] `npm run synth` exits 0 and emits two stacks with one ALB total.
- [x] `git diff --check` exits 0.
- [x] No files outside the in-scope list are modified.
- [x] This plan records the verified outcome and is moved to `docs/exec-plans/completed/` only after every criterion passes.

## Outcome

Completed on 2026-07-16. The implementation split public ingress into `SharedIngressStack`, retained the deploy API's stateful construct IDs, added the `/cicd` match and URL rewrite, required the domain and issued certificate contexts, and added explicit CDK contract tests. Architecture, security, development, quality, and operator documentation now describe the shared-listener contract, GoDaddy certificate and application CNAME records, fresh deployment, and a two-phase existing-environment cutover.

Verification completed successfully:

- `npm test -- tests/unit/infra.test.ts`: 13 tests passed.
- `npm run typecheck`: passed.
- `npm run check:docs`: `check:docs OK`.
- `npm run check`: 55 tests across 7 files passed; formatting, lint, typechecking, build, architecture, and docs checks passed.
- `npm run synth -- -c domainName=api.example.com -c certificateArn=<representative-arn>`: synthesized `SharedIngress` and `DeployApi`; inspection confirmed one ALB and one HTTPS listener total, one `/cicd` listener rule with a URL rewrite, and no HTTP listener.
- Missing `domainName` and missing `certificateArn` were each verified to fail synthesis with a named error.
- `git diff --check`: passed.

The installed CDK `LambdaTarget` binding grants invoke access to the `elasticloadbalancing.amazonaws.com` service principal without a target-group `SourceArn`, and makes the target group depend on that permission. This standard CDK behavior was inspected in both the installed implementation and synthesized template and explicitly accepted by the operator; no broader hand-written permission was added. No credentialed CDK diff, AWS deployment, DNS change, or resource mutation was performed.

## STOP conditions

Stop and report back instead of improvising if:

- The domain is the zone apex (for example `example.com`) rather than a subdomain such as `api.example.com`; GoDaddy cannot use a normal apex CNAME to the ALB, so DNS architecture needs a separate decision.
- The ACM certificate is in a different AWS region from the ALB.
- An existing production stack would replace or delete the DynamoDB table, S3 bucket, or API Lambda according to `cdk diff`.
- A shared ALB/listener already exists and another stack owns it; importing that existing listener is a different migration path from this plan’s initial-foundation design.
- Listener-rule priority 100 is already allocated on a real shared listener.
- The installed AWS/CDK/CloudFormation versions reject listener-rule `Transforms` despite the local type definition exposing them.
- Lambda target binding does not generate a target-group-scoped invocation permission and fixing it would require a broader wildcard permission.
- Supporting both fresh-foundation and arbitrary-existing-ALB modes becomes necessary in the same stack. Stop and ask whether to split that into a follow-up plan.
- An implementation step requires changing application-layer route definitions or authentication behavior.
- A step’s verification fails twice after a reasonable in-scope correction.
- A real AWS deploy, DNS cutover, resource deletion, or other external mutation is required to continue without explicit operator approval.

## Maintenance notes

- Listener priorities are shared mutable configuration. Establish a simple registry in the shared-ingress documentation before adding the second API; duplicate priorities cause deployment failure.
- Every future API should own one target group and one non-default listener rule. It must never modify the listener default action or create another shared ALB.
- Each API should strip its external mount prefix at the ALB unless the service explicitly defines a different public contract.
- Keep the ACM validation CNAME in GoDaddy permanently so ACM can renew the certificate automatically.
- Reviewers should scrutinize CloudFormation replacement behavior, Lambda invoke permissions, rule priority, rewrite regex anchoring, and the absence of port 80.
- A separate infrastructure repository may eventually become the better home for `SharedIngressStack`. That move is deliberately deferred until more than one service consumes the contract; moving it now adds repository and deployment coordination without proving the need.
- WAF, access logs, rate limiting, HTTP redirects, and multi-region failover remain future security/operations work and are not hidden requirements of this plan.
