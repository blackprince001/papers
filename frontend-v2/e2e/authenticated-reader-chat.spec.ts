import { createRequire } from 'node:module';
import { test, expect } from '@playwright/test';
import { installApiFixtures, openReader, seedAuthenticatedSession } from './support/reader-fixtures';

const require = createRequire(import.meta.url);
const pdfjsVersion: string = require('pdfjs-dist/package.json').version;

test('authenticated fixture can open the reader and chat shell', async ({ page }) => {
  await seedAuthenticatedSession(page);
  await installApiFixtures(page);

  await page.goto('/papers/1');

  await expect(page.getByText('Attention Is All You Need').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Toggle thumbnails' })).toBeVisible({ timeout: 15_000 });

  const chatTab = page.getByRole('tab', { name: 'Chat' });
  await chatTab.click();
  await expect(chatTab).toHaveAttribute('data-state', 'active');
  await expect(page.getByPlaceholder(/Ask about this paper/)).toBeVisible();
  await expect(page.getByText('Start a conversation about this paper')).toBeVisible();
});

test('reader loads pdf.js worker and assets from same origin only', async ({ page }) => {
  const cdnRequests: string[] = [];
  const failedLocalAssets: string[] = [];

  page.on('request', (request) => {
    if (/unpkg\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com/.test(request.url())) {
      cdnRequests.push(request.url());
    }
  });
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith('/pdfjs/') && response.status() >= 400) {
      failedLocalAssets.push(`${response.status()} ${url.pathname}`);
    }
  });

  // The served worker must be the pinned same-origin copy of the installed
  // pdfjs-dist version, not a CDN fetch.
  const worker = await page.request.get('/pdfjs/pdf.worker.min.mjs');
  expect(worker.status()).toBe(200);
  expect(worker.headers()['content-type']).toContain('javascript');

  await openReader(page);
  await expect(page.getByRole('button', { name: 'Toggle thumbnails' })).toBeVisible({ timeout: 15_000 });

  expect(cdnRequests, `unexpected CDN requests: ${cdnRequests.join(', ')}`).toEqual([]);
  expect(failedLocalAssets, `missing local pdf.js assets: ${failedLocalAssets.join(', ')}`).toEqual([]);

  const workerBody = await page.request.get('/pdfjs/pdf.worker.min.mjs').then((r) => r.text());
  expect(workerBody).toContain(pdfjsVersion);
});
