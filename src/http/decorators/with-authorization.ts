import { hashToken } from '../../domain/client.ts';
import { unauthorized } from '../../domain/errors.ts';
import type { ClientStore } from '../../ports/stores.ts';
import type { Handler, HandlerDecorator } from '../types.ts';

/** Paths reachable without a token. Everything else requires a valid bearer token. */
const PUBLIC_PATHS: ReadonlySet<string> = new Set(['/healthz']);

/**
 * Authenticates the opaque bearer token by looking up its SHA-256 hash in the
 * client store, then records the client on the context so inner layers can
 * enforce scopes and target-function allow-lists. Endpoint-level authorization
 * (scope and allow-list checks) stays next to each protected operation.
 */
export function withAuthorization(clients: ClientStore): HandlerDecorator {
  return (next: Handler): Handler =>
    async (req, ctx) => {
      if (PUBLIC_PATHS.has(req.path)) {
        return next(req, ctx);
      }

      const header = req.headers['authorization'];
      if (!header) {
        throw unauthorized('Missing Authorization header. Expected: Bearer <token>.');
      }
      const match = /^Bearer\s+(\S+)$/i.exec(header);
      if (!match || match[1] === undefined) {
        throw unauthorized('Malformed Authorization header. Expected: Bearer <token>.');
      }

      // Lookup is keyed on the SHA-256 hash, so raw tokens are never stored
      // or compared directly.
      const client = await clients.getByTokenHash(hashToken(match[1]));
      if (!client) {
        throw unauthorized('Unknown or revoked token.');
      }

      ctx.client = client;
      ctx.logger = ctx.logger.with({ clientId: client.clientId });
      ctx.logger.log('info', 'request.authenticated');
      return next(req, ctx);
    };
}
