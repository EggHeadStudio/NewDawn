import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';

type Fir = { id: string; x: number; z: number };

async function enterBorealFirScene(page: Page) {
  await page.goto('./');
  await page.locator('#newGame').click();
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  const tree = await page.evaluate(async () => {
    const { World } = await import('/NewDawn/src/world.ts');
    const { geographicToPlanetPosition } = await import('/NewDawn/src/planet.ts');
    const point = geographicToPlanetPosition(60, 0);
    const world = new World(1847, 1);
    world.updateChunks(point.x, point.z, true);
    const object = world.group.children.find(item =>
      item.userData.treeSpecies === 'fir' && item.userData.natureMature);
    if (!object) throw new Error('No mature fir resource in boreal fixture');
    const tree = { id: object.userData.resourceId as string, ...world.resourceLocation(object) };
    const x = tree.x + 10, z = tree.z + 10;
    const y = world.heightAt(x, z);
    world.dispose();
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('new-dawn', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const save = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const request = db.transaction('saves').objectStore('saves').get('primary');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    save.version = 11;
    delete save.planetPositions;
    save.player = { x, y, z };
    save.npc = { x: tree.x + 30, z: tree.z + 30 };
    save.vehicle = { x: tree.x + 35, z: tree.z + 35 };
    save.wildlife = [];
    save.calendar = { minute: 720, day: 173, speed: 0.5 };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('saves', 'readwrite');
      tx.objectStore('saves').put(save, 'primary');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return tree;
  });
  await page.reload();
  await page.locator('#continueGame').click();
  await expect.poll(async () => page.evaluate(id => (window as Window & { __newDawnState: () => {
    trees: Array<{ id: string; variant: string }>
  } }).__newDawnState().trees.some(item => item.id === id && item.variant === 'mature-fir'), tree.id),
  { timeout: 30000 }).toBe(true);
  return tree;
}

for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`mature fir appears in boreal gameplay at ${viewport.width}x${viewport.height}`, async ({ browser }, testInfo) => {
    test.setTimeout(180000);
    const touch = viewport.width !== 1280;
    const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      const tree = await enterBorealFirScene(page);
      await page.waitForTimeout(3000);
      if (!touch) {
        await page.locator('#legacyCamera').evaluate((element: HTMLInputElement) => {
          element.checked = true;
          element.dispatchEvent(new Event('change', { bubbles: true }));
        });
        await page.mouse.move(600, 350);
        await page.mouse.down({ button: 'right' });
        await page.mouse.move(600, 200);
        await page.mouse.up({ button: 'right' });
      } else {
        await expect(page.locator('#joystick')).toBeVisible();
        await expect(page.locator('#actionA')).toBeVisible();
      }
      await page.waitForTimeout(1000);
      await page.screenshot({ path: testInfo.outputPath(`fir-${viewport.width}x${viewport.height}.png`) });
      if (!touch) {
        await page.locator('#pauseButton').click();
        await page.locator('#saveGame').click();
        await expect(page.locator('#toast')).toHaveText('World saved');
        await page.evaluate(async tree => {
          const { terrainHeight } = await import('/NewDawn/src/world.ts');
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('new-dawn', 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          const save = await new Promise<Record<string, unknown>>((resolve, reject) => {
            const request = db.transaction('saves').objectStore('saves').get('primary');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          const x = tree.x + 0.3, z = tree.z + 0.3;
          save.version = 11;
          delete save.planetPositions;
          save.player = { x, y: terrainHeight(x, z, Number(save.seed)), z };
          await new Promise<void>((resolve, reject) => {
            const tx = db.transaction('saves', 'readwrite');
            tx.objectStore('saves').put(save, 'primary');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          });
          db.close();
        }, tree);
        await page.reload();
        await page.locator('#continueGame').click();
        const present = () => page.evaluate(id => (window as Window & { __newDawnState: () => {
          trees: Array<{ id: string; variant: string }>
        } }).__newDawnState().trees.some(item => item.id === id), tree.id);
        await expect.poll(present, { timeout: 30000 }).toBe(true);
        await page.keyboard.press('Space');
        await expect.poll(present).toBe(false);
        await expect(page.locator('#toast')).toContainText('wood');
        await page.locator('#pauseButton').click();
        await page.locator('#saveGame').click();
        await expect(page.locator('#toast')).toHaveText('World saved');
        await page.reload();
        await page.locator('#continueGame').click();
        await expect.poll(async () => page.evaluate(() => (window as Window & { __newDawnState: () => {
          terrainReady: boolean
        } }).__newDawnState().terrainReady), { timeout: 30000 }).toBe(true);
        expect(await present()).toBe(false);
      }
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}

test('boreal fir scene exposes sustained timing in a touch viewport', async ({ browser }, testInfo) => {
  test.setTimeout(180000);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  try {
    await enterBorealFirScene(page);
    await page.locator('#pauseButton').tap();
    await page.locator('#showPerformance').tap();
    await page.locator('#resumeGame').tap();
    await page.locator('#startBenchmark').tap();
    await expect(page.locator('#performanceData')).toContainText('30-second test complete', { timeout: 60000 });
    console.log(`Boreal fir touch-emulation benchmark:\n${await page.locator('#performanceData').innerText()}`);
    await page.screenshot({ path: testInfo.outputPath('fir-benchmark-390x844.png') });
  } finally {
    await context.close();
  }
});

for (const quality of ['low', 'medium', 'high'] as const) {
  test(`boreal traversal reports ${quality} timing in a touch viewport`, async ({ browser }, testInfo) => {
    test.setTimeout(180000);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    const touch = await context.newCDPSession(page);
    const playerPosition = () => page.evaluate(() => (window as Window & { __newDawnState: () => {
      player: { x: number; z: number }
    } }).__newDawnState().player);
    try {
      await enterBorealFirScene(page);
      await page.locator('#pauseButton').tap();
      await page.locator('#graphicsQuality').selectOption(quality);
      await page.locator('#showPerformance').tap();
      await page.locator('#resumeGame').tap();
      await page.waitForTimeout(1500);
      const before = await playerPosition();
      await page.locator('#startBenchmark').tap();
      const joystick = await page.locator('#joystick').boundingBox();
      if (!joystick) throw new Error('Joystick unavailable');
      const origin = { id: 1, x: joystick.x + joystick.width / 2, y: joystick.y + joystick.height / 2 };
      await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [origin] });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...origin, y: origin.y - 32 }] });
      await expect(page.locator('#performanceData')).toContainText('30-second test complete', { timeout: 60000 });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      const after = await playerPosition();
      const distance = Math.hypot(after.x - before.x, after.z - before.z);
      expect(distance).toBeGreaterThan(5);
      console.log(`Boreal ${quality} touch-emulated traversal, projected displacement ${distance.toFixed(1)} m:\n${await page.locator('#performanceData').innerText()}`);
      await page.screenshot({ path: testInfo.outputPath(`fir-traversal-${quality}.png`) });
    } finally {
      await context.close();
    }
  });
}

