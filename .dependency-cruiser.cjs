/**
 * Architecture guardrails (npm run check:architecture).
 * Dependency direction is documented in ARCHITECTURE.md#dependency-direction;
 * these rules enforce it mechanically.
 */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'Circular dependency. Break the cycle by moving the shared type into the inner layer. See ARCHITECTURE.md#dependency-direction.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'domain-stays-pure',
      severity: 'error',
      comment:
        'src/domain may import only src/domain and the Node standard library. Move transport, persistence, or wiring concerns out of the domain. See ARCHITECTURE.md#dependency-direction.',
      from: { path: '^src/domain' },
      to: { path: '^src/(http|services|adapters|ports|local|observability)' },
    },
    {
      name: 'ports-depend-only-on-domain',
      severity: 'error',
      comment:
        'src/ports defines interfaces over infrastructure; it may import only src/domain. Implementations belong in src/adapters. See ARCHITECTURE.md#dependency-direction.',
      from: { path: '^src/ports' },
      to: { path: '^src/(http|services|adapters|local|observability)' },
    },
    {
      name: 'services-do-not-know-transport',
      severity: 'error',
      comment:
        'src/services holds application logic and may not import HTTP, adapters, or local wiring. Depend on a port interface instead. See ARCHITECTURE.md#dependency-direction.',
      from: { path: '^src/services' },
      to: { path: '^src/(http|adapters|local)' },
    },
    {
      name: 'http-does-not-touch-adapters',
      severity: 'error',
      comment:
        'src/http receives adapters through createPipeline(deps); it may not import concrete adapters. Add the dependency to the Dependencies interface instead. See ARCHITECTURE.md#dependency-direction.',
      from: { path: '^src/http' },
      to: { path: '^src/(adapters|local)' },
    },
    {
      name: 'adapters-do-not-import-http-or-services',
      severity: 'error',
      comment:
        'src/adapters implements ports and may not reach into HTTP or services. See ARCHITECTURE.md#dependency-direction.',
      from: { path: '^src/adapters' },
      to: { path: '^src/(http|services|local)' },
    },
    {
      name: 'lambda-entry-never-uses-fakes',
      severity: 'error',
      comment:
        'The production entrypoint src/lambda.ts must wire real AWS adapters only. Fakes belong to src/local and tests. See ARCHITECTURE.md#composition-roots.',
      from: { path: '^src/lambda\\.ts$' },
      to: { path: '^src/(adapters/fake|local)' },
    },
    {
      name: 'local-dev-never-uses-aws',
      severity: 'error',
      comment:
        'src/local must work without AWS access; it may not import src/adapters/aws. See docs/DEVELOPMENT.md#local-development. ',
      from: { path: '^src/local' },
      to: { path: '^src/adapters/aws' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.ts', '.mjs', '.js'],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
