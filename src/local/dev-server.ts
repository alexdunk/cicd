import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { FakeArtifactStore } from '../adapters/fake/fake-artifact-store.ts';
import { FakeFunctionUpdater } from '../adapters/fake/fake-function-updater.ts';
import {
  FakeBuildStore,
  FakeClientStore,
  FakeDeploymentStore,
} from '../adapters/fake/fake-stores.ts';
import { systemClock, uuidGenerator } from '../adapters/system.ts';
import { hashToken } from '../domain/client.ts';
import { createPipeline, type Dependencies } from '../http/pipeline.ts';
import type { ApiRequest } from '../http/types.ts';
import { createConsoleLogger } from '../observability/console-logger.ts';

/**
 * Local development server. Emulates the whole stack in one process with no
 * AWS access:
 *
 * - the API pipeline, exactly as composed for Lambda (same createPipeline);
 * - a fake S3 endpoint at /_fake-s3/* that accepts presigned-style PUTs;
 * - a fake Lambda control plane that knows the functions listed below.
 *
 * Worktree-safety: all state is in-memory and per-process, and PORT=0
 * (the default) picks an ephemeral port, so parallel checkouts never collide.
 */

const LOCAL_TOKEN = process.env['LOCAL_DEV_TOKEN'] ?? 'local-dev-token';
const LOCAL_FUNCTIONS = ['demo-function', 'orders-service'];
const FAKE_S3_PREFIX = '/_fake-s3/';

export interface DevServer {
  baseUrl: string;
  token: string;
  close(): Promise<void>;
}

export async function startDevServer(port: number): Promise<DevServer> {
  const logger = createConsoleLogger((process.env['LOG_LEVEL'] as never) ?? 'info');
  const clients = new FakeClientStore();
  clients.seed(hashToken(LOCAL_TOKEN), {
    clientId: 'local-dev',
    scopes: ['upload', 'deploy'],
    allowedFunctions: LOCAL_FUNCTIONS,
    createdAt: systemClock.now(),
  });

  // The artifact store needs the server's URL for upload links, but the port
  // is only known after listen(); resolve it lazily via this box.
  const baseUrlBox = { url: '' };
  const artifacts = new FakeArtifactStore(() => `${baseUrlBox.url}/_fake-s3`);
  const deps: Dependencies = {
    logger,
    clock: systemClock,
    ids: uuidGenerator,
    clients,
    builds: new FakeBuildStore(),
    deployments: new FakeDeploymentStore(),
    artifacts,
    functions: new FakeFunctionUpdater(new Set(LOCAL_FUNCTIONS)),
  };
  const pipeline = createPipeline(deps);

  const server = createServer((req, res) => {
    void route(req, res).catch((error: unknown) => {
      logger.log('error', 'dev_server.unhandled_error', { error: String(error) });
      res.writeHead(500).end();
    });
  });

  async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', baseUrlBox.url);

    // Fake S3: accept the "presigned" PUT and record the object.
    if (url.pathname.startsWith(FAKE_S3_PREFIX)) {
      if (req.method !== 'PUT') {
        res.writeHead(405, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Fake S3 supports PUT only.' }));
        return;
      }
      const key = url.pathname.slice(FAKE_S3_PREFIX.length);
      const size = await drainSize(req);
      artifacts.putObject(key, size);
      logger.log('info', 'fake_s3.object_put', { key, sizeBytes: size });
      res.writeHead(200).end();
      return;
    }

    const apiRequest: ApiRequest = {
      method: req.method ?? 'GET',
      path: url.pathname,
      headers: Object.fromEntries(
        Object.entries(req.headers).flatMap(([k, v]) =>
          typeof v === 'string' ? [[k.toLowerCase(), v]] : [],
        ),
      ),
      query: Object.fromEntries(url.searchParams),
      body: await drainBody(req),
    };
    const response = await pipeline(apiRequest);
    res.writeHead(response.status, { 'content-type': 'application/json', ...response.headers });
    res.end(JSON.stringify(response.body));
  }

  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Dev server failed to bind to a TCP port.');
  }
  baseUrlBox.url = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl: baseUrlBox.url,
    token: LOCAL_TOKEN,
    close: () => new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  };
}

async function drainBody(req: IncomingMessage): Promise<string | null> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return null;
  return Buffer.concat(chunks).toString('utf8');
}

async function drainSize(req: IncomingMessage): Promise<number> {
  let size = 0;
  for await (const chunk of req) size += (chunk as Buffer).length;
  return size;
}
