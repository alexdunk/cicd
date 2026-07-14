import * as cdk from 'aws-cdk-lib';
import { DeployApiStack } from './deploy-api-stack.ts';

/**
 * CDK app entrypoint. Synthesize with `npm run synth`; deploy with
 * `npx cdk deploy --app 'tsx infra/app.ts'` using real AWS credentials.
 *
 * Context values (via -c or cdk.json):
 * - stackName: override for parallel environments (default DeployApi).
 * - certificateArn: ACM certificate for the HTTPS listener. Without it the
 *   ALB serves plain HTTP, which is acceptable only for private test setups;
 *   see docs/SECURITY.md.
 * - deployTargetPrefix: Lambda function-name prefix this API may deploy to
 *   (default "deploy-target-"). Bounds the IAM policy; the per-client
 *   allow-list in DynamoDB narrows it further.
 */
const app = new cdk.App();

new DeployApiStack(
  app,
  (app.node.tryGetContext('stackName') as string | undefined) ?? 'DeployApi',
  {
    description: 'CI/CD build upload and Lambda deployment API (ALB + Lambda + S3 + DynamoDB)',
  },
);

app.synth();
