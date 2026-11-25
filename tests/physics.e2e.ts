import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

test('desktop jump, tool hub, compact mobile hub and weapon selection are usable', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await page.locator('#newGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  await page.keyboard.press('v');
  await expect(page.locator('#jumpButton')).toBeHidden();
  await page.locator('#toolHubButton').click();
  await expect(page.locator('#toolHub')).toBeVisible();
  await page.locator('[data-hub="stick"]').click();
  await expect(page.locator('#toolHub')).toBeHidden();
  const folder = join('art-review', 'batch-005b');
  await mkdir(folder, { recursive: true });
  await page.screenshot({ path: join(folder, 'desktop-tool-hub.png') });
});

test.describe('mobile physics controls', () => {
  test.use({ hasTouch: true, isMobile: true });
  test('mobile tool hub and jump control remain unobstructed', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.locator('#newGame').tap();
  await expect(page.locator('#joystick')).toBeVisible();
  await expect(page.locator('#actionA')).toBeVisible();
  await expect(page.locator('#actionB')).toBeVisible();
  await expect(page.locator('#jumpButton')).toBeVisible();
  await page.locator('#toolHubButton').tap();
  await expect(page.locator('#toolHub')).toBeVisible();
  await page.locator('[data-hub="road"]').tap();
  await expect(page.locator('#roadToolbar')).toBeVisible();
  const folder = join('art-review', 'batch-005b');
  await mkdir(folder, { recursive: true });
  await page.screenshot({ path: join(folder, 'mobile-tool-hub.png') });
  await page.locator('#roadExit').tap();
  });
});
