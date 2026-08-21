import { test, expect } from '@playwright/test';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  installApiFixtures,
  seedAuthenticatedSession,
} from './support/reader-fixtures';

// The bundled fixture PDF has one page; generate a three-page document so
// restore and navigation are observable.
async function threePagePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 3; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`Page ${i} of the reading position test document.`, {
      x: 72,
      y: 770,
      size: 18,
      font,
    });
  }
  return Buffer.from(await doc.save());
}

const STORAGE_KEY = 'lumen:reading-position:1';

// Serve the multi-page document at the fixture's file endpoint. Registered
// after installApiFixtures, so Playwright's newest-first matching wins.
async function serveMultiPagePdf(
  page: import('@playwright/test').Page,
  pdf: Buffer,
) {
  await page.route('**/papers/1/file', (route) =>
    route.fulfill({ status: 200, contentType: 'application/pdf', body: pdf }),
  );
}

test('returns to the stored page after reopening a paper', async ({ page }) => {
  const pdf = await threePagePdf();
  await seedAuthenticatedSession(page);
  await installApiFixtures(page);
  await serveMultiPagePdf(page, pdf);
  await page.goto('/papers/1');

  const pageTwo = page.locator('[data-pdf-viewer-page="2"]');
  await expect(
    page.locator('[data-pdf-viewer-page="1"] canvas').first(),
  ).toBeVisible({ timeout: 20_000 });

  // Read to page two; the viewer scrolls in its own container, so assert
  // on the recorded position rather than window.scrollY.
  await pageTwo.scrollIntoViewIfNeeded();
  await expect
    .poll(async () => {
      const raw = await page.evaluate(
        (k) => localStorage.getItem(k),
        STORAGE_KEY,
      );
      return JSON.parse(raw ?? '{}').page;
    })
    .toBe(2);

  // Reopen: the reader should come back on page two, not page one.
  await page.reload();
  await expect(pageTwo).toBeVisible({ timeout: 20_000 });
  const restored = await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY);
  expect(JSON.parse(restored ?? '{}')).toMatchObject({ page: 2 });
});

test('a stored position never regresses to page one from load signals', async ({
  page,
}) => {
  const pdf = await threePagePdf();
  await seedAuthenticatedSession(page);
  await installApiFixtures(page);
  await serveMultiPagePdf(page, pdf);
  // Simulate a previous session that ended on page three.
  await page.addInitScript(
    ([k, v]) => window.localStorage.setItem(k!, v!),
    [STORAGE_KEY, JSON.stringify({ page: 3, savedAt: Date.now() })] as const,
  );
  await page.goto('/papers/1');

  await expect(
    page.locator('[data-pdf-viewer-page="3"]').first(),
  ).toBeVisible({ timeout: 20_000 });

  // Give any load-time page-one signal time to fire, then confirm the
  // stored position survived them all.
  await page.waitForTimeout(1500);
  const stored = await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY);
  expect(JSON.parse(stored ?? '{}')).toMatchObject({ page: 3 });
});
