import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Documentation guardrails (npm run check:docs):
 * 1. required knowledge files exist and are not empty placeholders;
 * 2. relative markdown links in tracked docs resolve;
 * 3. every `npm run <script>` mentioned in AGENTS.md exists in package.json.
 */
const problems: string[] = [];

const REQUIRED_FILES = [
  'AGENTS.md',
  'README.md',
  'ARCHITECTURE.md',
  'docs/PRODUCT.md',
  'docs/DEVELOPMENT.md',
  'docs/QUALITY.md',
  'docs/SECURITY.md',
  'docs/design-docs/INDEX.md',
  'docs/product-specs/INDEX.md',
  'docs/exec-plans/tech-debt.md',
];

for (const file of REQUIRED_FILES) {
  if (!existsSync(file)) {
    problems.push(
      `${file}: required knowledge file is missing. See the Knowledge Base section of AGENTS.md.`,
    );
  } else {
    const content = await readFile(file, 'utf8');
    if (content.trim().split('\n').length < 5) {
      problems.push(
        `${file}: looks like an empty placeholder (<5 lines). Fill it in or remove it from REQUIRED_FILES in scripts/check-docs.ts.`,
      );
    }
  }
}

// Collect markdown files (skip node_modules, dist, generated noise).
async function collectMarkdown(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git', 'cdk.out', 'coverage'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await collectMarkdown(full)));
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

const LINK_PATTERN = /\[[^\]]*\]\(([^)]+)\)/g;
for (const file of await collectMarkdown('.')) {
  const content = await readFile(file, 'utf8');
  for (const match of content.matchAll(LINK_PATTERN)) {
    const target = match[1]!;
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const targetPath = target.split('#')[0]!;
    if (targetPath === '') continue;
    const resolved = path.resolve(path.dirname(file), targetPath);
    if (!existsSync(resolved)) {
      problems.push(`${file}: broken relative link "${target}". Fix the path or remove the link.`);
    }
  }
}

// Commands referenced in AGENTS.md must exist.
const agents = await readFile('AGENTS.md', 'utf8');
const pkg = JSON.parse(await readFile('package.json', 'utf8')) as {
  scripts: Record<string, string>;
};
for (const match of agents.matchAll(/npm run ([a-z0-9:_-]+)/g)) {
  const script = match[1]!;
  if (!(script in pkg.scripts)) {
    problems.push(
      `AGENTS.md references "npm run ${script}" but package.json has no such script. Update AGENTS.md or add the script.`,
    );
  }
}

if (problems.length > 0) {
  console.error(`check:docs found ${problems.length} problem(s):\n`);
  for (const problem of problems) console.error(`- ${problem}`);
  console.error('\nRerun with: npm run check:docs');
  process.exit(1);
}
console.log('check:docs OK');
