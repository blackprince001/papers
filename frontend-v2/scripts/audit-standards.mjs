#!/usr/bin/env node
/**
 * Static standards gate for the frontend review surfaces.
 * No dependency on the app build: it is safe to run in CI before Vite starts.
 */
import { readFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = join(root, 'src');
const iconsDir = join(src, 'components', 'icons');
const barrelPath = join(iconsDir, 'index.ts');
const metadataPath = join(iconsDir, 'metadata.ts');
const failures = [];

// Existing design-system counters stay informational until their cleanup has a
// dedicated ticket; removing them would hide known drift from reviewers.
const LEGACY_CHECKS = [
  ['old icon-library imports', /from ['"](iconsax-reactjs|@hugeicons|lucide-react)/g],
  ['ad-hoc animate-spin', /animate-spin/g, (file) => file.endsWith('src/components/ui/Spinner.tsx')],
  ['important size overrides', /\b[hwp]-[0-9.]+!/g],
  ['raw status palette classes', /\b(?:bg|text|border)-(?:red|amber|orange|yellow|green|blue)-[0-9]{2,3}\b/g, (file) => file.includes('src/components/shadcn')],
  ['hex colors in tsx', /#[0-9a-fA-F]{3,8}\b/g, (file) => file.includes('src/components/shadcn')],
  ['rounded-md', /\brounded-md\b/g, (file) => file.includes('src/components/shadcn')],
  ['Loading literals', /Loading(?:\.\.\.|…)/g],
  ['toast.custom', /toast\.custom/g],
  ['non-token max-widths on pages', /max-w-(?:240|225|175|3xl|2xl|6xl)\b/g, (file) => !file.includes('src/pages')],
];

const walk = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(path);
  }
  return files;
};

const read = (path) => readFile(path, 'utf8');
const fail = (message) => failures.push(message);

const barrel = await read(barrelPath);
const metadata = await read(metadataPath);
const iconFiles = (await readdir(iconsDir))
  .filter((name) => name.endsWith('.tsx') && !['create-icon.tsx'].includes(name))
  .map((name) => name.slice(0, -4));

for (const name of iconFiles) {
  const file = await read(join(iconsDir, `${name}.tsx`));
  const definition = file.match(/createIcon\(\{([\s\S]*?)\}\);/);
  const iconName = definition?.[1].match(/name:\s*['"]([^'"]+)['"]/)?.[1];
  if (!definition || iconName !== name) {
    fail(`${name}.tsx must define createIcon({ name: '${name}', ... })`);
  }
  if (!new RegExp(`export \\{ [A-Za-z0-9]+Icon \\} from './${name}'`).test(barrel)) {
    fail(`${name}.tsx is not exported by the icon barrel`);
  }
  const metadataEntry = new RegExp(`['"]${name}['"]\\s*:\\s*\\{\\s*duotone:\\s*(true|false)`).exec(metadata);
  if (!metadataEntry) fail(`${name} is missing explicit duotone metadata`);
}

const sourceFiles = await walk(src);
const legacyCounts = new Map(LEGACY_CHECKS.map(([label]) => [label, 0]));
for (const file of sourceFiles) {
  const content = await read(file);
  for (const [label, pattern, excluded] of LEGACY_CHECKS) {
    if (excluded?.(file)) continue;
    legacyCounts.set(label, legacyCounts.get(label) + (content.match(pattern)?.length ?? 0));
  }
}

for (const file of sourceFiles) {
  if (file.startsWith(`${iconsDir}/`)) continue;
  const content = await read(file);
  const directImports = content.matchAll(/from\s+['"]([^'"]*components\/icons\/[^'"]+)['"]/g);
  for (const match of directImports) {
    fail(`${relative(root, file)} imports ${match[1]}; import icons from the barrel`);
  }
}

if (!metadata.includes('satisfies Record<string, IconMetadata>')) {
  fail('icon metadata must satisfy Record<string, IconMetadata>');
}

console.log('Legacy standards counters (informational):');
for (const [label, count] of legacyCounts) console.log(`- ${label}: ${count}`);

if (failures.length) {
  console.error(`Standards audit failed (${failures.length} issue${failures.length === 1 ? '' : 's'}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Standards audit passed: ${iconFiles.length} icons, barrel imports, and duotone metadata.`);
