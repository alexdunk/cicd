# 0002: Single-Table DynamoDB Storage Model

- Status: accepted (bootstrap, 2026-07-14)

## Context

The API stores three small entity types (clients, builds, deployments) with simple access patterns: point lookups by id/token-hash, newest-first build list, newest-first deployment history per target function.

## Decision

One on-demand DynamoDB table (`pk`/`sk` strings) with one GSI (`gsi1pk`/`gsi1sk`):

| Entity     | pk                       | sk     | gsi1pk          | gsi1sk        |
| ---------- | ------------------------ | ------ | --------------- | ------------- |
| Client     | `CLIENT#<sha256(token)>` | `META` | –               | –             |
| Build      | `BUILD#<buildId>`        | `META` | `BUILDS`        | `<createdAt>` |
| Deployment | `DEPLOY#<deploymentId>`  | `META` | `FN#<function>` | `<createdAt>` |

Deployment transitions are embedded in the deployment item as a list — history is always read with the deployment, and items stay far below the 400 KB limit (≤4 transitions).

Rows are validated with zod on read (`src/adapters/aws/dynamo-stores.ts`) because table contents are a trust boundary.

## Alternatives Considered

- **Table per entity**: three tables to provision/permission for no query benefit at this scale.
- **`BUILDS` as a single GSI partition** could hot-spot at extreme write rates; irrelevant at CI-scale write volumes (a few builds per minute at most). Revisit if build registration exceeds ~1000/s.
- **RDS/Aurora**: relational power unneeded; adds VPC networking, connections from Lambda, and recurring cost.

## Consequences and Enforcement

- Key construction lives only in the store adapters; services/domain never see keys.
- The layout is mirrored in `infra/deploy-api-stack.ts` (table + `gsi1`). Changing the layout requires updating both files and this doc in one change.
