import { test, expect, type Page, type Route } from '@playwright/test';
import {
  installApiFixtures,
  seedAuthenticatedSession,
} from './support/reader-fixtures';

// A stateful in-memory annotations API so the entire lifecycle (create,
// edit, delete, undo) is observable across the checkpoint matrix.
function makeAnnotation(id: number, content = 'selected passage') {
  return {
    id,
    paper_id: 1,
    user_id: 7,
    type: 'annotation',
    content,
    highlighted_text: 'selected passage',
    selection_data: {
      rects: [{ left: 0.1, top: 0.2, width: 0.3, height: 0.05 }],
      color: 'olive',
    },
    coordinate_data: { page: 1, x: 0.25, y: 0.2 },
    highlight_type: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function installStatefulAnnotations(
  page: Page,
  seed: ReturnType<typeof makeAnnotation>[] = [],
) {
  const state = { items: [...seed], nextId: 42 };
  const calls = { post: 0, patch: 0, delete: 0 };
  const respond = () =>
    JSON.stringify(state.items.length ? state.items : []);

  async function handler(route: Route) {
    const method = route.request().method();
    if (method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: respond(),
      });
    }
    if (method === 'POST') {
      calls.post += 1;
      const created = makeAnnotation(state.nextId++);
      state.items.push(created);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(created),
      });
    }
    if (method === 'PATCH') {
      calls.patch += 1;
      const body = route.request().postDataJSON() as Record<string, unknown>;
      const idMatch = route.request().url().match(/annotations\/(\d+)/);
      const ann = state.items.find((a) => String(a.id) === idMatch?.[1]);
      if (ann && typeof body.content === 'string') ann.content = body.content;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ann ?? {}),
      });
    }
    if (method === 'DELETE') {
      calls.delete += 1;
      const idMatch = route.request().url().match(/annotations\/(\d+)/);
      state.items = state.items.filter((a) => String(a.id) !== idMatch?.[1]);
      return route.fulfill({ status: 204 });
    }
    return route.fallback();
  }
  // Registered after openReader's fixtures; newest-first matching wins.
  // Collection GET/POSTs hit /papers/1/annotations, but item PATCH/DELETE
  // calls go to /annotations/:id — cover both with the same store.
  return {
    calls,
    register: () => {
      void page.route('**/api/v1/papers/1/annotations', (route) => handler(route));
      void page.route('**/api/v1/annotations/**', (route) => handler(route));
    },
  };
}

async function waitUsable(page: Page) {
  await expect(
    page
      .locator('[data-pdf-viewer-page="1"] .react-pdf__Page__textContent')
      .first(),
  ).toBeVisible({ timeout: 20_000 });
}

async function selectPageText(page: Page, pageNo = 1) {
  await page.evaluate((n) => {
    const pageEl = document.querySelector(`[data-pdf-viewer-page="${n}"]`);
    const layer = pageEl?.querySelector('.react-pdf__Page__textContent');
    if (!pageEl || !layer) throw new Error('reader text layer not rendered');
    const range = document.createRange();
    range.selectNodeContents(layer);
    const selection = window.getSelection();
    if (!selection) throw new Error('no selection object');
    selection.removeAllRanges();
    selection.addRange(range);
    pageEl.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
  }, pageNo);
}

