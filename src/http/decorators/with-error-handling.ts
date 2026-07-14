import { AppError } from '../../domain/errors.ts';
import type { Handler, HandlerDecorator } from '../types.ts';

/**
 * Converts thrown errors into JSON error responses. AppError carries a stable
 * code and status; anything else becomes an opaque 500 (details go to the log,
 * never to the client). Sits inside logging so failures are still logged.
 */
export function withErrorHandling(): HandlerDecorator {
  return (next: Handler): Handler =>
    async (req, ctx) => {
      try {
        return await next(req, ctx);
      } catch (error) {
        if (error instanceof AppError) {
          ctx.logger.log(error.status >= 500 ? 'error' : 'warn', 'request.error', {
            code: error.code,
            status: error.status,
            error: error.message,
          });
          return {
            status: error.status,
            body: { error: { code: error.code, message: error.message, details: error.details } },
          };
        }
        ctx.logger.log('error', 'request.unhandled_error', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        return {
          status: 500,
          body: { error: { code: 'internal_error', message: 'Internal server error.' } },
        };
      }
    };
}
