#!/usr/bin/env node
/* Standards audit — read-only grep counters for the frontend redesign.
 * Each counter should trend to (and stay at) zero. Run from frontend-v2/. */
import { execSync } from 'node:child_process';

const CHECKS = [
  ['old icon-library imports', String.raw`from ['"](iconsax-reactjs|@hugeicons|lucide-react)`, 'src'],
  ['ad-hoc animate-spin (outside ui/Spinner)', String.raw`animate-spin`, 'src', 'src/components/ui/Spinner.tsx'],
  ['important size overrides (h-N!/w-N!/p-N!)', String.raw`\b[hwp]-[0-9.]+!`, 'src'],
  ['raw status palette classes', String.raw`\b(bg|text|border)-(red|amber|orange|yellow|green|blue)-[0-9]{2,3}\b`, 'src', 'src/components/shadcn'],
  ['hex colors in tsx', String.raw`#[0-9a-fA-F]{3,8}\b`, 'src', 'src/components/shadcn'],
  ['rounded-md (resolve to badge/control tier)', String.raw`\brounded-md\b`, 'src', 'src/components/shadcn'],
  ['"Loading..." literals', String.raw`Loading(\.\.\.|…)`, 'src'],
  ['toast.custom', String.raw`toast\.custom`, 'src'],
  ['non-token max-widths on pages', String.raw`max-w-(240|225|175|3xl|2xl|6xl)\b`, 'src/pages'],
];

let total = 0;
for (const [label, pattern, path, exclude] of CHECKS) {
  let out = '';
  try {
    out = execSync(
      `grep -rEn ${JSON.stringify(pattern)} ${path} --include='*.tsx' --include='*.ts' ${
        exclude ? `| grep -v ${JSON.stringify(exclude)}` : ''
      } | wc -l`,
      { encoding: 'utf8' },
    );
  } catch {
    out = '0';
  }
  const count = parseInt(out.trim(), 10) || 0;
  total += count;
  const mark = count === 0 ? '✓' : '✗';
  console.log(`${mark} ${String(count).padStart(4)}  ${label}`);
}
console.log(`\ntotal offenders: ${total}`);
process.exitCode = 0;
