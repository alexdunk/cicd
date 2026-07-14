import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import type { ApiClient } from '../../domain/client.ts';
import type { Build } from '../../domain/build.ts';
import type { Deployment } from '../../domain/deployment.ts';
import type { BuildStore, ClientStore, DeploymentStore } from '../../ports/stores.ts';

/**
 * Single-table DynamoDB layout (see docs/design-docs/0002-storage-model.md):
 *
 *   pk                     sk          entity      GSI1 (gsi1pk / gsi1sk)
 *   CLIENT#<tokenHash>     META        client      -
 *   BUILD#<buildId>        META        build       BUILDS / <createdAt>
 *   DEPLOY#<deploymentId>  META        deployment  FN#<function> / <createdAt>
 *
 * GSI1 supports "list builds" and "deployment history per function".
 * Rows are validated with zod on read because DynamoDB contents are outside
 * the type system's control.
 */

const clientRowSchema = z.object({
  clientId: z.string(),
  scopes: z.array(z.enum(['upload', 'deploy'])),
  allowedFunctions: z.array(z.string()),
  createdAt: z.string(),
});

const buildRowSchema = z.object({
  buildId: z.string(),
  name: z.string(),
  gitCommit: z.string().nullable(),
  status: z.enum(['pending_upload', 'available']),
  s3Key: z.string(),
  sizeBytes: z.number().nullable(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const deploymentRowSchema = z.object({
  deploymentId: z.string(),
  buildId: z.string(),
  targetFunction: z.string(),
  status: z.enum(['requested', 'in_progress', 'succeeded', 'failed']),
  transitions: z.array(
    z.object({
      status: z.enum(['requested', 'in_progress', 'succeeded', 'failed']),
      at: z.string(),
      message: z.string().nullable(),
    }),
  ),
  result: z.object({ codeSha256: z.string(), functionVersion: z.string().nullable() }).nullable(),
  error: z.string().nullable(),
  requestedBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export class DynamoClientStore implements ClientStore {
  constructor(
    private readonly doc: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async getByTokenHash(tokenHash: string): Promise<ApiClient | null> {
    const out = await this.doc.send(
      new GetCommand({ TableName: this.tableName, Key: { pk: `CLIENT#${tokenHash}`, sk: 'META' } }),
    );
    if (!out.Item) return null;
    return clientRowSchema.parse(out.Item);
  }
}

export class DynamoBuildStore implements BuildStore {
  constructor(
    private readonly doc: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async put(build: Build): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          pk: `BUILD#${build.buildId}`,
          sk: 'META',
          gsi1pk: 'BUILDS',
          gsi1sk: build.createdAt,
          ...build,
        },
      }),
    );
  }

  async get(buildId: string): Promise<Build | null> {
    const out = await this.doc.send(
      new GetCommand({ TableName: this.tableName, Key: { pk: `BUILD#${buildId}`, sk: 'META' } }),
    );
    if (!out.Item) return null;
    return buildRowSchema.parse(out.Item);
  }

  async list(limit: number): Promise<Build[]> {
    const out = await this.doc.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'gsi1',
        KeyConditionExpression: 'gsi1pk = :pk',
        ExpressionAttributeValues: { ':pk': 'BUILDS' },
        ScanIndexForward: false,
        Limit: limit,
      }),
    );
    return (out.Items ?? []).map((item) => buildRowSchema.parse(item));
  }
}

export class DynamoDeploymentStore implements DeploymentStore {
  constructor(
    private readonly doc: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  async put(deployment: Deployment): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          pk: `DEPLOY#${deployment.deploymentId}`,
          sk: 'META',
          gsi1pk: `FN#${deployment.targetFunction}`,
          gsi1sk: deployment.createdAt,
          ...deployment,
        },
      }),
    );
  }

  async get(deploymentId: string): Promise<Deployment | null> {
    const out = await this.doc.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { pk: `DEPLOY#${deploymentId}`, sk: 'META' },
      }),
    );
    if (!out.Item) return null;
    return deploymentRowSchema.parse(out.Item);
  }

  async listByFunction(targetFunction: string, limit: number): Promise<Deployment[]> {
    const out = await this.doc.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'gsi1',
        KeyConditionExpression: 'gsi1pk = :pk',
        ExpressionAttributeValues: { ':pk': `FN#${targetFunction}` },
        ScanIndexForward: false,
        Limit: limit,
      }),
    );
    return (out.Items ?? []).map((item) => deploymentRowSchema.parse(item));
  }
}
