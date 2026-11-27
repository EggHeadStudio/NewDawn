import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';

let preview: ChildProcess;
let productionURL: string;

test.beforeAll(async () => {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing preview port');
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  productionURL = `http://127.0.0.1:${port}/NewDawn/`;
  preview = spawn(process.execPath, [
    resolve('node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1',
    '--port', String(port), '--strictPort',
  ], { stdio: 'ignore' });
  await expect.poll(async () => {
    if (preview.exitCode !== null) throw new Error(`Preview exited: ${preview.exitCode}`);
    try { return (await fetch(productionURL)).status; }
    catch { return 0; }
  }, { timeout: 30000 }).toBe(200);
});

test.afterAll(async () => {
  if (preview && preview.exitCode === null) {
    const exited = new Promise<void>(resolve => preview.once('exit', () => resolve()));
    preview.kill('SIGTERM');
    await exited;
  }
});

test('menu logo fits desktop and touch layouts in both color schemes', async ({ browser }, testInfo) => {
  for (const [name, width, height] of [
    ['desktop', 1280, 720], ['portrait', 390, 844], ['landscape', 844, 390],
  ] as const) {
    for (const colorScheme of ['light', 'dark'] as const) {
      const context = await browser.newContext({
        viewport: { width, height }, colorScheme,
        isMobile: name !== 'desktop', hasTouch: name !== 'desktop',
      });
      try {
        const page = await context.newPage();
        await page.goto(productionURL);
        const logo = page.locator('.brand-logo');
        await expect(logo).toBeVisible();
        await expect.poll(() => logo.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(1024);
        await expect(page.getByRole('heading', { name: 'NEW DAWN', exact: true })).toBeVisible();
        const bounds = await page.evaluate(() => {
          const logo = document.querySelector('.brand-logo')!.getBoundingClientRect();
          const form = document.querySelector('.menu-card')!.getBoundingClientRect();
          return {
            left: logo.left, top: logo.top, right: logo.right, bottom: logo.bottom,
            overlaps: logo.left < form.right && logo.right > form.left
              && logo.top < form.bottom && logo.bottom > form.top,
            overflow: document.documentElement.scrollWidth > innerWidth,
          };
        });
        expect(bounds.left).toBeGreaterThanOrEqual(0);
        expect(bounds.top).toBeGreaterThanOrEqual(0);
        expect(bounds.right).toBeLessThanOrEqual(width);
        expect(bounds.bottom).toBeLessThanOrEqual(height);
        expect(bounds.overlaps).toBe(false);
        expect(bounds.overflow).toBe(false);
        await page.screenshot({ path: testInfo.outputPath(`menu-${name}-${colorScheme}.png`) });
      } finally {
        await context.close();
      }
    }
  }
});

test('production menu and standard, maskable and Apple icons work offline', async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(productionURL);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
      }
    });
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('.brand-logo')).toBeVisible();
    await expect.poll(() => page.locator('.brand-logo').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBe(1024);
    const result = await page.evaluate(async () => {
      const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!;
      const response = await fetch(link.href);
      if (!response.ok) throw new Error(`Manifest: ${response.status}`);
      const manifest: { icons: Array<{ src: string; sizes: string; purpose: string }> } = await response.json();
      const icons = [];
      for (const icon of manifest.icons) {
        const response = await fetch(new URL(icon.src, link.href));
        if (!response.ok) throw new Error(`Icon: ${response.status}`);
        const bitmap = await createImageBitmap(await response.blob());
        icons.push({ size: `${bitmap.width}x${bitmap.height}`, purpose: icon.purpose, declared: icon.sizes });
        bitmap.close();
      }
      const apple = await fetch(document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]')!.href);
      if (!apple.ok) throw new Error(`Apple icon: ${apple.status}`);
      const bitmap = await createImageBitmap(await apple.blob());
      const appleSize = [bitmap.width, bitmap.height];
      bitmap.close();
      for (const link of document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')) {
        const response = await fetch(link.href);
        if (!response.ok) throw new Error(`Favicon: ${response.status}`);
        if ((await response.blob()).size === 0) throw new Error('Empty favicon');
      }
      return { icons, appleSize };
    });
    expect(result.icons).toEqual([
      { size: '192x192', declared: '192x192', purpose: 'any' },
      { size: '512x512', declared: '512x512', purpose: 'any' },
      { size: '192x192', declared: '192x192', purpose: 'maskable' },
      { size: '512x512', declared: '512x512', purpose: 'maskable' },
    ]);
    expect(result.appleSize).toEqual([180, 180]);
  } finally {
    await context.setOffline(false);
    await context.close();
  }
});