test('regional fir loads on demand, retains resource identity, and retries after a failed request', async ({ page }) => {
  test.setTimeout(180000);
  let requests = 0;
  await page.route('**/mature-fir.glb**', route => {
    requests++;
    return route.abort();
  });
  await page.goto('./');
  const tree = await page.evaluate(async () => {
    const { World } = await import('/NewDawn/src/world.ts');
    const { geographicToPlanetPosition } = await import('/NewDawn/src/planet.ts');
    const world = new World(1847, 1);
    (window as Window & { firWorld: typeof world }).firWorld = world;
    const point = geographicToPlanetPosition(60, 0);
    world.updateChunks(point.x, point.z, true);
    const object = world.group.children.find(item =>
      item.userData.treeSpecies === 'fir' && item.userData.natureMature);
    if (!object) throw new Error('No mature fir resource in boreal fixture');
    return { id: object.userData.resourceId as string, ...world.resourceLocation(object) };
  });
  const inspect = (tree: Fir) => page.evaluate(tree => {
    const world = (window as Window & { firWorld: import('../src/world').World }).firWorld;
    const object = world.group.children.find(item => item.userData.resourceId === tree.id);
    return object && { species: object.userData.treeSpecies, variant: object.userData.natureVariant };
  }, tree);
  await expect.poll(() => requests).toBe(1);
  await expect.poll(async () => (await inspect(tree))?.variant).toBe('default');
  expect((await inspect(tree))?.species).toBe('fir');
  await page.waitForTimeout(1000);
  expect(requests).toBe(1);

  await page.unroute('**/mature-fir.glb**');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(async () => (await inspect(tree))?.variant, { timeout: 30000 }).toBe('mature-fir');
  const result = await page.evaluate(tree => {
    const world = (window as Window & { firWorld: import('../src/world').World }).firWorld;
    const gathered = world.gatherNearest(tree.x, tree.z, 0.1, 'wood')?.resource;
    const snapshot = world.depletedSnapshot();
    world.updateChunks(tree.x + 180, tree.z + 180, true);
    world.updateChunks(tree.x, tree.z, true);
    const absentAfterStream = !world.group.children.some(item => item.userData.resourceId === tree.id);
    world.dispose();
    return { gathered, saved: snapshot.includes(tree.id), absentAfterStream };
  }, tree);
  expect(result).toEqual({ gathered: 'wood', saved: true, absentAfterStream: true });
});

