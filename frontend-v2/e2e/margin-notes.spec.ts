import { test, expect } from '@playwright/test';
import {
  installApiFixtures,
  seedAuthenticatedSession,
  type Page,
} from './support/reader-fixtures';

// Three highlights clustered near the top of page 1 with long content, so
// measured stacking has to separate them in the gutters.
const seeded = [0.08, 0.1, 0.12].map((top, i) => ({
  id: 101 + i,
  paper_id: 1,
  user_id: 7,
  type: 'annotation',
  content: `Margin note ${i + 1} with enough copy to wrap across several lines and occupy real vertical space in the gutter column.`,
  highlighted_text: 'selected passage',
  selection_data: {
    rects: [{ left: 0.15, top, width: 0.5, height: 0.02 }],
    color: 'blue',
  },
  coordinate_data: { page: 1, x: 0.4, y: top },
  highlight_type: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}));

// Like openReader, but tolerant of viewports where the chrome title is
// hidden — we wait for the reader's own text layer instead.
async function openReaderAt(page: Page) {
  await seedAuthenticatedSession(page);
  await installApiFixtures(page);
  await page.goto('/papers/1');
}

async function seedAnnotations(page: Page) {
  // Register AFTER openReader's fixtures: Playwright matches routes
  // newest-first; GETs fall through to the catch-all via route.fallback().
  await page.route('**/api/v1/papers/1/annotations', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(seeded),
    });
  });
}

async function waitUsable(page: Page) {
  const textLayer = page
    .locator('[data-pdf-viewer-page="1"] .react-pdf__Page__textContent')
    .first();
  await expect(textLayer).toBeVisible({ timeout: 20_000 });
}

test('margin notes measure and stack without overlapping at desktop width', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await openReaderAt(page);
  await seedAnnotations(page);
  await page.reload();
  await waitUsable(page);

  const notes = page.locator('[data-testid="margin-note"]');
  await expect(notes).toHaveCount(3);

  // No two margin cards may overlap.
  const overlap = await page.evaluate(() => {
    const boxes = Array.from(
      document.querySelectorAll('[data-testid="margin-note"]'),
    ).map((el) => el.getBoundingClientRect());
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (
          a.left < b.right &&
          b.left < a.right &&
          a.top < b.bottom &&
          b.top < a.bottom
        )
          return true;
      }
    }
    return false;
  });
  expect(overlap).toBe(false);

  // Every card sits in a gutter: fully beside the rendered page, never on it.
  const boxes = [];
  for (let i = 0; i < 3; i++) boxes.push(await notes.nth(i).boundingBox());
  const pageBox = await page
    .locator('[data-pdf-viewer-page="1"] canvas')
    .first()
    .boundingBox();
  expect(pageBox).not.toBeNull();
  for (const box of boxes) {
    expect(box).not.toBeNull();
    const inLeftGutter = box!.x + box!.width <= pageBox!.x + 1;
    const inRightGutter = box!.x >= pageBox!.x + pageBox!.width - 1;
    expect(inLeftGutter || inRightGutter).toBe(true);
  }
});

test('narrow viewport falls back to inline markers instead of margin cards', async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await openReaderAt(page);
  await seedAnnotations(page);
  await page.reload();
  await waitUsable(page);

  await expect(page.locator('[data-testid="margin-note"]')).toHaveCount(0);
  // Inline anchored markers take over below the approved width.
  await expect(
    page.getByRole('button', { name: /Open annotation/ }).first(),
  ).toBeVisible();
});
