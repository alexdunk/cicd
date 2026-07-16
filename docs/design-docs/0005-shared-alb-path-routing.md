# 0005: Shared ALB Path Routing

- Status: accepted (2026-07-16)

## Context

The platform needs one public hostname and one Application Load Balancer (ALB) shared by multiple machine APIs. A per-service ALB makes ingress ownership ambiguous, multiplies cost and public endpoints, and does not establish a reusable contract for adding APIs.

GoDaddy remains authoritative for the public domain. CDK therefore cannot create Route 53 validation or application records. The certificate and DNS bootstrap must be explicit operator work.

## Decision

One foundation stack, `SharedIngressStack`, owns the VPC, internet-facing ALB, attachment of an already-issued ACM certificate, and one HTTPS listener on port 443. The listener's default action is a fixed 404, so no API is an accidental catch-all. The stack outputs:

- `AlbDnsName`, used as the value of the public application's GoDaddy CNAME;
- `HttpsListenerArn`, imported by future service stacks;
- `DomainName`, the shared public hostname.

Each service stack owns its Lambda target group and one non-default listener rule. A rule matches an exact external prefix and its wildcard form, then uses an ALB URL transform to remove the prefix before forwarding. For this API, `/cicd` and `/cicd/*` rewrite with `^/cicd/?(.*)$` to `/$1`. Public `/cicd/healthz` therefore reaches internal `/healthz`, and public `/cicd/v1/builds` reaches internal `/v1/builds`. Application routers and local development remain unaware of `/cicd`.

Listener-rule priorities are a shared operational namespace and must be unique. The registry begins with:

- Priority `100`: `/cicd`, owned by `DeployApiStack`.

Before adding a service, its owner must add an unallocated priority and prefix to this registry in the same change as its listener rule. Duplicate priorities fail deployment. A service must not change the listener default action.

The operator requests an ACM public certificate in the ALB's AWS Region before CDK deployment, creates ACM's validation CNAME in GoDaddy, waits for status `ISSUED`, and passes its ARN as `certificateArn`. The ACM validation CNAME remains in place for renewal. After the ALB exists, a separate GoDaddy application CNAME points the public subdomain to `AlbDnsName`. Production has no HTTP listener or fallback.

## Future API Integration Contract

A future API:

1. consumes the foundation stack's `HttpsListenerArn` output instead of creating a VPC, ALB, certificate, or listener;
2. allocates and records a unique listener-rule priority;
3. creates and owns its target group and health-check contract;
4. matches its exact external prefix and wildcard form;
5. rewrites that prefix at the ALB boundary unless the service explicitly defines a different public contract;
6. leaves the listener's fixed 404 default unchanged.

The current repository composes the foundation and CI/CD service stacks for an initial deployment. A later move of the foundation to a dedicated infrastructure repository does not alter this output-based contract.

## Alternatives Rejected

- **Per-service ALBs or subdomains**: increase cost and public ingress surfaces and do not meet the one-domain, path-mounted platform contract.
- **Application-aware prefixes**: couple deployment topology to service routers and make local and direct invocation behavior differ.
- **Conditional ingress ownership in every service stack**: creates multiple modes and unclear ownership; services should consume one explicit foundation contract.

## Consequences

- `domainName` and `certificateArn` are required CDK contexts. Synthesis fails clearly when either is absent.
- External URLs include a mount prefix while internal application routes remain unchanged.
- Unmatched shared-domain paths receive an ALB-generated 404.
- Presigned S3 uploads bypass the ALB, preserving the approximately 1 MB request-body invariant.
- DNS validation, application DNS creation, and existing-environment cutover are manual operations described in [the AWS deployment checklist](../AWS_DEPLOYMENT_CHECKLIST.md).
