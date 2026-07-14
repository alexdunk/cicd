import { createHash } from 'node:crypto';

/** Permissions a CI client can hold. */
export type Scope = 'upload' | 'deploy';

/**
 * A machine client (CI pipeline or deployment tool). Identified by the
 * SHA-256 hash of its opaque bearer token; the raw token is never stored.
 */
export interface ApiClient {
  /** Stable human-assigned identifier, e.g. "ci-orders-service". Used in logs. */
  clientId: string;
  scopes: readonly Scope[];
  /** Lambda function names this client is allowed to deploy to. */
  allowedFunctions: readonly string[];
  createdAt: string;
}

/** Hex-encoded SHA-256 of the raw bearer token; the DynamoDB lookup key. */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

export function hasScope(client: ApiClient, scope: Scope): boolean {
  return client.scopes.includes(scope);
}

export function mayDeployTo(client: ApiClient, functionName: string): boolean {
  return client.allowedFunctions.includes(functionName);
}
