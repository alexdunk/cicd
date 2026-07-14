import type { Route } from '../router.ts';
import { jsonResponse } from '../types.ts';

/** ALB target-group health check; requires no authentication or dependencies. */
export function healthRoutes(): Route[] {
  return [
    {
      method: 'GET',
      pattern: '/healthz',
      handler: () => Promise.resolve(jsonResponse(200, { status: 'ok' })),
    },
  ];
}
