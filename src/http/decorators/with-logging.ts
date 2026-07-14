import type { Handler, HandlerDecorator } from '../types.ts';
import type { Logger } from '../../ports/logger.ts';
import type { IdGenerator } from '../../ports/clock.ts';

/**
 * Outermost decorator. Assigns a request ID, attaches a request-scoped logger
 * to the context, and logs one line at start and completion. Never logs
 * headers or bodies (the Authorization header carries the bearer token).
 */
export function withLogging(baseLogger: Logger, ids: IdGenerator): HandlerDecorator {
  return (next: Handler): Handler =>
    async (req, ctx) => {
      const requestId = ids.newId();
      const logger = baseLogger.with({ requestId, method: req.method, path: req.path });
      ctx.requestId = requestId;
      ctx.logger = logger;

      logger.log('info', 'request.start');
      const startedAt = Date.now();
      const response = await next(req, ctx);
      logger.log('info', 'request.end', {
        status: response.status,
        durationMs: Date.now() - startedAt,
        clientId: ctx.client?.clientId ?? null,
      });
      return response;
    };
}
