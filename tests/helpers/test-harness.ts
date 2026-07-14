import { FakeArtifactStore } from '../../src/adapters/fake/fake-artifact-store.ts';
import { FakeFunctionUpdater } from '../../src/adapters/fake/fake-function-updater.ts';
import {
  FakeBuildStore,
  FakeClientStore,
  FakeDeploymentStore,
} from '../../src/adapters/fake/fake-stores.ts';
import { hashToken, type ApiClient } from '../../src/domain/client.ts';
import { createPipeline, type Dependencies } from '../../src/http/pipeline.ts';
import type { ApiRequest, ApiResponse } from '../../src/http/types.ts';
import type { Logger, LogLevel } from '../../src/ports/logger.ts';

/** Deterministic clock: each call advances one second from a fixed epoch. */
export function testClock(): { now(): string } {
  let tick = 0;
  return {
    now: () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString(),
  };
}

/** Deterministic IDs: id-1, id-2, ... */
export function testIds(): { newId(): string } {
  let n = 0;
  return { newId: () => `id-${++n}` };
}

export interface CapturedLog {
  level: LogLevel;
  message: string;
  fields: Record<string, unknown>;
}

export function captureLogger(sink: CapturedLog[], bound: Record<string, unknown> = {}): Logger {
  return {
    log(level, message, fields) {
      sink.push({ level, message, fields: { ...bound, ...fields } });
    },
    with(fields) {
      return captureLogger(sink, { ...bound, ...fields });
    },
  };
}

export const TEST_TOKEN = 'test-token-with-all-scopes';
export const UPLOAD_ONLY_TOKEN = 'test-token-upload-only';
export const KNOWN_FUNCTION = 'demo-function';

export interface Harness {
  deps: Dependencies;
  logs: CapturedLog[];
  clients: FakeClientStore;
  builds: FakeBuildStore;
  deployments: FakeDeploymentStore;
  artifacts: FakeArtifactStore;
  /** Sends a request through the full pipeline (logging -> errors -> auth -> router). */
  send(req: Partial<ApiRequest> & { method: string; path: string }): Promise<ApiResponse>;
}

/** Full pipeline wired to fakes, with two seeded clients and one known function. */
export function createHarness(): Harness {
  const logs: CapturedLog[] = [];
  const clients = new FakeClientStore();
  const builds = new FakeBuildStore();
  const deployments = new FakeDeploymentStore();
  const artifacts = new FakeArtifactStore(() => 'https://fake-s3.test/upload');

  const fullClient: ApiClient = {
    clientId: 'ci-full',
    scopes: ['upload', 'deploy'],
    allowedFunctions: [KNOWN_FUNCTION],
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  const uploadOnlyClient: ApiClient = {
    clientId: 'ci-upload-only',
    scopes: ['upload'],
    allowedFunctions: [],
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  clients.seed(hashToken(TEST_TOKEN), fullClient);
  clients.seed(hashToken(UPLOAD_ONLY_TOKEN), uploadOnlyClient);

  const deps: Dependencies = {
    logger: captureLogger(logs),
    clock: testClock(),
    ids: testIds(),
    clients,
    builds,
    deployments,
    artifacts,
    functions: new FakeFunctionUpdater(new Set([KNOWN_FUNCTION])),
  };
  const pipeline = createPipeline(deps);

  return {
    deps,
    logs,
    clients,
    builds,
    deployments,
    artifacts,
    send: (req) =>
      pipeline({
        headers: { authorization: `Bearer ${TEST_TOKEN}` },
        query: {},
        body: null,
        ...req,
      }),
  };
}

export function jsonBody(value: unknown): string {
  return JSON.stringify(value);
}
