import { describe, expect, it } from 'vitest';
import { hashToken } from '../../src/domain/client.ts';
import { createHarness, KNOWN_FUNCTION, UPLOAD_ONLY_TOKEN } from '../helpers/test-harness.ts';

/**
 * Pipeline-level tests: the full decorator composition with fake adapters,
 * exercising endpoint behavior including authorization and validation
 * failure paths.
 */

async function registerAvailableBuild(harness: ReturnType<typeof createHarness>): Promise<string> {
  const register = await harness.send({
    method: 'POST',
    path: '/v1/builds',
    body: JSON.stringify({ name: 'svc' }),
  });
  const { build } = register.body as { build: { buildId: string; s3Key: string } };
  harness.artifacts.putObject(build.s3Key, 42);
  await harness.send({ method: 'POST', path: `/v1/builds/${build.buildId}/complete` });
  return build.buildId;
}

describe('build endpoints', () => {
  it('registers a build and returns a presigned upload URL', async () => {
    const harness = createHarness();
    const response = await harness.send({
      method: 'POST',
      path: '/v1/builds',
      body: JSON.stringify({ name: 'orders-service', gitCommit: 'abc1234' }),
    });
    expect(response.status).toBe(201);
    const body = response.body as {
      build: { buildId: string; status: string; createdBy: string };
      uploadUrl: string;
    };
    expect(body.build.status).toBe('pending_upload');
    expect(body.build.createdBy).toBe('ci-full');
    expect(body.uploadUrl).toContain(body.build.buildId);
  });

  it('rejects invalid build names with field-level details', async () => {
    const harness = createHarness();
    const response = await harness.send({
      method: 'POST',
      path: '/v1/builds',
      body: JSON.stringify({ name: 'bad name with spaces!' }),
    });
    expect(response.status).toBe(400);
    const body = response.body as { error: { code: string; details: { path: string }[] } };
    expect(body.error.code).toBe('bad_request');
    expect(body.error.details[0]!.path).toBe('name');
  });

  it('rejects completing before the package exists in storage', async () => {
    const harness = createHarness();
    const register = await harness.send({
      method: 'POST',
      path: '/v1/builds',
      body: JSON.stringify({ name: 'svc' }),
    });
    const { build } = register.body as { build: { buildId: string } };

    const complete = await harness.send({
      method: 'POST',
      path: `/v1/builds/${build.buildId}/complete`,
    });
    expect(complete.status).toBe(400);
    expect(JSON.stringify(complete.body)).toContain('Upload to the presigned URL');
  });

  it('returns 409 when completing an already-completed build', async () => {
    const harness = createHarness();
    const buildId = await registerAvailableBuild(harness);
    const again = await harness.send({ method: 'POST', path: `/v1/builds/${buildId}/complete` });
    expect(again.status).toBe(409);
    expect((again.body as { error: { code: string } }).error.code).toBe('conflict');
  });

  it('rejects a malformed JSON body with 400', async () => {
    const harness = createHarness();
    const response = await harness.send({
      method: 'POST',
      path: '/v1/builds',
      body: '{not json',
    });
    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).toContain('not valid JSON');
  });

  it('returns 404 for an unknown build', async () => {
    const harness = createHarness();
    const response = await harness.send({ method: 'GET', path: '/v1/builds/nope' });
    expect(response.status).toBe(404);
  });
});

