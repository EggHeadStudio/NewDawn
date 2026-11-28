import { expect, test, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';

type Save = { resources: { wood: number }; structures: Array<{ kind: string; x: number; z: number }> };

async function readSave(page: Page) {
  return page.evaluate(() => new Promise<Save>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const get = db.transaction('saves').objectStore('saves').get('primary');
      get.onerror = () => { db.close(); reject(get.error); };
      get.onsuccess = () => { db.close(); resolve(get.result); };
    };
  }));
}

test('loads locally bundled house materials after an offline production reload', async ({ browser, page }, testInfo) => {
  test.setTimeout(180000);
  await page.goto('./');
  await page.locator('#newGame').click();
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('saves', 'readwrite');
      const store = tx.objectStore('saves');
      const get = store.get('primary');
      get.onsuccess = () => { const data = get.result; data.resources.wood = 10; store.put(data, 'primary'); };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Resource fixture aborted')); };
    };
  }));
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#menu')).not.toHaveClass(/active/);
  await page.locator('[data-tool="build"]').click();
  await page.locator('[data-building="floor"]').click();
  let placed = false;
  for (const y of [0.55, 0.65, 0.75, 0.45, 0.8]) {
    for (const x of [0.5, 0.35, 0.65, 0.25, 0.75]) {
      await page.mouse.move(Math.round(1280 * x), Math.round(720 * y));
      if (await page.locator('#placementStatus').innerText() === 'Ready to place') {
        await page.locator('#confirmBuild').click();
        placed = true;
        break;
      }
    }
    if (placed) break;
  }
  expect(placed, 'No valid floor site').toBe(true);
  await expect.poll(async () => (await readSave(page)).structures.length).toBe(1);
  const saved = await readSave(page);
  expect(saved.resources.wood).toBe(8);

  const portServer = createServer();
  await new Promise<void>(done => portServer.listen(0, '127.0.0.1', done));
  const port = (portServer.address() as { port: number }).port;
  await new Promise<void>((done, reject) => portServer.close(error => error ? reject(error) : done()));
  const preview = spawn(process.execPath, [
    resolve('node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort',
  ], { stdio: 'ignore' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const production = await context.newPage();
  const errors: string[] = [];
  production.on('pageerror', error => errors.push(error.message));
  production.on('console', message => {
    if (message.type() === 'error' && /shader|webglprogram|construction texture/i.test(message.text())) errors.push(message.text());
  });
  try {
    await expect.poll(async () => {
      if (preview.exitCode !== null) throw new Error(`Preview exited: ${preview.exitCode}`);
      try { return (await fetch(`http://127.0.0.1:${port}/NewDawn/`)).status; } catch { return 0; }
    }, { timeout: 30000 }).toBe(200);
    await production.goto(`http://127.0.0.1:${port}/NewDawn/`);
    await production.locator('#importSaveFile').setInputFiles({
      name: 'built-floor.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)),
    });
    await expect(production.locator('#toast')).toHaveText('Save imported. Select Continue.');
    await production.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise<void>(done => navigator.serviceWorker.addEventListener('controllerchange', () => done(), { once: true }));
      }
    });
    await context.setOffline(true);
    await production.reload();
    const textures: Array<{ name: string; status: number; fromWorker: boolean }> = [];
    production.on('response', response => {
      const name = new URL(response.url()).pathname.split('/').pop() ?? '';
      if (/^weathered-wood-(color|normal)\.jpg$/.test(name)) {
        textures.push({ name, status: response.status(), fromWorker: response.fromServiceWorker() });
      }
    });
    await production.locator('#continueGame').click();
    await expect(production.locator('#menu')).not.toHaveClass(/active/);
    await expect.poll(() => textures.length, { timeout: 30000 }).toBe(2);
    expect(textures.every(texture => texture.status === 200 && texture.fromWorker)).toBe(true);
    const dimensions = await production.evaluate(async () => {
      const images = await Promise.all(['color', 'normal'].map(async name => {
        const response = await fetch(`assets/environment/construction/weathered-wood-${name}.jpg`);
        const image = await createImageBitmap(await response.blob());
        const size = [image.width, image.height];
        image.close();
        return size;
      }));
      return images;
    });
    expect(dimensions).toEqual([[512, 512], [512, 512]]);
    expect((await readSave(production)).structures).toEqual(saved.structures);
    await production.screenshot({ path: testInfo.outputPath('offline-floor.png') });
    expect(errors).toEqual([]);
  } finally {
    await context.setOffline(false);
    await context.close();
    if (preview.exitCode === null) {
      const exited = new Promise<void>(done => preview.once('exit', () => done()));
      preview.kill('SIGTERM');
      await exited;
    }
  }
});
