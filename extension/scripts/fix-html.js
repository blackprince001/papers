#!/usr/bin/env node
/**
 * Post-build script to fix HTML file script references
 * This ensures the extension works even if the build plugin doesn't update script tags
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const distDir = join(__dirname, '..', 'dist');
const assetsDir = join(distDir, 'assets');

if (!existsSync(distDir)) {
  console.error('dist/ directory not found. Run build first.');
  process.exit(1);
}

// Find JS files in assets
const jsFiles = existsSync(assetsDir)
  ? readdirSync(assetsDir).filter((f) => f.endsWith('.js'))
  : [];

// Map of expected entry points
const entryPoints = {
  popup: jsFiles.find((f) => f.includes('popup')),
  options: jsFiles.find((f) => f.includes('options')),
};

function fixHTML(file, entryName) {
  const filePath = join(distDir, file);
  if (!existsSync(filePath)) {
    console.warn(`File not found: ${file}`);
    return;
  }

  let content = readFileSync(filePath, 'utf-8');
  const jsFile = entryPoints[entryName];

  if (jsFile) {
    // Replace script tag with correct path
    content = content.replace(
      /<script[^>]*src=["']([^"']*\.js)["'][^>]*><\/script>/,
      `<script type="module" src="/assets/${jsFile}"></script>`
    );
    writeFileSync(filePath, content, 'utf-8');
    console.log(`✓ Fixed ${file} -> /assets/${jsFile}`);
  } else {
    console.warn(`No JS file found for ${entryName}`);
  }
}

// Fix HTML files
fixHTML('popup.html', 'popup');
fixHTML('options.html', 'options');

console.log('✓ HTML files fixed');















