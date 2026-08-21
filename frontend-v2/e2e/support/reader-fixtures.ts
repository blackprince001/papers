import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page, type Route } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pdfFixture = readFileSync(join(__dirname, '..', 'fixtures', 'sample.pdf'));

export const paper = {
  id: 1,
  title: 'Attention Is All You Need',
  authors: 'Ashish Vaswani, Noam Shazeer',
  file_url: '/papers/1/file',
  processing_status: 'completed',
  reading_status: 'in_progress',
  reading_time_minutes: 3,
  last_read_page: 1,
  priority: 'medium',
  tags: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  my_permission: 'owner',
};

const user = {
  id: 7,
  email: 'reader@example.test',
  display_name: 'Reader Fixture',
  avatar_url: null,
  organization: null,
  department: null,
  research_field: null,
  role: 'user',
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
};

export async function seedAuthenticatedSession(page: Page) {
  await page.addInitScript(({ session }) => {
    window.localStorage.setItem('auth_session', JSON.stringify(session));
    // Simulate a pre-fix persisted tab record. The provider must migrate it
    // before the reader registers the same paper under Strict Mode.
    window.localStorage.setItem('nexus-tabs', JSON.stringify({
      tabs: [{
        id: 'legacy-tab-id',
        paperId: 1,
        title: 'Legacy title',
        currentPage: 1,
        zoomLevel: 1,
        sidebarOpen: true,
        url: '/papers/1',
      }],
      activeTabId: 'stale-active-id',
    }));
  }, {
    session: {
      token: 'browser-fixture-token',
      user,
      expiresAt: Date.now() + 60 * 60 * 1000,
    },
  });
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

export async function installApiFixtures(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace('/api/v1', '');

    if (path === '/papers/1' && route.request().method() === 'GET') return json(route, paper);
    if (path === '/papers/1/file' && route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/pdf', body: pdfFixture });
    }
    if (path === '/papers/1/annotations' && route.request().method() === 'GET') return json(route, []);
    if (path === '/papers/1/sessions' && route.request().method() === 'GET') return json(route, []);
    if (path === '/papers/1/chat' && route.request().method() === 'GET') return json(route, null);
    if (path === '/papers/1/reading-session/start' && route.request().method() === 'POST') {
      return json(route, { id: 11, paper_id: 1, start_time: '2026-01-01T00:00:00Z', duration_minutes: 0, pages_viewed: 1 });
    }
    if (path === '/papers/1/reading-session/end' && route.request().method() === 'POST') {
      return json(route, { id: 11, paper_id: 1, start_time: '2026-01-01T00:00:00Z', end_time: '2026-01-01T00:01:00Z', duration_minutes: 1, pages_viewed: 1, last_read_page: 1 });
    }

    // Keep unrelated layout queries deterministic without coupling this smoke
    // test to every sidebar feature endpoint.
    if (path.startsWith('/groups') || path.startsWith('/tags') || path === '/user/ai-providers') return json(route, []);
    return json(route, {});
  });
}

export async function openReader(page: Page) {
  await seedAuthenticatedSession(page);
  await installApiFixtures(page);
  await page.goto('/papers/1');
  await expect(page.getByText('Attention Is All You Need').first()).toBeVisible();
}
