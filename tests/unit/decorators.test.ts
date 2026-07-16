import { describe, expect, it } from 'vitest';
import { FakeClientStore } from '../../src/adapters/fake/fake-stores.ts';
import { hashToken } from '../../src/domain/client.ts';
import { badRequest } from '../../src/domain/errors.ts';
import { withAuthorization } from '../../src/http/decorators/with-authorization.ts';
import { withErrorHandling } from '../../src/http/decorators/with-error-handling.ts';
import { withLogging } from '../../src/http/decorators/with-logging.ts';
import {
  jsonResponse,
  type ApiRequest,
  type Handler,
  type RequestContext,
} from '../../src/http/types.ts';
import type { Logger, LogLevel } from '../../src/ports/logger.ts';

/** Each decorator is tested in isolation by wrapping a stub innermost handler. */

interface CapturedLog {
  level: LogLevel;
  message: string;
  fields: Record<string, unknown>;
}

function captureLogger(sink: CapturedLog[], bound: Record<string, unknown> = {}): Logger {
  return {
    log(level, message, fields) {
      sink.push({ level, message, fields: { ...bound, ...fields } });
    },
    with(fields) {
      return captureLogger(sink, { ...bound, ...fields });
    },
  };
}

function testIds(): { newId(): string } {
  let n = 0;
  return { newId: () => `id-${++n}` };
}

const okHandler: Handler = () => Promise.resolve(jsonResponse(200, { ok: true }));

function request(overrides: Partial<ApiRequest> = {}): ApiRequest {
  return { method: 'GET', path: '/v1/builds', headers: {}, query: {}, body: null, ...overrides };
}

function context(logs: CapturedLog[] = []): RequestContext {
  return { requestId: '', logger: captureLogger(logs), client: null };
}

describe('withLogging', () => {
  it('assigns a request id, scopes the logger, and logs start/end with status', async () => {
    const logs: CapturedLog[] = [];
    const handler = withLogging(captureLogger(logs), testIds())(okHandler);
    const ctx = context();

    const response = await handler(request(), ctx);

    expect(response.status).toBe(200);
    expect(ctx.requestId).toBe('id-1');
    expect(logs.map((l) => l.message)).toEqual(['request.start', 'request.end']);
    expect(logs[1]!.fields).toMatchObject({ requestId: 'id-1', status: 200, path: '/v1/builds' });
  });
});

describe('withErrorHandling', () => {
  it('maps AppError to its status and stable code', async () => {
    const handler = withErrorHandling()(() => {
      throw badRequest('name is bad', [{ path: 'name' }]);
    });
    const logs: CapturedLog[] = [];

    const response = await handler(request(), context(logs));

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: { code: 'bad_request', message: 'name is bad', details: [{ path: 'name' }] },
    });
    expect(logs[0]).toMatchObject({ level: 'warn', message: 'request.error' });
  });

  it('hides unexpected errors behind an opaque 500 but logs the detail', async () => {
    const handler = withErrorHandling()(() => {
      throw new Error('db exploded: password=hunter2');
    });
    const logs: CapturedLog[] = [];

    const response = await handler(request(), context(logs));

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('hunter2');
    expect(logs[0]).toMatchObject({ level: 'error', message: 'request.unhandled_error' });
    expect(logs[0]!.fields['error']).toContain('db exploded');
  });
});

describe('withAuthorization', () => {
  const clients = new FakeClientStore();
  clients.seed(hashToken('good-token'), {
    clientId: 'ci-a',
    scopes: ['upload'],
    allowedFunctions: [],
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  const handler = withErrorHandling()(withAuthorization(clients)(okHandler));

  it('rejects a malformed header with 401', async () => {
    const response = await handler(request({ headers: { authorization: 'Token abc' } }), context());
    expect(response.status).toBe(401);
  });

  it('rejects an unknown token with 401', async () => {
    const response = await handler(
      request({ headers: { authorization: 'Bearer nope' } }),
      context(),
    );
    expect(response.status).toBe(401);
  });

  it('attaches the client and logs the client id on success', async () => {
    const logs: CapturedLog[] = [];
    const ctx = context(logs);
    const response = await handler(
      request({ headers: { authorization: 'Bearer good-token' } }),
      ctx,
    );
    expect(response.status).toBe(200);
    expect(ctx.client?.clientId).toBe('ci-a');
    expect(logs.some((l) => l.message === 'request.authenticated')).toBe(true);
  });
});
