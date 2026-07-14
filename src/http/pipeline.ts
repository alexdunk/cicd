import type { ArtifactStore } from '../ports/artifacts.ts';
import type { Clock, IdGenerator } from '../ports/clock.ts';
import type { FunctionCodeUpdater } from '../ports/functions.ts';
import type { Logger } from '../ports/logger.ts';
import type { BuildStore, ClientStore, DeploymentStore } from '../ports/stores.ts';
import { BuildService } from '../services/build-service.ts';
import { DeploymentService } from '../services/deployment-service.ts';
import { withAuthorization } from './decorators/with-authorization.ts';
import { withErrorHandling } from './decorators/with-error-handling.ts';
import { withLogging } from './decorators/with-logging.ts';
import { buildRoutes } from './endpoints/builds.ts';
import { deploymentRoutes } from './endpoints/deployments.ts';
import { healthRoutes } from './endpoints/health.ts';
import { createRouter } from './router.ts';
import type { ApiRequest, ApiResponse, Handler, RequestContext } from './types.ts';

/** Everything the pipeline needs; supplied by AWS adapters in production and fakes locally. */
export interface Dependencies {
  logger: Logger;
  clock: Clock;
  ids: IdGenerator;
  clients: ClientStore;
  builds: BuildStore;
  deployments: DeploymentStore;
  artifacts: ArtifactStore;
  functions: FunctionCodeUpdater;
}

/**
 * THE composition root for the request pipeline. Decorator order is defined
 * here and nowhere else, outermost first:
 *
 *   logging -> error handling -> authorization -> router (innermost)
 *
 * Logging is outermost so every request (including auth failures) is logged.
 * Error handling sits inside logging so error responses still get logged, and
 * outside authorization so auth errors become clean 401/403 JSON responses.
 */
export function createPipeline(deps: Dependencies): Handler {
  const buildService = new BuildService(deps.builds, deps.artifacts, deps.clock, deps.ids);
  const deploymentService = new DeploymentService(
    deps.deployments,
    deps.builds,
    deps.functions,
    deps.clock,
    deps.ids,
  );

  const router = createRouter([
    ...healthRoutes(),
    ...buildRoutes(buildService),
    ...deploymentRoutes(deploymentService),
  ]);

  return withLogging(
    deps.logger,
    deps.ids,
  )(withErrorHandling()(withAuthorization(deps.clients)(router)));
}

/** Fresh per-request context; the logging and authorization decorators fill it in. */
export function emptyContext(deps: Dependencies): RequestContext {
  return { requestId: '', logger: deps.logger, client: null };
}

/** Convenience for callers that own the context lifecycle (Lambda entry, dev server, tests). */
export async function handleRequest(
  pipeline: Handler,
  deps: Dependencies,
  req: ApiRequest,
): Promise<ApiResponse> {
  return pipeline(req, emptyContext(deps));
}
