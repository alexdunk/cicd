import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { describe, expect, it } from 'vitest';
import { DeployApiStack } from '../../infra/deploy-api-stack.ts';
import { SharedIngressStack } from '../../infra/shared-ingress-stack.ts';

const certificateArn =
  'arn:aws:acm:us-east-1:123456789012:certificate/00000000-0000-0000-0000-000000000000';
const listenerArn =
  'arn:aws:elasticloadbalancing:us-east-1:123456789012:listener/app/shared/123/456';

function deployApiStack(overrides: Partial<ConstructorParameters<typeof DeployApiStack>[2]> = {}) {
  const app = new cdk.App();
  return new DeployApiStack(app, 'DeployApi', {
    apiCode: lambda.Code.fromInline('exports.handler = async () => ({ statusCode: 200 })'),
    domainName: 'api.example.com',
    listenerArn,
    listenerRulePriority: 100,
    pathPrefix: '/cicd',
    deployTargetPrefix: 'deploy-target-',
    ...overrides,
  });
}

describe('SharedIngressStack', () => {
  it('creates one public ALB and one HTTPS listener with a safe default', () => {
    const app = new cdk.App();
    const stack = new SharedIngressStack(app, 'SharedIngress', {
      certificateArn,
      domainName: 'api.example.com',
    });
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::EC2::VPC', 1);
    template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 1);
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', {
      Scheme: 'internet-facing',
      Type: 'application',
    });
    template.resourceCountIs('AWS::ElasticLoadBalancingV2::Listener', 1);
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
      Port: 443,
      Protocol: 'HTTPS',
      Certificates: [{ CertificateArn: certificateArn }],
      DefaultActions: [
        {
          Type: 'fixed-response',
          FixedResponseConfig: {
            ContentType: 'application/json',
            MessageBody: '{"message":"not found"}',
            StatusCode: '404',
          },
        },
      ],
    });
    template.resourceCountIs('AWS::ElasticLoadBalancingV2::ListenerRule', 0);
  });

  it('exports the ALB DNS name, listener ARN, and public domain', () => {
    const app = new cdk.App();
    const stack = new SharedIngressStack(app, 'SharedIngress', {
      certificateArn,
      domainName: 'api.example.com',
    });
    const template = Template.fromStack(stack);

    template.hasOutput('AlbDnsName', {
      Value: Match.objectLike({ 'Fn::GetAtt': Match.anyValue() }),
    });
    template.hasOutput('HttpsListenerArn', {
      Value: Match.objectLike({ Ref: Match.anyValue() }),
    });
    template.hasOutput('DomainName', { Value: 'api.example.com' });
  });

  it.each([
    [{ certificateArn: '', domainName: 'api.example.com' }, 'certificateArn'],
    [{ certificateArn, domainName: '' }, 'domainName'],
  ])('rejects an empty required property', (props, expectedMessage) => {
    const app = new cdk.App();
    expect(() => new SharedIngressStack(app, 'SharedIngress', props)).toThrow(expectedMessage);
  });
});

describe('DeployApiStack', () => {
  it('owns service resources but no shared ingress resources', () => {
    const template = Template.fromStack(deployApiStack());

    template.resourceCountIs('AWS::EC2::VPC', 0);
    template.resourceCountIs('AWS::ElasticLoadBalancingV2::LoadBalancer', 0);
    template.resourceCountIs('AWS::ElasticLoadBalancingV2::Listener', 0);
    template.resourceCountIs('AWS::CertificateManager::Certificate', 0);
    template.resourceCountIs('AWS::ElasticLoadBalancingV2::TargetGroup', 1);
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
      TargetType: 'lambda',
      HealthCheckEnabled: true,
      HealthCheckPath: '/healthz',
      HealthCheckIntervalSeconds: 60,
      Matcher: { HttpCode: '200' },
    });
    template.hasResourceProperties('AWS::Lambda::Permission', {
      Action: 'lambda:InvokeFunction',
      Principal: 'elasticloadbalancing.amazonaws.com',
    });
    template.hasResource('AWS::ElasticLoadBalancingV2::TargetGroup', {
      DependsOn: Match.arrayWith([Match.stringLikeRegexp('ApiFunctionInvoke')]),
    });
  });

  it('mounts and rewrites the API prefix before forwarding', () => {
    const template = Template.fromStack(deployApiStack());

    template.resourceCountIs('AWS::ElasticLoadBalancingV2::ListenerRule', 1);
    template.hasResourceProperties('AWS::ElasticLoadBalancingV2::ListenerRule', {
      ListenerArn: listenerArn,
      Priority: 100,
      Conditions: [
        {
          Field: 'path-pattern',
          PathPatternConfig: { Values: ['/cicd', '/cicd/*'] },
        },
      ],
      Transforms: [
        {
          Type: 'url-rewrite',
          UrlRewriteConfig: {
            Rewrites: [{ Regex: '^/cicd/?(.*)$', Replace: '/$1' }],
          },
        },
      ],
      Actions: [
        {
          Type: 'forward',
          TargetGroupArn: {
            Ref: Match.stringLikeRegexp('ApiTargetGroup'),
          },
        },
      ],
    });
    template.hasOutput('ApiUrl', { Value: 'https://api.example.com/cicd' });
  });

  it('preserves stateful resource security and retention', () => {
    const template = Template.fromStack(deployApiStack());

    template.hasResource('AWS::DynamoDB::GlobalTable', {
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
      Properties: Match.objectLike({
        BillingMode: 'PAY_PER_REQUEST',
      }),
    });
    template.hasResource('AWS::S3::Bucket', {
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
      Properties: Match.objectLike({
        BucketEncryption: {
          ServerSideEncryptionConfiguration: [
            { ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } },
          ],
        },
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
      }),
    });
  });

  it.each([
    [{ domainName: '' }, 'domainName'],
    [{ pathPrefix: 'cicd' }, 'pathPrefix'],
    [{ pathPrefix: '/CICD' }, 'pathPrefix'],
    [{ listenerRulePriority: 0 }, 'listenerRulePriority'],
    [{ listenerRulePriority: 50_001 }, 'listenerRulePriority'],
    [{ listenerRulePriority: 1.5 }, 'listenerRulePriority'],
  ])('rejects invalid service properties', (overrides, expectedMessage) => {
    expect(() => deployApiStack(overrides)).toThrow(expectedMessage);
  });
});