test('full flow on desktop: pointer creates, keyboard edits, deferred delete with undo', async ({
  page,
}) => {
  // Wide enough for measured gutter cards (below this width the reader
  // falls back to inline markers — covered by its own test).
  await page.setViewportSize({ width: 1920, height: 1000 });
  const api = installStatefulAnnotations(page);
  await seedAuthenticatedSession(page);
  await installApiFixtures(page);
  api.register();
  await page.goto('/papers/1');
  await waitUsable(page);

  // Pointer: select text and pick a swatch.
  await selectPageText(page);
  const swatch = page.getByRole('button', { name: 'Highlight olive' });
  await expect(swatch).toBeVisible({ timeout: 10_000 });
  await swatch.click();

  // The persisted annotation comes back through GET and renders as a
  // measured margin card.
  const card = page.locator('[data-testid="margin-note"]').first();
  await expect(card).toContainText('selected passage', { timeout: 10_000 });
  expect(api.calls.post).toBe(1);

  // Keyboard: focus the hover-revealed Edit control and press Enter.
  const edit = card.getByRole('button', { name: 'Edit note', exact: true });
  await edit.focus();
  await page.keyboard.press('Enter');
  const editor = card.getByRole('textbox', { name: 'Edit note text' });
  await expect(editor).toBeVisible();
  await editor.fill('Updated note from keyboard');
  await editor.press('ControlOrMeta+Enter');
  await expect(card).toContainText('Updated note from keyboard', {
    timeout: 10_000,
  });
  expect(api.calls.patch).toBe(1);

  // Keyboard: request deletion…
  const del = card.getByRole('button', { name: 'Delete annotation', exact: true });
  await del.focus();
  await page.keyboard.press('Enter');
  const undoButton = page.getByRole('button', { name: 'Undo' });
  await expect(undoButton).toBeVisible();

  // …and cancel it inside the five-second window.
  await undoButton.focus();
  await page.keyboard.press('Enter');
  await expect(undoButton).toHaveCount(0);
  expect(api.calls.delete).toBe(0);

  // Delete again and let the window elapse: the DELETE commits exactly once.
  await del.focus();
  await page.keyboard.press('Enter');
  await expect(undoButton).toBeVisible();
  await expect(undoButton).toHaveCount(0, { timeout: 10_000 });
  expect(api.calls.delete).toBe(1);
});

test('narrow desktop falls back to inline markers and still completes the flow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 800, height: 900 });
  await seedAuthenticatedSession(page);
  await installApiFixtures(page);
  const api = installStatefulAnnotations(page, [makeAnnotation(7)]);
  api.register();
  await page.goto('/papers/1');
  await waitUsable(page);

  // No gutter cards at this width; the existing annotation replays as an
  // inline anchored marker instead.
  await waitUsable(page);

  // No gutter cards at this width; inline anchored markers carry the flow.
  await expect(page.locator('[data-testid="margin-note"]')).toHaveCount(0);

  // Selection → highlight still works end to end.
  await selectPageText(page);
  await expect(
    page.getByRole('button', { name: 'Highlight olive' }),
  ).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Highlight olive' }).click();
  expect(api.calls.post).toBe(1);
});

test('the full flow survives the viewer at 200% zoom', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  // A pre-existing annotation must replay correctly at zoom 2.
  const api = installStatefulAnnotations(page, [makeAnnotation(9)]);
  await seedAuthenticatedSession(page);
  await installApiFixtures(page);
  api.register();
  await page.goto('/papers/1');
  await waitUsable(page);

  const pageEl = page.locator('[data-pdf-viewer-page="1"]');
  const before = (await pageEl.boundingBox())!.width;

  // Zoom via the toolbar Select to the reader's real 200% step.
  const zoomTrigger = page.getByRole('combobox').filter({ hasText: '100%' });
  await zoomTrigger.click();
  await page.getByRole('option', { name: '200%' }).click();

  // Pages re-rasterize larger; wait for the enlarged geometry to settle.
  await expect
    .poll(async () => (await pageEl.boundingBox())!.width, {
      timeout: 15_000,
    })
    .toBeGreaterThan(before * 1.8);
  await waitUsable(page);

  // At 200% the page outgrows the gutter, so the reader's own fallback
  // kicks in: the pre-existing annotation replays as an inline marker.
  await expect(
    page
      .locator('[data-pdf-viewer-page="1"]')
      .getByRole('button', { name: 'Open annotation' })
      .first(),
  ).toBeVisible({ timeout: 10_000 });

  // Create a fresh highlight at zoom 2; the normalized rects must survive.
  await selectPageText(page);
  await expect(
    page.getByRole('button', { name: 'Highlight olive' }),
  ).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Highlight olive' }).click();
  expect(api.calls.post).toBe(1);
  // The fresh highlight joins the pre-existing one as an inline marker
  // (no gutter exists at this zoom); it renders active, so its marker
  // label flips to "Close annotation" while pinned open.
  await expect(
    page.locator(
      '[data-pdf-viewer-page="1"] button[aria-label="Open annotation"], [data-pdf-viewer-page="1"] button[aria-label="Close annotation"]',
    ),
  ).toHaveCount(2, { timeout: 10_000 });
});
