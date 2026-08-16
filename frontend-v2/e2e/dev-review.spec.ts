import { test, expect } from '@playwright/test';

test('UI review surface exposes deterministic stress variants', async ({ page }) => {
  await page.goto('/dev/ui?theme=dark&motion=reduced&density=compact&width=narrow');

  await expect(page.getByRole('heading', { name: 'Kitchen Sink — HeroUI × Lumen' })).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect(page.locator('html')).toHaveAttribute('data-review-motion', 'reduced');
  await expect(page.locator('html')).toHaveAttribute('data-review-density', 'compact');
  await expect(page.getByLabel('Review motion')).toHaveValue('reduced');
  await expect(page.getByLabel('Review density')).toHaveValue('compact');
  await expect(page.getByLabel('Review width')).toHaveValue('narrow');

  await page.getByRole('button', { name: 'Show offline state' }).click();
  await expect(page.locator('[role="status"][data-slot="alert-root"]')).toContainText('offline');
});

test('icon review surface renders the barrel glyphs', async ({ page }) => {
  await page.goto('/dev/icons?theme=light');

  await expect(page.getByRole('heading', { name: 'Lumen Icons' })).toBeVisible();
  await expect(page.getByText(/109 glyphs/)).toBeVisible();
  await expect(page.locator('[data-icon="chat"]').first()).toBeVisible();
});