describe('deployment endpoints', () => {
  it('deploys an available build and records the full transition history', async () => {
    const harness = createHarness();
    const buildId = await registerAvailableBuild(harness);

    const deploy = await harness.send({
      method: 'POST',
      path: '/v1/deployments',
      body: JSON.stringify({ buildId, targetFunction: KNOWN_FUNCTION }),
    });
    expect(deploy.status).toBe(201);
    const { deployment } = deploy.body as {
      deployment: {
        deploymentId: string;
        status: string;
        transitions: { status: string }[];
        result: { codeSha256: string };
      };
    };
    expect(deployment.status).toBe('succeeded');
    expect(deployment.transitions.map((t) => t.status)).toEqual([
      'requested',
      'in_progress',
      'succeeded',
    ]);
    expect(deployment.result.codeSha256).not.toBe('');

    const history = await harness.send({
      method: 'GET',
      path: '/v1/deployments',
      query: { function: KNOWN_FUNCTION },
    });
    expect(history.status).toBe(200);
    expect((history.body as { deployments: unknown[] }).deployments).toHaveLength(1);
  });

  it('records a failed deployment when the Lambda control plane rejects the update', async () => {
    const harness = createHarness();
    // Allow-list a function the fake control plane does not know, so the
    // authorization check passes but UpdateFunctionCode fails.
    harness.clients.seed(hashToken('ghost-token'), {
      clientId: 'ci-ghost',
      scopes: ['upload', 'deploy'],
      allowedFunctions: ['ghost-function'],
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    const buildId = await registerAvailableBuild(harness);

    const deploy = await harness.send({
      method: 'POST',
      path: '/v1/deployments',
      headers: { authorization: 'Bearer ghost-token' },
      body: JSON.stringify({ buildId, targetFunction: 'ghost-function' }),
    });
    expect(deploy.status).toBe(502);
    const { deployment } = deploy.body as {
      deployment: { deploymentId: string; status: string; error: string };
    };
    expect(deployment.status).toBe('failed');
    expect(deployment.error).toContain('ResourceNotFoundException');

    // The failed attempt is still queryable as an audit record.
    const fetched = await harness.send({
      method: 'GET',
      path: `/v1/deployments/${deployment.deploymentId}`,
    });
    expect(fetched.status).toBe(200);
    expect((fetched.body as { deployment: { status: string } }).deployment.status).toBe('failed');
  });

  it('rejects deploying a build that is still pending upload', async () => {
    const harness = createHarness();
    const register = await harness.send({
      method: 'POST',
      path: '/v1/builds',
      body: JSON.stringify({ name: 'svc' }),
    });
    const { build } = register.body as { build: { buildId: string } };

    const deploy = await harness.send({
      method: 'POST',
      path: '/v1/deployments',
      body: JSON.stringify({ buildId: build.buildId, targetFunction: KNOWN_FUNCTION }),
    });
    expect(deploy.status).toBe(400);
    expect(JSON.stringify(deploy.body)).toContain('pending_upload');
  });

  it('forbids deploying without the deploy scope', async () => {
    const harness = createHarness();
    const buildId = await registerAvailableBuild(harness);
    const deploy = await harness.send({
      method: 'POST',
      path: '/v1/deployments',
      headers: { authorization: `Bearer ${UPLOAD_ONLY_TOKEN}` },
      body: JSON.stringify({ buildId, targetFunction: KNOWN_FUNCTION }),
    });
    expect(deploy.status).toBe(403);
    expect(JSON.stringify(deploy.body)).toContain('deploy');
  });

  it('forbids deploying to a function outside the allow-list', async () => {
    const harness = createHarness();
    const buildId = await registerAvailableBuild(harness);
    const deploy = await harness.send({
      method: 'POST',
      path: '/v1/deployments',
      body: JSON.stringify({ buildId, targetFunction: 'not-allow-listed' }),
    });
    expect(deploy.status).toBe(403);
    expect(JSON.stringify(deploy.body)).toContain('not-allow-listed');
  });

  it('requires the function query parameter for history', async () => {
    const harness = createHarness();
    const response = await harness.send({ method: 'GET', path: '/v1/deployments' });
    expect(response.status).toBe(400);
  });
});

describe('cross-cutting behavior', () => {
  it('serves /healthz without authentication', async () => {
    const harness = createHarness();
    const response = await harness.send({ method: 'GET', path: '/healthz', headers: {} });
    expect(response.status).toBe(200);
  });

  it('returns 401 with no token and logs the request anyway', async () => {
    const harness = createHarness();
    const response = await harness.send({ method: 'GET', path: '/v1/builds', headers: {} });
    expect(response.status).toBe(401);
    const end = harness.logs.find((l) => l.message === 'request.end');
    expect(end?.fields).toMatchObject({ status: 401 });
  });

  it('returns 404 as JSON for unknown routes', async () => {
    const harness = createHarness();
    const response = await harness.send({ method: 'GET', path: '/v1/unknown' });
    expect(response.status).toBe(404);
    expect((response.body as { error: { code: string } }).error.code).toBe('not_found');
  });

  it('never leaks the bearer token into logs', async () => {
    const harness = createHarness();
    await harness.send({ method: 'GET', path: '/v1/builds' });
    const allLogs = JSON.stringify(harness.logs);
    expect(allLogs).not.toContain('test-token');
  });
});
