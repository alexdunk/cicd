# 0004: AWS CDK (TypeScript) for Infrastructure

- Status: accepted (bootstrap, 2026-07-14)

## Context

The brief requires in-repo infrastructure-as-code for the API Lambda, ALB target group, S3 bucket, and DynamoDB table, using a conventional tool, with the choice recorded.

## Decision

AWS CDK v2 in TypeScript (`infra/`), synthesized with `npm run synth` via `tsx` (no separate build step). Reasons:

- same language and type system as the application — one toolchain, typed construct APIs;
- ALB-to-Lambda target-group wiring is a first-class construct (`aws-elasticloadbalancingv2-targets.LambdaTarget`);
- `cdk synth` validates the stack in CI without AWS credentials.

Environment knobs are CDK context values documented in `infra/app.ts` and `docs/DEVELOPMENT.md`. The later shared-ingress decision defines their current ownership and required domain/certificate contract; see [0005: Shared ALB path routing](0005-shared-alb-path-routing.md).

## Alternatives Considered

- **Terraform**: fine choice, but introduces a second language (HCL) and toolchain for a single-stack TypeScript repo.
- **SAM**: simpler for API Gateway patterns; ALB target groups and the VPC wiring are awkward in SAM templates.

## Consequences and Enforcement

- CI runs `npm run synth` on every change, so infrastructure code cannot silently rot.
- Stateful resources (table, bucket) use `RemovalPolicy.RETAIN`; deleting the stack never deletes data.
- Actual deployment (`cdk deploy`) is a credentialed, human-initiated action; nothing in CI deploys.
