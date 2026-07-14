import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { LambdaClient } from '@aws-sdk/client-lambda';
import { S3Client } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { ALBEvent, ALBResult } from 'aws-lambda';
import {
  DynamoBuildStore,
  DynamoClientStore,
  DynamoDeploymentStore,
} from './adapters/aws/dynamo-stores.ts';
import { LambdaFunctionUpdater } from './adapters/aws/lambda-function-updater.ts';
import { S3ArtifactStore } from './adapters/aws/s3-artifact-store.ts';
import { systemClock, uuidGenerator } from './adapters/system.ts';
import { fromAlbEvent, toAlbResult } from './http/alb.ts';
import { createPipeline, handleRequest, type Dependencies } from './http/pipeline.ts';
import { createConsoleLogger } from './observability/console-logger.ts';
import type { LogLevel } from './ports/logger.ts';

/**
 * Production Lambda entrypoint (ALB target-group invocation). Wires real AWS
 * adapters into the pipeline. Configuration comes from environment variables
 * set by the CDK stack; fail fast at cold start when they are missing.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. It is set by the CDK stack in infra/; see docs/DEVELOPMENT.md#configuration.`,
    );
  }
  return value;
}

function createDependencies(): Dependencies {
  const tableName = requireEnv('TABLE_NAME');
  const bucket = requireEnv('ARTIFACT_BUCKET');
  const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
    marshallOptions: { removeUndefinedValues: true },
  });
  return {
    logger: createConsoleLogger((process.env['LOG_LEVEL'] as LogLevel) ?? 'info'),
    clock: systemClock,
    ids: uuidGenerator,
    clients: new DynamoClientStore(doc, tableName),
    builds: new DynamoBuildStore(doc, tableName),
    deployments: new DynamoDeploymentStore(doc, tableName),
    artifacts: new S3ArtifactStore(new S3Client({}), bucket),
    functions: new LambdaFunctionUpdater(new LambdaClient({}), bucket),
  };
}

const deps = createDependencies();
const pipeline = createPipeline(deps);

export async function handler(event: ALBEvent): Promise<ALBResult> {
  const response = await handleRequest(pipeline, deps, fromAlbEvent(event));
  return toAlbResult(response);
}
