# Shared ALB Path Routing

Completed 2026-07-16.

## Goal

Move public ingress ownership out of the CI/CD service stack and mount the API
at `/cicd` on a shared HTTPS Application Load Balancer without changing its
internal routes.

## Outcome

- `SharedIngressStack` owns the VPC, internet-facing ALB, ACM certificate
  attachment, HTTPS listener, and fixed 404 default action.
- The CI/CD service stack owns its Lambda target group and listener rule.
- The listener matches `/cicd` and `/cicd/*`, then rewrites the prefix so the
  application continues to receive `/healthz` and `/v1/*`.
- Unmatched paths receive the listener's fixed 404 response rather than being
  forwarded to the service.
- DynamoDB and S3 state remain retained and owned by the service stack.
- The public API URL uses the configured HTTPS domain and `/cicd` prefix.

## Verification

When completed, `npm run check` passed, and a representative synthesis with
`domainName` and `certificateArn` contexts produced the shared ingress and
service stacks with one ALB, one HTTPS listener, and the `/cicd` rewrite rule.

## Durable References

- [Shared ALB path-routing decision](../../design-docs/0005-shared-alb-path-routing.md)
- [AWS deployment checklist](../../AWS_DEPLOYMENT_CHECKLIST.md)
