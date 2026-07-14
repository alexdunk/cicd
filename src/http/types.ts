import type { ApiClient } from '../domain/client.ts';
import type { Logger } from '../ports/logger.ts';

/**
 * Transport-neutral request/response used by the whole pipeline. The ALB
 * event shape is converted to/from these types at the outermost edge only
 * (src/http/alb.ts), so decorators and endpoints never see ALB specifics.
 */
export interface ApiRequest {
  method: string;
  /** Path without query string, e.g. "/v1/builds". */
  path: string;
  headers: Record<string, string>;
  query: Record<string, string>;
  /** Decoded UTF-8 body, or null when absent. */
  body: string | null;
}

export interface ApiResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

/**
 * Per-request context threaded through the pipeline. Decorators fill it in:
 * the logger decorator sets `logger`/`requestId`; the authorizer sets `client`.
 */
export interface RequestContext {
  requestId: string;
  logger: Logger;
  /** Authenticated client, or null before/without authentication. */
  client: ApiClient | null;
}

export type Handler = (req: ApiRequest, ctx: RequestContext) => Promise<ApiResponse>;

/** A decorator wraps a handler and returns a handler with the same shape. */
export type HandlerDecorator = (next: Handler) => Handler;

export function jsonResponse(status: number, body: unknown): ApiResponse {
  return { status, body };
}
