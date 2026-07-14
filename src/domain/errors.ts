/**
 * Application error with a stable machine-readable code and an HTTP status.
 * The error-handling decorator maps these to JSON responses; anything else
 * thrown becomes an opaque 500.
 */
export type ErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'deploy_failed'
  | 'internal_error';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  deploy_failed: 502,
  internal_error: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
}

export function badRequest(message: string, details?: unknown): AppError {
  return new AppError('bad_request', message, details);
}

export function unauthorized(message: string): AppError {
  return new AppError('unauthorized', message);
}

export function forbidden(message: string): AppError {
  return new AppError('forbidden', message);
}

export function notFound(message: string): AppError {
  return new AppError('not_found', message);
}

export function conflict(message: string): AppError {
  return new AppError('conflict', message);
}
