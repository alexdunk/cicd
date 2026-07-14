<!-- GENERATED FILE. Do not edit by hand.
     Source: src/http/endpoints/*  Regenerate: npm run generate:routes -->

# API Route Inventory

| Method | Path |
| --- | --- |
| GET | `/healthz` |
| POST | `/v1/builds` |
| POST | `/v1/builds/{buildId}/complete` |
| GET | `/v1/builds/{buildId}` |
| GET | `/v1/builds` |
| POST | `/v1/deployments` |
| GET | `/v1/deployments/{deploymentId}` |
| GET | `/v1/deployments` |

Authentication: every route except `/healthz` requires `Authorization: Bearer <token>`.
Request/response schemas live in `src/http/request-schemas.ts` and the endpoint modules.
