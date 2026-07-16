import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { DeployApiStack } from './deploy-api-stack.ts';
import { SharedIngressStack } from './shared-ingress-stack.ts';

/**
 * CDK app entrypoint. Synthesize with `npm run synth`; deploy with
 * `npx cdk deploy --app 'tsx infra/app.ts'` using real AWS credentials.
 *
 * Context values (via -c or cdk.json):
 * - domainName: required public hostname shared by path-mounted APIs.
 * - certificateArn: required issued ACM certificate in the deployment region.
 * - ingressStackName: shared foundation stack name (default SharedIngress).
 * - stackName: override for parallel environments (default DeployApi).
 * - pathPrefix: external API mount point (default "/cicd").
 * - listenerRulePriority: unique shared-listener priority (default 100).
 * - deployTargetPrefix: Lambda function-name prefix this API may deploy to
 *   (default "deploy-target-"). Bounds the IAM policy; the per-client
 *   allow-list in DynamoDB narrows it further.
 */
const app = new cdk.App();

function requiredContext(name: 'domainName' | 'certificateArn'): string {
  const value = app.node.tryGetContext(name) as unknown;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required CDK context "${name}"; pass it with -c ${name}=...`);
  }
  return value;
}

const domainName = requiredContext('domainName');
const certificateArn = requiredContext('certificateArn');
const ingressStackName =
  (app.node.tryGetContext('ingressStackName') as string | undefined) ?? 'SharedIngress';
const stackName = (app.node.tryGetContext('stackName') as string | undefined) ?? 'DeployApi';
const pathPrefix = (app.node.tryGetContext('pathPrefix') as string | undefined) ?? '/cicd';
const listenerRulePriority = Number(app.node.tryGetContext('listenerRulePriority') ?? 100);
const deployTargetPrefix =
  (app.node.tryGetContext('deployTargetPrefix') as string | undefined) ?? 'deploy-target-';

const ingress = new SharedIngressStack(app, ingressStackName, {
  certificateArn,
  domainName,
  description: 'Shared public HTTPS ALB ingress for path-mounted APIs',
});

new DeployApiStack(app, stackName, {
  apiCode: lambda.Code.fromAsset('dist/lambda'),
  domainName,
  listenerArn: ingress.httpsListener.listenerArn,
  listenerRulePriority,
  pathPrefix,
  deployTargetPrefix,
  description: 'CI/CD build upload and Lambda deployment service',
});

app.synth();