test('production offline Continue uses the fallback until fir is cached', async ({ browser, page }, testInfo) => {
  test.setTimeout(180000);
  await enterBorealFirScene(page);
  const save = await page.evaluate(() => new Promise<unknown>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const get = request.result.transaction('saves').objectStore('saves').get('primary');
      get.onsuccess = () => { request.result.close(); resolve(get.result); };
      get.onerror = () => reject(get.error);
    };
  }));
  const portServer = createServer();
  await new Promise<void>(resolve => portServer.listen(0, '127.0.0.1', resolve));
  const port = (portServer.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => portServer.close(error => error ? reject(error) : resolve()));
  const preview = spawn(process.execPath, [
    resolve('node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort',
  ], { stdio: 'ignore' });
  const context = await browser.newContext();
  const production = await context.newPage();
  try {
    await expect.poll(async () => {
      if (preview.exitCode !== null) throw new Error(`Preview exited: ${preview.exitCode}`);
      try { return (await fetch(`http://127.0.0.1:${port}/NewDawn/`)).status; } catch { return 0; }
    }, { timeout: 30000 }).toBe(200);
    await production.goto(`http://127.0.0.1:${port}/NewDawn/`);
    await production.locator('#newGame').click();
    await production.locator('#pauseButton').click();
    await production.locator('#saveGame').click();
    await expect(production.locator('#toast')).toHaveText('World saved');
    await production.evaluate(async save => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('new-dawn', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('saves', 'readwrite');
        tx.objectStore('saves').put(save, 'primary');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    }, save);
    await production.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
      }
    });
    const isFir = (url: string) => new URL(url).pathname.endsWith('/mature-fir.glb');
    await context.setOffline(true);
    await production.reload();
    const unavailable = production.waitForEvent('requestfailed', request => isFir(request.url()));
    await production.locator('#continueGame').click();
    await unavailable;
    await expect(production.locator('#pauseButton')).toBeVisible();
    await production.waitForTimeout(3000);
    const lunarCache = await production.evaluate(async () => {
      const shellName = (await caches.keys()).find(name => name.startsWith('new-dawn-shell-'));
      if (!shellName) throw new Error('Missing offline shell cache');
      const shell = await caches.open(shellName);
      const image = await shell.match(new URL('./assets/environment/sky/moon.jpg', location.href));
      const credit = await shell.match(new URL('./assets/environment/sky/moon-LICENSE.txt', location.href));
      if (!image || !credit) throw new Error('Lunar art or attribution is absent from the offline shell');
      const bitmap = await createImageBitmap(await image.blob());
      const size = [bitmap.width, bitmap.height];
      bitmap.close();
      return { size, credit: await credit.text() };
    });
    expect(lunarCache.size).toEqual([256, 128]);
    expect(lunarCache.credit).toContain('Solar System Scope / INOVE');
    expect(lunarCache.credit).toContain('https://creativecommons.org/licenses/by/4.0/');
    await production.screenshot({ path: testInfo.outputPath('offline-uncached.png') });
    const download = production.waitForResponse(response => isFir(response.url()) && response.status() === 200);
    await context.setOffline(false);
    await production.evaluate(() => window.dispatchEvent(new Event('online')));
    await download;
    const cached = await production.evaluate(async () => {
      const cache = await caches.open('new-dawn-optional-regional-trees-v2');
      return (await cache.keys()).some(request => new URL(request.url).pathname.endsWith('/mature-fir.glb'));
    });
    expect(cached).toBe(true);
    await context.setOffline(true);
    await production.reload();
    const cachedResponse = production.waitForResponse(response => isFir(response.url()) && response.status() === 200);
    await production.locator('#continueGame').click();
    expect((await cachedResponse).fromServiceWorker()).toBe(true);
    await expect(production.locator('#pauseButton')).toBeVisible();
    await production.waitForTimeout(3000);
    await production.screenshot({ path: testInfo.outputPath('offline-cached.png') });
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
