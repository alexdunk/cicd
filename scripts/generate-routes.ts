import { mkdir, writeFile } from 'node:fs/promises';
import { buildRoutes } from '../src/http/endpoints/builds.ts';
import { deploymentRoutes } from '../src/http/endpoints/deployments.ts';
import { healthRoutes } from '../src/http/endpoints/health.ts';
import type { BuildService } from '../src/services/build-service.ts';
import type { DeploymentService } from '../src/services/deployment-service.ts';

/**
 * Regenerates docs/generated/routes.md from the route definitions.
 * Run via `npm run generate:routes`; `npm run check:docs` fails when stale.
 *
 * Only method/pattern metadata is read, so the services are never invoked;
 * placeholder instances keep this script decoupled from real dependencies.
 */
const routes = [
  ...healthRoutes(),
  ...buildRoutes(null as unknown as BuildService),
  ...deploymentRoutes(null as unknown as DeploymentService),
];

export function renderRoutesMarkdown(): string {
  const rows = routes.map((route) => `| ${route.method} | \`${route.pattern}\` |`).join('\n');
  return `<!-- GENERATED FILE. Do not edit by hand.
     Source: src/http/endpoints/*  Regenerate: npm run generate:routes -->

# API Route Inventory

| Method | Path |
| --- | --- |
${rows}

Authentication: every route except \`/healthz\` requires \`Authorization: Bearer <token>\`.
Request/response schemas live in \`src/http/request-schemas.ts\` and the endpoint modules.
`;
}

if (process.argv[1]?.endsWith('generate-routes.ts')) {
  await mkdir('docs/generated', { recursive: true });
  await writeFile('docs/generated/routes.md', renderRoutesMarkdown());
  console.log('generated docs/generated/routes.md');
}
