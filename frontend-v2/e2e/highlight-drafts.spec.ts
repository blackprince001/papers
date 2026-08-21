import { test, expect } from '@playwright/test';
import { openReader } from './support/reader-fixtures';

const createdAnnotation = {
  id: 42,
  paper_id: 1,
  user_id: 7,
  type: 'annotation',
  content: 'selected passage',
  highlighted_text: 'selected passage',
  selection_data: {
    rects: [{ left: 0.1, top: 0.2, width: 0.3, height: 0.1 }],
    color: 'olive',
  },
  coordinate_data: { page: 1, x: 0.25, y: 0.2 },
  highlight_type: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

test('failed highlight save is visible and recoverable via retry', async ({ page }) => {
  let postCount = 0;

  await openReader(page);

  // Register AFTER openReader's fixtures: Playwright matches routes
  // newest-first, so this handler wins over the catch-all. Annotation GETs
  // fall through to the fixtures via route.fallback().
  await page.route('**/api/v1/papers/1/annotations', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    postCount += 1;
    if (postCount === 1) {
      // Hold the failing response so the committing state is observable.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{}' });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(createdAnnotation),
    });
  });

  // The shell chrome renders before the pdf.js document finishes loading;
  // wait for page 1's selectable text layer.
  const textLayer = page
    .locator('[data-pdf-viewer-page="1"] .react-pdf__Page__textContent')
    .first();
  await expect(textLayer).toBeVisible({ timeout: 20_000 });

  // Select the page's text layer contents and release the pointer so the
  // reader captures a selection (the browser finalizes selection on pointerup).
  await page.evaluate(() => {
    const pageEl = document.querySelector('[data-pdf-viewer-page="1"]');
    const layer = pageEl?.querySelector('.react-pdf__Page__textContent');
    if (!pageEl || !layer) throw new Error('reader text layer not rendered');
    const range = document.createRange();
    range.selectNodeContents(layer);
    const selection = window.getSelection();
    if (!selection) throw new Error('no selection object');
    selection.removeAllRanges();
    selection.addRange(range);
    pageEl.dispatchEvent(
      new PointerEvent('pointerup', { bubbles: true }),
    );
  });

  // Selection popover appears; pick a color to create a highlight draft.
  const swatch = page.getByRole('button', { name: 'Highlight olive' });
  await expect(swatch).toBeVisible({ timeout: 10_000 });
  await swatch.click();

  // Draft renders immediately as saving (one rect per selected line)...
  await expect(page.getByLabel('Saving highlight').first()).toBeVisible();
  // ...then the failing POST flips it to failed with recovery controls.
  await expect(page.getByLabel('Highlight failed to save').first()).toBeVisible({
    timeout: 10_000,
  });
  const retry = page.getByRole('button', { name: 'Retry' });
  await expect(retry).toBeVisible();
  expect(postCount).toBe(1);

  // Retry succeeds on the second POST; the draft disappears because the
  // persisted annotation replaces it.
  await retry.click();
  await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0, { timeout: 10_000 });
  expect(postCount).toBe(2);
});
