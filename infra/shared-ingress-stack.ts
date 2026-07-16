import * as cdk from 'aws-cdk-lib';
import * as certificatemanager from 'aws-cdk-lib/aws-certificatemanager';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import type { Construct } from 'constructs';

export interface SharedIngressStackProps extends cdk.StackProps {
  readonly certificateArn: string;
  readonly domainName: string;
}

/**
 * Public ingress shared by path-mounted API services.
 *
 * Service stacks consume httpsListener.listenerArn and own their target groups
 * and non-default listener rules.
 */
export class SharedIngressStack extends cdk.Stack {
  public readonly httpsListener: elbv2.ApplicationListener;

  constructor(scope: Construct, id: string, props: SharedIngressStackProps) {
    super(scope, id, props);

    if (props.certificateArn.trim() === '') {
      throw new Error('certificateArn must be a non-empty string');
    }
    if (props.domainName.trim() === '') {
      throw new Error('domainName must be a non-empty string');
    }

    const vpc = new ec2.Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [{ name: 'public', subnetType: ec2.SubnetType.PUBLIC }],
    });

    const alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      vpc,
      internetFacing: true,
    });

    const certificate = certificatemanager.Certificate.fromCertificateArn(
      this,
      'Cert',
      props.certificateArn,
    );

    this.httpsListener = alb.addListener('Https', {
      port: 443,
      certificates: [certificate],
      defaultAction: elbv2.ListenerAction.fixedResponse(404, {
        contentType: 'application/json',
        messageBody: '{"message":"not found"}',
      }),
    });

    new cdk.CfnOutput(this, 'AlbDnsName', { value: alb.loadBalancerDnsName });
    new cdk.CfnOutput(this, 'HttpsListenerArn', {
      value: this.httpsListener.listenerArn,
    });
    new cdk.CfnOutput(this, 'DomainName', { value: props.domainName });
  }
}
