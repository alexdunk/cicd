import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startDevServer, type DevServer } from '../../src/local/dev-server.ts';

/**
 * Critical-path integration test: real HTTP against the dev server (the same
 * pipeline composition the Lambda uses), covering the first end-to-end
 * product outcome from docs/product-specs/0001-build-upload-and-deploy.md:
 * register -> upload -> complete -> deploy -> status -> history.
 */

let server: DevServer;

beforeAll(async () => {
  server = await startDevServer(0); // ephemeral port: safe in parallel worktrees
});

afterAll(async () => {
  await server.close();
});

async function call(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; json: unknown }> {
  const response = await fetch(`${server.baseUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token ?? server.token}`,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json: unknown = await response.json();
  return { status: response.status, json };
}

describe('upload-and-deploy journey over HTTP', () => {
  it('completes the full slice and records history', async () => {
    // Register.
    const register = await call('POST', '/v1/builds', {
      name: 'orders-service',
      gitCommit: 'deadbeef',
    });
    expect(register.status).toBe(201);
    const { build, uploadUrl } = register.json as {
      build: { buildId: string };
      uploadUrl: string;
    };

    // Upload the package bytes straight to the presigned URL (fake S3),
    // proving the package does not pass through the API endpoints.
    const upload = await fetch(uploadUrl, {
      method: 'PUT',
      body: Buffer.from('PK\u0003\u0004 pretend zip'),
    });
    expect(upload.status).toBe(200);

    // Complete.
    const complete = await call('POST', `/v1/builds/${build.buildId}/complete`);
    expect(complete.status).toBe(200);
    const completed = complete.json as { build: { status: string; sizeBytes: number } };
    expect(completed.build.status).toBe('available');
    expect(completed.build.sizeBytes).toBeGreaterThan(0);

    // Deploy.
    const deploy = await call('POST', '/v1/deployments', {
      buildId: build.buildId,
      targetFunction: 'demo-function',
    });
    expect(deploy.status).toBe(201);
    const { deployment } = deploy.json as {
      deployment: { deploymentId: string; status: string };
    };
    expect(deployment.status).toBe('succeeded');

    // Status.
    const status = await call('GET', `/v1/deployments/${deployment.deploymentId}`);
    expect(status.status).toBe(200);

    // History.
    const history = await call('GET', '/v1/deployments?function=demo-function');
    expect(history.status).toBe(200);
    const { deployments } = history.json as {
      deployments: { deploymentId: string; transitions: { status: string }[] }[];
    };
    expect(deployments.map((d) => d.deploymentId)).toContain(deployment.deploymentId);
    expect(deployments[0]!.transitions.map((t) => t.status)).toEqual([
      'requested',
      'in_progress',
      'succeeded',
    ]);
  });

  it('rejects unknown tokens end to end', async () => {
    const response = await call('GET', '/v1/builds', undefined, 'bogus');
    expect(response.status).toBe(401);
  });

  it('serves the health check without a token', async () => {
    const response = await fetch(`${server.baseUrl}/healthz`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});
