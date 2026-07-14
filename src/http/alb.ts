import type { ALBEvent, ALBResult } from 'aws-lambda';
import type { ApiRequest, ApiResponse } from './types.ts';

/**
 * Conversion between ALB target-group invocation shapes and the
 * transport-neutral ApiRequest/ApiResponse. ALB (unlike API Gateway) requires
 * `statusCode`, `headers`, and a string `body`, and passes query parameters
 * URL-encoded.
 */
export function fromAlbEvent(event: ALBEvent): ApiRequest {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(event.headers ?? {})) {
    if (value !== undefined) headers[key.toLowerCase()] = value;
  }

  const query: Record<string, string> = {};
  for (const [key, value] of Object.entries(event.queryStringParameters ?? {})) {
    if (value !== undefined) query[decodeURIComponent(key)] = decodeURIComponent(value);
  }

  let body: string | null = event.body ?? null;
  if (body !== null && event.isBase64Encoded) {
    body = Buffer.from(body, 'base64').toString('utf8');
  }

  return { method: event.httpMethod, path: event.path, headers, query, body };
}

export function toAlbResult(response: ApiResponse): ALBResult {
  return {
    statusCode: response.status,
    headers: {
      'content-type': 'application/json',
      ...response.headers,
    },
    body: response.body === null ? '' : JSON.stringify(response.body),
    isBase64Encoded: false,
  };
}
