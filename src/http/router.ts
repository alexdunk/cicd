import { notFound } from '../domain/errors.ts';
import type { ApiRequest, ApiResponse, Handler, RequestContext } from './types.ts';

export type RouteHandler = (
  req: ApiRequest,
  ctx: RequestContext,
  params: Record<string, string>,
) => Promise<ApiResponse>;

export interface Route {
  method: string;
  /** Path pattern with `{param}` segments, e.g. "/v1/builds/{buildId}". */
  pattern: string;
  handler: RouteHandler;
}

interface CompiledRoute extends Route {
  segments: string[];
}

function matchPath(segments: string[], path: string): Record<string, string> | null {
  const parts = path.split('/').filter((part) => part !== '');
  if (parts.length !== segments.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;
    const part = parts[i]!;
    if (segment.startsWith('{') && segment.endsWith('}')) {
      params[segment.slice(1, -1)] = decodeURIComponent(part);
    } else if (segment !== part) {
      return null;
    }
  }
  return params;
}

/**
 * The innermost pipeline layer: dispatches to endpoint handlers by method and
 * path pattern. Unknown paths produce a stable 404 AppError, which the
 * error-handling decorator converts to a response.
 */
export function createRouter(routes: readonly Route[]): Handler {
  const compiled: CompiledRoute[] = routes.map((route) => ({
    ...route,
    segments: route.pattern.split('/').filter((part) => part !== ''),
  }));

  return async (req, ctx) => {
    for (const route of compiled) {
      if (route.method !== req.method) continue;
      const params = matchPath(route.segments, req.path);
      if (params !== null) {
        return route.handler(req, ctx, params);
      }
    }
    throw notFound(`No route for ${req.method} ${req.path}.`);
  };
}
