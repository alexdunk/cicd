import type { BuildService } from '../../services/build-service.ts';
import { parseBody, parseLimit, registerBuildSchema } from '../request-schemas.ts';
import type { Route } from '../router.ts';
import { jsonResponse } from '../types.ts';
import { requireScope } from './authz.ts';

export function buildRoutes(service: BuildService): Route[] {
  return [
    {
      method: 'POST',
      pattern: '/v1/builds',
      handler: async (req, ctx) => {
        const client = requireScope(ctx, 'upload');
        const input = parseBody(registerBuildSchema, req.body);
        const result = await service.register({
          name: input.name,
          gitCommit: input.gitCommit ?? null,
          clientId: client.clientId,
        });
        return jsonResponse(201, result);
      },
    },
    {
      method: 'POST',
      pattern: '/v1/builds/{buildId}/complete',
      handler: async (_req, ctx, params) => {
        requireScope(ctx, 'upload');
        const build = await service.completeUpload(params['buildId']!);
        return jsonResponse(200, { build });
      },
    },
    {
      method: 'GET',
      pattern: '/v1/builds/{buildId}',
      handler: async (_req, ctx, params) => {
        requireScope(ctx, 'upload');
        const build = await service.getBuild(params['buildId']!);
        return jsonResponse(200, { build });
      },
    },
    {
      method: 'GET',
      pattern: '/v1/builds',
      handler: async (req, ctx) => {
        requireScope(ctx, 'upload');
        const builds = await service.listBuilds(parseLimit(req.query['limit']));
        return jsonResponse(200, { builds });
      },
    },
  ];
}
