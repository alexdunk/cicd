import { badRequest } from '../../domain/errors.ts';
import type { DeploymentService } from '../../services/deployment-service.ts';
import { createDeploymentSchema, parseBody } from '../request-schemas.ts';
import type { Route } from '../router.ts';
import { jsonResponse } from '../types.ts';
import { parseLimit } from './builds.ts';
import { requireDeployTarget, requireScope } from './authz.ts';

export function deploymentRoutes(service: DeploymentService): Route[] {
  return [
    {
      method: 'POST',
      pattern: '/v1/deployments',
      handler: async (req, ctx) => {
        const client = requireScope(ctx, 'deploy');
        const input = parseBody(createDeploymentSchema, req.body);
        requireDeployTarget(client, input.targetFunction);
        const deployment = await service.deploy({
          buildId: input.buildId,
          targetFunction: input.targetFunction,
          clientId: client.clientId,
          logger: ctx.logger,
        });
        // The deploy ran synchronously; report the terminal state honestly.
        const status = deployment.status === 'succeeded' ? 201 : 502;
        return jsonResponse(status, { deployment });
      },
    },
    {
      method: 'GET',
      pattern: '/v1/deployments/{deploymentId}',
      handler: async (_req, ctx, params) => {
        requireScope(ctx, 'deploy');
        const deployment = await service.getDeployment(params['deploymentId']!);
        return jsonResponse(200, { deployment });
      },
    },
    {
      method: 'GET',
      pattern: '/v1/deployments',
      handler: async (req, ctx) => {
        requireScope(ctx, 'deploy');
        const targetFunction = req.query['function'];
        if (!targetFunction) {
          throw badRequest(
            'Query parameter "function" is required, e.g. /v1/deployments?function=my-fn.',
          );
        }
        const deployments = await service.listByFunction(
          targetFunction,
          parseLimit(req.query['limit']),
        );
        return jsonResponse(200, { deployments });
      },
    },
  ];
}
