import { startDevServer } from '../src/local/dev-server.ts';

/**
 * Deterministic smoke check (`npm run smoke`). Boots the local dev server on
 * an ephemeral port and drives the critical journey end to end:
 *
 *   register build -> upload package to presigned URL -> complete upload
 *   -> deploy to target function -> read deployment status and history
 *
 * Exits nonzero with a pointed message on the first failed step.
 */

function fail(step: string, detail: unknown): never {
  console.error(`SMOKE FAILED at "${step}": ${JSON.stringify(detail)}`);
  console.error('Rerun with: npm run smoke. See docs/DEVELOPMENT.md#troubleshooting.');
  process.exit(1);
}

async function api(
  baseUrl: string,
  token: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json: unknown = await response.json();
  return { status: response.status, json };
}

const server = await startDevServer(0);
const { baseUrl, token } = server;
console.log(`smoke: dev server at ${baseUrl}`);

try {
  // Health check must work without a token.
  const health = await fetch(`${baseUrl}/healthz`);
  if (health.status !== 200) fail('healthz', { status: health.status });

  // 1. Register a build.
  const register = await api(baseUrl, token, 'POST', '/v1/builds', {
    name: 'smoke-service',
    gitCommit: 'abc1234',
  });
  if (register.status !== 201) fail('register build', register);
  const { build, uploadUrl } = register.json as {
    build: { buildId: string };
    uploadUrl: string;
  };

  // 2. Upload the "package" to the presigned URL (fake S3).
  const packageBytes = Buffer.from('PK\u0003\u0004 fake lambda zip for smoke test');
  const upload = await fetch(uploadUrl, { method: 'PUT', body: packageBytes });
  if (upload.status !== 200) fail('upload package', { status: upload.status });

  // 3. Complete the upload.
  const complete = await api(baseUrl, token, 'POST', `/v1/builds/${build.buildId}/complete`);
  if (complete.status !== 200) fail('complete upload', complete);

  // 4. Deploy to the known local function.
  const deploy = await api(baseUrl, token, 'POST', '/v1/deployments', {
    buildId: build.buildId,
    targetFunction: 'demo-function',
  });
  if (deploy.status !== 201) fail('deploy', deploy);
  const { deployment } = deploy.json as { deployment: { deploymentId: string; status: string } };
  if (deployment.status !== 'succeeded') fail('deploy status', deployment);

  // 5. Query deployment status and history.
  const status = await api(baseUrl, token, 'GET', `/v1/deployments/${deployment.deploymentId}`);
  if (status.status !== 200) fail('get deployment', status);

  const history = await api(baseUrl, token, 'GET', '/v1/deployments?function=demo-function');
  if (history.status !== 200) fail('deployment history', history);
  const { deployments } = history.json as { deployments: unknown[] };
  if (deployments.length < 1) fail('deployment history empty', history.json);

  // 6. A bad token must be rejected.
  const unauthorized = await api(baseUrl, 'wrong-token', 'GET', '/v1/builds');
  if (unauthorized.status !== 401) fail('unauthorized check', unauthorized);

  console.log('smoke: OK (register -> upload -> complete -> deploy -> status -> history -> 401)');
} finally {
  await server.close();
}
