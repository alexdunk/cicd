import type { ApiClient } from '../domain/client.ts';
import type { Build } from '../domain/build.ts';
import type { Deployment } from '../domain/deployment.ts';

/** Persistence ports. Backed by DynamoDB in production, in-memory fakes locally. */

export interface ClientStore {
  /** Looks up a client by the SHA-256 hex hash of its bearer token. */
  getByTokenHash(tokenHash: string): Promise<ApiClient | null>;
}

export interface BuildStore {
  put(build: Build): Promise<void>;
  get(buildId: string): Promise<Build | null>;
  list(limit: number): Promise<Build[]>;
}

export interface DeploymentStore {
  put(deployment: Deployment): Promise<void>;
  get(deploymentId: string): Promise<Deployment | null>;
  /** Deployment history for one target function, newest first. */
  listByFunction(targetFunction: string, limit: number): Promise<Deployment[]>;
}
