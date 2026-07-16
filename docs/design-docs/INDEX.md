# Design Docs Index

| Doc                                                                | Status   | One-line summary                                                                                   |
| ------------------------------------------------------------------ | -------- | -------------------------------------------------------------------------------------------------- |
| [0001-decorator-pipeline.md](0001-decorator-pipeline.md)           | accepted | Handler composed of logging → error → auth → router decorators; order fixed in `createPipeline()`. |
| [0002-storage-model.md](0002-storage-model.md)                     | accepted | Single DynamoDB table with one GSI for build lists and per-function deployment history.            |
| [0003-synchronous-deploys.md](0003-synchronous-deploys.md)         | accepted | Deploys run inside the request and wait for UpdateFunctionCode; no queue.                          |
| [0004-cdk-for-infrastructure.md](0004-cdk-for-infrastructure.md)   | accepted | AWS CDK in TypeScript for all infrastructure; synth runs in CI without credentials.                |
| [0005-shared-alb-path-routing.md](0005-shared-alb-path-routing.md) | accepted | One HTTPS ALB routes path-mounted APIs; service rules strip prefixes before forwarding.            |
