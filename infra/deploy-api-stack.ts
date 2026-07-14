import * as cdk from 'aws-cdk-lib';
import * as certificatemanager from 'aws-cdk-lib/aws-certificatemanager';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as targets from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';

/**
 * All infrastructure for the deploy API: DynamoDB table, artifact bucket,
 * API Lambda, and an ALB whose target group invokes the Lambda directly
 * (no API Gateway). Run `npm run build` first; the function code comes from
 * dist/lambda.
 */
export class DeployApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

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
      code: lambda.Code.fromAsset('dist/lambda'),
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
    const deployTargetPrefix =
      (this.node.tryGetContext('deployTargetPrefix') as string | undefined) ?? 'deploy-target-';
    apiFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['lambda:UpdateFunctionCode', 'lambda:GetFunction'],
        resources: [
          `arn:${this.partition}:lambda:${this.region}:${this.account}:function:${deployTargetPrefix}*`,
        ],
      }),
    );

    // Minimal VPC for the ALB: public subnets only, no NAT (no recurring cost).
    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [{ name: 'public', subnetType: ec2.SubnetType.PUBLIC }],
    });

    const alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc,
      internetFacing: true,
    });

    // HTTPS when a certificate is supplied; plain HTTP otherwise (test only).
    const certificateArn = this.node.tryGetContext('certificateArn') as string | undefined;
    const listener = certificateArn
      ? alb.addListener('Https', {
          port: 443,
          certificates: [
            certificatemanager.Certificate.fromCertificateArn(this, 'Cert', certificateArn),
          ],
        })
      : alb.addListener('Http', { port: 80 });

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
    new cdk.CfnOutput(this, 'TableName', { value: table.tableName });
    new cdk.CfnOutput(this, 'ArtifactBucketName', { value: artifactBucket.bucketName });
  }
}
