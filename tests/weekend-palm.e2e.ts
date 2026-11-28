import { expect, test, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { planetPositionToGeographic } from '../src/planet';
import { sawTree, selectSaw, walkTo, workTree } from './timber-helpers';

type Harvest = { phase: 'standing' | 'fallen' | 'logs'; progress?: number; total?: number; remaining?: number; direction?: number };
type Tree = { id: string; x: number; z: number; species: string; variant?: string; authored: boolean;
  harvest: Harvest | null; falling: boolean };
type State = { player: { x: number; z: number }; cameraView: { pitch: number }; terrainReady: boolean; trees: Tree[] };
type Save = { version: number; resources: { wood: number }; depleted: string[]; treeHarvest: Record<string, Harvest> };

const palmId = '-600003,-600015';
const region = { x: -600004.3, y: 4.2, z: -600016.9 };

async function state(page: Page) {
  return page.evaluate(() => (window as Window & { __newDawnState: () => State }).__newDawnState());
}

async function activate(page: Page, selector: string, touch: boolean) {
  if (touch) await page.locator(selector).tap();
  else await page.locator(selector).click();
}

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

async function save(page: Page, touch = false) {
  await activate(page, '#pauseButton', touch);
  await activate(page, '#saveGame', touch);
  await expect(page.locator('#toast')).toHaveText('World saved');
}

async function visitRegion(page: Page, touch = false, previousHarvest?: Harvest) {
  await page.goto('./');
  await page.locator('#worldSeed').fill('1847');
  await activate(page, '#newGame', touch);
  await save(page, touch);
  const geographic = planetPositionToGeographic(region.x, region.z, region.y);
  await page.evaluate(({ region, geographic, previousHarvest, palmId }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('saves', 'readwrite');
      const store = tx.objectStore('saves');
      const get = store.get('primary');
      get.onsuccess = () => {
        const data = get.result;
        data.player = region;
        data.planetPositions.player = geographic;
        data.calendar.minute = 720;
        data.calendar.speed = 0.5;
        if (previousHarvest) data.treeHarvest[palmId] = previousHarvest;
        store.put(data, 'primary');
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Regional fixture aborted')); };
    };
  }), { region, geographic, previousHarvest, palmId });
  await page.reload();
  await activate(page, '#continueGame', touch);
  await expect.poll(async () => (await state(page)).terrainReady, { timeout: 30000 }).toBe(true);
  await expect.poll(async () => (await state(page)).trees.some(tree => tree.id === palmId), { timeout: 30000 }).toBe(true);
}

for (const viewport of [
  { name: 'desktop', width: 1280, height: 720, touch: false },
  { name: 'portrait', width: 390, height: 844, touch: true },
  { name: 'landscape', width: 844, height: 390, touch: true },
]) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.touch, isMobile: viewport.touch });

    test('works an existing regional palm and preserves partial and depleted timber', async ({ page }, testInfo) => {
      test.setTimeout(240000);
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => {
        if (message.type() === 'error' && /shader|webglprogram/i.test(message.text())) errors.push(message.text());
      });
      await visitRegion(page, viewport.touch);
      const target = async () => (await state(page)).trees.find(tree => tree.id === palmId);
      await expect.poll(target, { timeout: 30000 }).toMatchObject({ species: 'palm', authored: true, variant: 'palm' });
      await activate(page, '#pauseButton', viewport.touch);
      await page.locator('#cameraFollow').uncheck();
      if (!viewport.touch) await page.locator('#legacyCamera').check();
      await activate(page, '#resumeGame', viewport.touch);
      await page.waitForTimeout(1000);
      await page.screenshot({ path: testInfo.outputPath('normal.png') });

      const beforePitch = (await state(page)).cameraView.pitch;
      if (viewport.touch) {
        const cdp = await page.context().newCDPSession(page);
        const x = viewport.width * 0.75, y = viewport.height * 0.55;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 150, id: 1 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await cdp.detach();
      } else {
        await page.mouse.move(600, 350);
        await page.mouse.down({ button: 'right' });
        await page.mouse.move(600, 200);
        await page.mouse.up({ button: 'right' });
      }
      await expect.poll(async () => (await state(page)).cameraView.pitch).toBeLessThan(beforePitch - 0.2);
      await page.waitForTimeout(500);
      await page.screenshot({ path: testInfo.outputPath('canopy.png') });

      const tree = (await target())!;
      await walkTo(page, tree, viewport.touch);
      await sawTree(page, palmId, viewport.touch);
      const total = (await target())!.harvest!.total!;
      expect(total).toBeGreaterThan(7);
      await workTree(page, palmId, viewport.touch);
      await expect.poll(async () => (await target())?.harvest).toMatchObject({ phase: 'logs', total, remaining: total - 3 });
      await save(page, viewport.touch);
      expect(await readSave(page)).toMatchObject({
        version: 13, resources: { wood: 3 }, treeHarvest: { [palmId]: { phase: 'logs', total, remaining: total - 3 } },
      });
      await page.reload();
      await activate(page, '#continueGame', viewport.touch);
      await expect.poll(async () => (await target())?.harvest).toMatchObject({ phase: 'logs', total, remaining: total - 3 });
      if (!viewport.touch) {
        await walkTo(page, { x: tree.x + 82, z: tree.z });
        expect(await target()).toBeUndefined();
        await walkTo(page, tree);
        await expect.poll(async () => (await target())?.harvest).toMatchObject({ phase: 'logs', total, remaining: total - 3 });
      }
      while (await target()) await workTree(page, palmId, viewport.touch);
      await save(page, viewport.touch);
      const harvested = await readSave(page);
      expect(harvested.resources.wood).toBe(total);
      expect(harvested.depleted).toContain(palmId);
      expect(harvested.treeHarvest).not.toHaveProperty(palmId);
      await page.reload();
      await activate(page, '#continueGame', viewport.touch);
      await expect.poll(async () => (await state(page)).trees.length).toBeGreaterThan(0);
      expect(await target()).toBeUndefined();
      expect(errors).toEqual([]);
    });
  });
}

