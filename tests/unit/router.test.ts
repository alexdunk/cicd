import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/domain/errors.ts';
import { createRouter } from '../../src/http/router.ts';
import { jsonResponse, type ApiRequest, type RequestContext } from '../../src/http/types.ts';

function request(method: string, path: string): ApiRequest {
  return { method, path, headers: {}, query: {}, body: null };
}

const noopLogger: RequestContext['logger'] = {
  log() {},
  with() {
    return noopLogger;
  },
};

const ctx: RequestContext = { requestId: 'r', logger: noopLogger, client: null };

describe('router', () => {
  const router = createRouter([
    {
      method: 'GET',
      pattern: '/v1/builds/{buildId}',
      handler: (_req, _ctx, params) => Promise.resolve(jsonResponse(200, params)),
    },
    {
      method: 'POST',
      pattern: '/v1/builds',
      handler: () => Promise.resolve(jsonResponse(201, {})),
    },
  ]);

  it('dispatches by method and extracts path parameters', async () => {
    const response = await router(request('GET', '/v1/builds/abc-123'), ctx);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ buildId: 'abc-123' });
  });

  it('URL-decodes path parameters', async () => {
    const response = await router(request('GET', '/v1/builds/a%20b'), ctx);
    expect(response.body).toEqual({ buildId: 'a b' });
  });

  it('distinguishes methods on the same path', async () => {
    const response = await router(request('POST', '/v1/builds'), ctx);
    expect(response.status).toBe(201);
  });

  it('throws not_found for unknown paths and wrong depth', async () => {
    await expect(router(request('GET', '/v1/nope'), ctx)).rejects.toThrowError(AppError);
    await expect(router(request('GET', '/v1/builds/a/b'), ctx)).rejects.toThrowError(/No route/);
    await expect(router(request('DELETE', '/v1/builds'), ctx)).rejects.toThrowError(/No route/);
  });
});
