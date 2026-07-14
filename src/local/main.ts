import { startDevServer } from './dev-server.ts';

/** `npm run dev` entrypoint. PORT=0 (default) picks an ephemeral, worktree-safe port. */
const port = Number(process.env['PORT'] ?? 0);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error(`PORT must be an integer between 0 and 65535, got "${process.env['PORT']}".`);
  process.exit(1);
}

const server = await startDevServer(port);
console.log(
  JSON.stringify({
    message: 'dev_server.listening',
    baseUrl: server.baseUrl,
    healthCheck: `${server.baseUrl}/healthz`,
    token: server.token,
    hint: 'Use: curl -H "Authorization: Bearer <token>" <baseUrl>/v1/builds',
  }),
);
