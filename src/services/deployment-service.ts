import { badRequest, notFound } from '../domain/errors.ts';
import { newDeployment, transitionDeployment, type Deployment } from '../domain/deployment.ts';
import type { Clock, IdGenerator } from '../ports/clock.ts';
import type { FunctionCodeUpdater } from '../ports/functions.ts';
import type { Logger } from '../ports/logger.ts';
import type { BuildStore, DeploymentStore } from '../ports/stores.ts';

/**
 * Deployment lifecycle: validate the build is available, record the request,
 * call the Lambda control plane (UpdateFunctionCode from S3), and persist
 * every state transition (requested -> in_progress -> succeeded | failed).
 *
 * The deploy runs synchronously within the request; ALB allows enough time
 * for UpdateFunctionCode on typical packages. A failed AWS call still leaves
 * a completed audit trail with status "failed".
 */
export class DeploymentService {
  constructor(
    private readonly deployments: DeploymentStore,
    private readonly builds: BuildStore,
    private readonly functions: FunctionCodeUpdater,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async deploy(input: {
    buildId: string;
    targetFunction: string;
    clientId: string;
    logger: Logger;
  }): Promise<Deployment> {
    const build = await this.builds.get(input.buildId);
    if (!build) {
      throw notFound(`Build ${input.buildId} does not exist.`);
    }
    if (build.status !== 'available') {
      throw badRequest(
        `Build ${input.buildId} is ${build.status}; only uploaded builds can be deployed. ` +
          'Upload the package and call the complete endpoint first.',
      );
    }

    let deployment = newDeployment({
      deploymentId: this.ids.newId(),
      buildId: build.buildId,
      targetFunction: input.targetFunction,
      requestedBy: input.clientId,
      now: this.clock.now(),
    });
    await this.deployments.put(deployment);

    const logger = input.logger.with({
      deploymentId: deployment.deploymentId,
      buildId: build.buildId,
      targetFunction: input.targetFunction,
    });

    deployment = transitionDeployment(deployment, 'in_progress', this.clock.now(), {
      message: 'Calling Lambda UpdateFunctionCode.',
    });
    await this.deployments.put(deployment);
    logger.log('info', 'deployment.started');

    try {
      const result = await this.functions.updateFunctionCode({
        functionName: input.targetFunction,
        s3Key: build.s3Key,
      });
      deployment = transitionDeployment(deployment, 'succeeded', this.clock.now(), {
        message: 'Function code updated.',
        result,
      });
      await this.deployments.put(deployment);
      logger.log('info', 'deployment.succeeded', { codeSha256: result.codeSha256 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      deployment = transitionDeployment(deployment, 'failed', this.clock.now(), {
        message: 'Lambda UpdateFunctionCode failed.',
        error: message,
      });
      await this.deployments.put(deployment);
      logger.log('error', 'deployment.failed', { error: message });
    }
    return deployment;
  }

  async getDeployment(deploymentId: string): Promise<Deployment> {
    const deployment = await this.deployments.get(deploymentId);
    if (!deployment) {
      throw notFound(`Deployment ${deploymentId} does not exist.`);
    }
    return deployment;
  }

  async listByFunction(targetFunction: string, limit: number): Promise<Deployment[]> {
    return this.deployments.listByFunction(targetFunction, limit);
  }
}
