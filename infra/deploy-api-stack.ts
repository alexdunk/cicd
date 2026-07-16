import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as targets from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';

export interface DeployApiStackProps extends cdk.StackProps {
  readonly apiCode: lambda.Code;
  readonly domainName: string;
  readonly listenerArn: string;
  readonly listenerRulePriority: number;
  readonly pathPrefix: string;
  readonly deployTargetPrefix: string;
}

/**
 * Service-specific infrastructure for the deploy API.
 *
 * The shared ingress stack owns the ALB and HTTPS listener. This stack owns
 * its target group and a path-scoped listener rule.
 */
export class DeployApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DeployApiStackProps) {
    super(scope, id, props);

    if (props.domainName.trim() === '') {
      throw new Error('domainName must be a non-empty string');
    }
    if (!/^\/[a-z0-9][a-z0-9-]*$/.test(props.pathPrefix)) {
      throw new Error(
        'pathPrefix must start with "/" and contain only lowercase letters, numbers, and hyphens',
      );
    }
    if (
      !Number.isInteger(props.listenerRulePriority) ||
      props.listenerRulePriority < 1 ||
      props.listenerRulePriority > 50_000
    ) {
      throw new Error('listenerRulePriority must be an integer from 1 through 50000');
    }

    // Metadata store: single-table layout documented in
    // docs/design-docs/0002-storage-model.md and mirrored in
    // src/adapters/aws/dynamo-stores.ts.
    const table = new dynamodb.TableV2(this, 'Table', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      globalSecondaryIndexes: [
        {
          indexName: 'gsi1',
          partitionKey: { name: 'gsi1pk', type: dynamodb.AttributeType.STRING },
          sortKey: { name: 'gsi1sk', type: dynamodb.AttributeType.STRING },
        },
      ],
    });

    // Build packages. Never public; clients write via presigned URLs only.
    const artifactBucket = new s3.Bucket(this, 'ArtifactBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [
        // Abandoned registrations (registered but never uploaded) leave no
        // objects; uploaded packages are kept 90 days by default.
        { expiration: cdk.Duration.days(90) },
      ],
    });

    const apiFunction = new lambda.Function(this, 'ApiFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      handler: 'index.handler',
      code: props.apiCode,
      memorySize: 512,
      timeout: cdk.Duration.seconds(120), // deploys wait for UpdateFunctionCode
      environment: {
        TABLE_NAME: table.tableName,
        ARTIFACT_BUCKET: artifactBucket.bucketName,
        LOG_LEVEL: 'info',
      },
    });

    table.grantReadWriteData(apiFunction);
    // Presigned PUT URLs are signed with the function's credentials, so the
    // role needs PutObject; UpdateFunctionCode requires the caller to have
    // GetObject on the package.
    artifactBucket.grantPut(apiFunction, 'builds/*');
    artifactBucket.grantRead(apiFunction, 'builds/*');

    // Deployable targets are bounded at the IAM layer by a function-name
    // prefix; the per-client allow-list in DynamoDB narrows within it.
    apiFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['lambda:UpdateFunctionCode', 'lambda:GetFunction'],
        resources: [
          `arn:${this.partition}:lambda:${this.region}:${this.account}:function:${props.deployTargetPrefix}*`,
        ],
      }),
    );

    const apiTargetGroup = new elbv2.ApplicationTargetGroup(this, 'ApiTargetGroup', {
      targetType: elbv2.TargetType.LAMBDA,
      healthCheck: {
        enabled: true,
        path: '/healthz',
        interval: cdk.Duration.seconds(60),
        healthyHttpCodes: '200',
      },
    });
    apiTargetGroup.addTarget(new targets.LambdaTarget(apiFunction));

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
                regex: `^${props.pathPrefix}/?(.*)$`,
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

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: `https://${props.domainName}${props.pathPrefix}`,
    });
    new cdk.CfnOutput(this, 'TableName', { value: table.tableName });
    new cdk.CfnOutput(this, 'ArtifactBucketName', { value: artifactBucket.bucketName });
  }
}
