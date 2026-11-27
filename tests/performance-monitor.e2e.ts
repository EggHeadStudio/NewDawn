import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`performance monitor reports gameplay and can be copied and hidden at ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    try {
      await page.goto('./');
      await page.locator('#newGame').tap();
      await page.locator('#pauseButton').tap();
      await page.locator('#showPerformance').tap();
      await page.locator('#resumeGame').tap();
      const report = page.locator('#performanceData');
      await expect(report).toContainText('Frame avg', { timeout: 30000 });
      await expect(report).toContainText('Chunks');
      await expect(report).toContainText('Authored trees near');
      await expect(report).toContainText('pixel ratio');
      await page.evaluate(() => {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
          writeText: async (text: string) => { (window as Window & { copiedReport?: string }).copiedReport = text; },
        } });
      });
      await page.locator('#copyPerformance').tap();
      expect(await page.evaluate(() => (window as Window & { copiedReport?: string }).copiedReport)).toContain('Frame avg');
      const directory = join(process.cwd(), 'art-review', 'batch-005d-a3-1', 'monitor');
      await mkdir(directory, { recursive: true });
      await page.screenshot({ path: join(directory, `${viewport.width}x${viewport.height}.png`) });
      await page.locator('#hidePerformance').tap();
      await expect(page.locator('#performanceMonitor')).toBeHidden();
      await expect(page.locator('#joystick')).toBeVisible();
      await expect(page.locator('#actionA')).toBeVisible();
    } finally {
      await context.close();
    }
  });
}

test('touch-device render resolution respects quality and orientation after reload', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true,
  });

  const page = await context.newPage();
  try {
    await page.goto('./');
    await page.locator('#newGame').tap();
    const renderWidth = () => page.locator('#game').evaluate((canvas: HTMLCanvasElement) => canvas.width);
    await expect.poll(renderWidth).toBe(Math.floor(390 * 1.25));
    await page.setViewportSize({ width: 844, height: 390 });
    await expect.poll(renderWidth).toBe(844 * 1.25);
    await page.locator('#pauseButton').tap();
    await page.locator('#graphicsQuality').selectOption('high');
    await expect.poll(renderWidth).toBe(844 * 1.5);
    await page.locator('#graphicsQuality').selectOption('low');
    await expect.poll(renderWidth).toBe(844);
    await page.reload();
    await expect.poll(renderWidth).toBe(844);
  } finally {
    await context.close();
  }
});

test('30-second benchmark reports sustained timings and can be copied', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  try {
    await page.goto('./');
    await page.locator('#newGame').tap();
    await page.locator('#pauseButton').tap();
    await page.locator('#showPerformance').tap();
    await page.locator('#resumeGame').tap();
    await page.locator('#startBenchmark').tap();
    const report = page.locator('#performanceData');
    await expect(report).toContainText('30-second test running');
    await expect(report).toContainText('30-second test complete', { timeout: 60000 });
    await expect(report).toContainText('spikes >50 ms');
    await expect(report).toContainText('Chunks');
    const reportText = await report.innerText();
    console.log(`Sustained benchmark (emulated Edge, 390x844):\n${reportText}`);
    const directory = join(process.cwd(), 'art-review', 'batch-005d-a3-2', 'benchmark');
    await mkdir(directory, { recursive: true });
    await page.screenshot({ path: join(directory, '390x844.png') });
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: async (text: string) => { (window as Window & { copiedReport?: string }).copiedReport = text; },
      } });
    });
    await page.locator('#copyPerformance').tap();
    expect(await page.evaluate(() => (window as Window & { copiedReport?: string }).copiedReport))
      .toContain('30-second test complete');
  } finally {
    await context.close();
  }
});

test('a viewport change cancels a running benchmark rather than reporting mixed settings', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  try {
    await page.goto('./');
    await page.locator('#newGame').tap();
    await page.locator('#pauseButton').tap();
    await page.locator('#showPerformance').tap();
    await page.locator('#resumeGame').tap();
    await page.locator('#startBenchmark').tap();
    await expect(page.locator('#performanceData')).toContainText('30-second test running');
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('#performanceData')).toContainText('cancelled: viewport changed');
    await expect(page.locator('#joystick')).toBeVisible();
    await expect(page.locator('#actionA')).toBeVisible();
  } finally {
    await context.close();
  }
});
