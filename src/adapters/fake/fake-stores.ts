import type { ApiClient } from '../../domain/client.ts';
import type { Build } from '../../domain/build.ts';
import type { Deployment } from '../../domain/deployment.ts';
import type { BuildStore, ClientStore, DeploymentStore } from '../../ports/stores.ts';

/**
 * In-memory store fakes for local development and tests. They implement the
 * same ports as the DynamoDB adapters, keep state per instance (worktree- and
 * test-safe), and require no AWS access.
 */

export class FakeClientStore implements ClientStore {
  private readonly byTokenHash = new Map<string, ApiClient>();

  seed(tokenHash: string, client: ApiClient): void {
    this.byTokenHash.set(tokenHash, client);
  }

  getByTokenHash(tokenHash: string): Promise<ApiClient | null> {
    return Promise.resolve(this.byTokenHash.get(tokenHash) ?? null);
  }
}

export class FakeBuildStore implements BuildStore {
  private readonly byId = new Map<string, Build>();

  put(build: Build): Promise<void> {
    this.byId.set(build.buildId, build);
    return Promise.resolve();
  }

  get(buildId: string): Promise<Build | null> {
    return Promise.resolve(this.byId.get(buildId) ?? null);
  }

  list(limit: number): Promise<Build[]> {
    const builds = [...this.byId.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
    return Promise.resolve(builds);
  }
}

export class FakeDeploymentStore implements DeploymentStore {
  private readonly byId = new Map<string, Deployment>();

  put(deployment: Deployment): Promise<void> {
    this.byId.set(deployment.deploymentId, deployment);
    return Promise.resolve();
  }

  get(deploymentId: string): Promise<Deployment | null> {
    return Promise.resolve(this.byId.get(deploymentId) ?? null);
  }

  listByFunction(targetFunction: string, limit: number): Promise<Deployment[]> {
    const deployments = [...this.byId.values()]
      .filter((deployment) => deployment.targetFunction === targetFunction)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
    return Promise.resolve(deployments);
  }
}
