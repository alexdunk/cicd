import { build } from 'esbuild';
import { mkdir, rm } from 'node:fs/promises';

/**
 * Bundles the Lambda handler into dist/lambda/index.mjs for deployment.
 * The CDK stack (infra/) packages dist/lambda as the function code.
 */
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

await build({
  entryPoints: ['src/lambda.ts'],
  outfile: 'dist/lambda/index.mjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  // Keep a single self-contained file; the AWS SDK v3 is bundled so the
  // artifact does not depend on the runtime-provided SDK version.
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  logLevel: 'info',
});

console.log('build: dist/lambda/index.mjs ready');
