import { hasScope, mayDeployTo, type ApiClient, type Scope } from '../../domain/client.ts';
import { forbidden, unauthorized } from '../../domain/errors.ts';
import type { RequestContext } from '../types.ts';

/**
 * Endpoint-level authorization helpers. The authorizer decorator establishes
 * *who* is calling; these checks decide *what* that client may do, and they
 * live next to the protected operations per GUARDRAILS.md.
 */
export function requireScope(ctx: RequestContext, scope: Scope): ApiClient {
  const client = ctx.client;
  if (!client) {
    // The authorizer decorator populates ctx.client for all non-public paths,
    // so this only trips if a route is wired up outside the pipeline.
    throw unauthorized('Request is not authenticated.');
  }
  if (!hasScope(client, scope)) {
    throw forbidden(`Client ${client.clientId} does not have the "${scope}" scope.`);
  }
  return client;
}

export function requireDeployTarget(client: ApiClient, functionName: string): void {
  if (!mayDeployTo(client, functionName)) {
    throw forbidden(
      `Client ${client.clientId} is not allowed to deploy to function "${functionName}".`,
    );
  }
}