test('preserves a previous fallen palm while the model fails and retries', async ({ page }) => {
  test.setTimeout(120000);
  let requests = 0;
  await page.route('**/assets/environment/trees/vinish-fan-palm.glb', route => {
    requests++;
    return route.abort();
  });
  await visitRegion(page, false, { phase: 'fallen', progress: 1, total: 5, direction: 0 });
  const target = async () => (await state(page)).trees.find(tree => tree.id === palmId);
  await expect.poll(() => requests).toBe(1);
  await expect.poll(target).toMatchObject({ species: 'palm', authored: false,
    harvest: { phase: 'fallen', progress: 1, total: 5 } });
  await page.waitForTimeout(1000);
  expect(requests).toBe(1);
  await page.unroute('**/assets/environment/trees/vinish-fan-palm.glb');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(target, { timeout: 30000 }).toMatchObject({ species: 'palm', authored: true, variant: 'palm',
    harvest: { phase: 'fallen', progress: 1, total: 5 } });
  await walkTo(page, (await target())!);
  await selectSaw(page);
  await workTree(page, palmId);
  await expect.poll(async () => (await target())?.harvest).toMatchObject({ phase: 'logs', total: 5, remaining: 5 });
  await workTree(page, palmId);
  await save(page);
  expect(await readSave(page)).toMatchObject({
    resources: { wood: 3 }, treeHarvest: { [palmId]: { phase: 'logs', total: 5, remaining: 2 } },
  });
});

test('continues a gameplay-harvested palm and its bundled art offline', async ({ browser, page }, testInfo) => {
  test.setTimeout(180000);
  await visitRegion(page);
  const target = async () => (await state(page)).trees.find(tree => tree.id === palmId);
  await expect.poll(target, { timeout: 30000 }).toMatchObject({ authored: true, variant: 'palm' });
  await walkTo(page, (await target())!);
  await sawTree(page, palmId);
  await save(page);
  const onlineSave = await readSave(page);
  const remaining = onlineSave.treeHarvest[palmId].remaining!;
  expect(remaining).toBeGreaterThan(3);

  const portServer = createServer();
  await new Promise<void>(resolve => portServer.listen(0, '127.0.0.1', resolve));
  const port = (portServer.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => portServer.close(error => error ? reject(error) : resolve()));
  const preview = spawn(process.execPath, [
    resolve('node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort',
  ], { stdio: 'ignore' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const production = await context.newPage();
  try {
    await expect.poll(async () => {
      if (preview.exitCode !== null) throw new Error(`Preview exited: ${preview.exitCode}`);
      try { return (await fetch(`http://127.0.0.1:${port}/NewDawn/`)).status; } catch { return 0; }
    }, { timeout: 30000 }).toBe(200);
    await production.goto(`http://127.0.0.1:${port}/NewDawn/`);
    await production.locator('#importSaveFile').setInputFiles({
      name: 'palm-harvest.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(onlineSave)),
    });
    await expect(production.locator('#toast')).toHaveText('Save imported. Select Continue.');
    await production.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
      }
    });
    await context.setOffline(true);
    await production.reload();
    const asset = production.waitForResponse(response => response.url().includes('vinish-fan-palm.glb'));
    await production.locator('#continueGame').tap();
    await expect(production.locator('#menu')).not.toHaveClass(/active/);
    const response = await asset;
    expect(response.status()).toBe(200);
    expect(response.fromServiceWorker()).toBe(true);
    expect((await response.body()).subarray(0, 4).toString()).toBe('glTF');
    const license = await production.evaluate(async () => {
      const response = await fetch('./assets/environment/trees/vinish-trees-LICENSE.txt');
      return { status: response.status, text: await response.text() };
    });
    expect(license.status).toBe(200);
    expect(license.text).toContain('vinish.dev');
    await production.screenshot({ path: testInfo.outputPath('offline.png') });
    await production.locator('#actionA').tap();
    await expect.poll(async () => (await readSave(production)).resources.wood, { timeout: 15000 }).toBe(3);
    expect((await readSave(production)).treeHarvest[palmId]).toMatchObject({
      phase: 'logs', remaining: remaining - 3,
    });
    await production.reload();
    await production.locator('#continueGame').tap();
    await expect(production.locator('#menu')).not.toHaveClass(/active/);
    await save(production, true);
    expect(await readSave(production)).toMatchObject({
      resources: { wood: 3 }, treeHarvest: { [palmId]: { phase: 'logs', remaining: remaining - 3 } },
    });
  } finally {
    await context.setOffline(false);
    await context.close();
    if (preview.exitCode === null) {
      const exited = new Promise<void>(resolve => preview.once('exit', () => resolve()));
      preview.kill('SIGTERM');
      await exited;
    }
  }
});
