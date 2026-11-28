import { expect, test, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { collectTree, sawTree, timberAction, walkTo } from './timber-helpers';

type Point = { id: string; x: number; z: number };
type State = { player: { x: number; z: number }; terrainReady: boolean; characterVisual: { torch: boolean };
  trees: Array<Point & { authored: boolean }> };
type Save = { resources: { wood: number; stone: number }; minerals: { coal: number }; mining?: Record<string, number>;
  tools: string[]; torch?: { crafted: boolean; equipped: boolean; lit: boolean } };

async function state(page: Page) {
  return page.evaluate(() => (window as Window & { __newDawnState: () => State }).__newDawnState());
}

async function save(page: Page) {
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  return page.evaluate(() => new Promise<Save>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const get = db.transaction('saves').objectStore('saves').get('primary');
      get.onsuccess = () => { db.close(); resolve(get.result); };
      get.onerror = () => { db.close(); reject(get.error); };
    };
  }));
}

async function isolatedResources(page: Page) {
  return page.evaluate(async () => {
    const { World } = await import('/NewDawn/src/world.ts');
    const world = new World(1847);
    try {
      const natural = world.group.children.filter(object => object.userData.resource)
        .map(object => ({ id: object.userData.resourceId as string, kind: object.userData.resource as string,
          ...world.resourceLocation(object) }));
      const deposits = world.group.children.filter(object => object.userData.depositId)
        .map(object => ({ id: object.userData.depositId as string, kind: object.userData.mineral as string,
          ...world.resourceLocation(object) }));
      const all = [...natural, ...deposits];
      const isolated = (candidate: Point) => all.every(other =>
        other.id === candidate.id || Math.hypot(candidate.x - other.x, candidate.z - other.z) > 2.3);
      const clearings: Array<{ x: number; z: number }> = [];
      for (let x = -16; x <= 16; x++) for (let z = -16; z <= 16; z++) {
        // walkTo can stop 1.05 m short, so leave a margin beyond the 3.2 m gather range.
        if (world.heightAt(x, z) > 0.6 && all.every(item =>
          Math.hypot(item.x - x, item.z - z) > 5.3)) clearings.push({ x, z });
      }
      clearings.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
      return {
        trees: natural.filter(item => item.kind === 'wood' && isolated(item)),
        stones: natural.filter(item => item.kind === 'stone' && isolated(item)),
        coal: deposits.filter(item => item.kind === 'coal' && isolated(item)),
        clearings,
      };
    } finally { world.dispose(); }
  });
}

function nearest<T extends Point>(points: T[], player: { x: number; z: number }) {
  return points.sort((a, b) => Math.hypot(a.x - player.x, a.z - player.z)
    - Math.hypot(b.x - player.x, b.z - player.z))[0];
}

test('gathers materials and crafts a burning torch in an unassisted new game', async ({ browser, page }, testInfo) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /shader|webgl|program/i.test(message.text())) errors.push(message.text());
  });

  await page.goto('./');
  await page.locator('#worldSeed').fill('1847');
  await page.locator('#newGame').click();
  await expect.poll(async () => (await state(page)).terrainReady, { timeout: 30000 }).toBe(true);
  await page.locator('#pauseButton').click();
  await page.locator('#cameraFollow').uncheck();
  await page.locator('#resumeGame').click();

  const candidates = await isolatedResources(page);
  expect(candidates.stones.length).toBeGreaterThanOrEqual(2);
  expect(candidates.coal.length).toBeGreaterThan(0);
  const usedTrees = new Set<string>();
  let materials: Save;
  do {
    await expect.poll(async () => (await state(page)).trees.some(tree => tree.authored), { timeout: 30000 }).toBe(true);
    const current = await state(page);
    const tree = nearest(current.trees.filter(item => item.authored && !usedTrees.has(item.id)
      && candidates.trees.some(candidate => candidate.id === item.id)), current.player);
    expect(tree).toBeDefined();
    usedTrees.add(tree.id);
    await walkTo(page, tree);
    await sawTree(page, tree.id);
    await collectTree(page, tree.id);
    materials = await save(page);
    await page.locator('#resumeGame').click();
  } while (materials.resources.wood < 4);

  const usedStones = new Set<string>();
  for (let count = 0; count < 2; count++) {
    const stone = nearest(candidates.stones.filter(item => !usedStones.has(item.id)), (await state(page)).player);
    usedStones.add(stone.id);
    await walkTo(page, stone);
    await timberAction(page);
    await expect(page.locator('#toast')).toHaveText('+2 stone');
  }
  materials = await save(page);
  expect(materials.resources.wood).toBeGreaterThanOrEqual(4);
  expect(materials.resources.stone).toBe(4);
  expect(materials.minerals.coal).toBe(0);
  await page.locator('#resumeGame').click();

  const coal = nearest(candidates.coal, (await state(page)).player);
  await walkTo(page, coal);
  await expect(page.locator('#actionA')).toHaveAttribute('aria-label', 'Mine coal, pickaxe required');
  await expect(page.locator('#controlsHint')).toContainText('Space coal (pickaxe required)');
  await page.screenshot({ path: testInfo.outputPath('coal-hint.png') });
  await timberAction(page);
  await expect(page.locator('#toast')).toHaveText('Craft a pickaxe to mine this deposit');
  const withoutPickaxe = await save(page);
  expect(withoutPickaxe.resources).toEqual(materials.resources);
  expect(withoutPickaxe.minerals.coal).toBe(0);
  expect(withoutPickaxe.mining?.[coal.id]).toBeUndefined();
  await page.locator('#resumeGame').click();

  await page.locator('#toolHubButton').click();
  await page.locator('#inventoryButton').click();
  await page.locator('[data-craft="pickaxe"]').click();
  await expect(page.locator('#panelNotification')).toHaveText('pickaxe crafted');
  await page.locator('#closeCraft').click();
  await expect(page.locator('#actionA')).toHaveAttribute('aria-label', 'Mine coal');
  await expect(page.locator('#controlsHint')).toContainText('Space mine coal');
  await timberAction(page);
  await expect(page.locator('#toast')).toHaveText('+1 coal · 1/3');
  const beforeTorch = await save(page);
  expect(beforeTorch.tools).toContain('pickaxe');
  expect(beforeTorch.minerals.coal).toBe(1);
  await page.locator('#resumeGame').click();

  await page.locator('#toolHubButton').click();
  await page.locator('#inventoryButton').click();
  await page.locator('#craftTorch').click();
  await page.locator('#equipTorch').click();
  await page.locator('#igniteTorch').click();
  await expect(page.locator('#torchStatus')).toHaveText('Torch: equipped and burning');
  await page.locator('#closeCraft').click();
  await expect.poll(async () => (await state(page)).characterVisual.torch).toBe(true);
  await page.waitForTimeout(500);
  await page.screenshot({ path: testInfo.outputPath('natural-torch.png') });
  const lit = await save(page);
  expect(lit.torch).toEqual({ crafted: true, equipped: true, lit: true });
  expect(lit.resources.wood).toBe(beforeTorch.resources.wood - 2);
  expect(lit.minerals.coal).toBe(0);

  await page.reload();
  await page.locator('#continueGame').click();
  await page.locator('#toolHubButton').click();
  await page.locator('#inventoryButton').click();
  await expect(page.locator('#torchStatus')).toHaveText('Torch: equipped and burning');
  await expect.poll(async () => (await state(page)).terrainReady, { timeout: 30000 }).toBe(true);
  await page.locator('#closeCraft').click();
  await expect.poll(async () => (await state(page)).characterVisual.torch).toBe(true);
  await expect(page.locator('#actionA')).toHaveAttribute('aria-label', 'Mine coal');
  await page.screenshot({ path: testInfo.outputPath('reloaded-torch.png') });

  const portServer = createServer();
  await new Promise<void>(resolve => portServer.listen(0, '127.0.0.1', resolve));
  const port = (portServer.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => portServer.close(error => error ? reject(error) : resolve()));
  const preview = spawn(process.execPath, [
    resolve('node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort',
  ], { stdio: 'ignore' });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const production = await context.newPage();
  production.on('pageerror', error => errors.push(error.message));
  production.on('console', message => {
    if (message.type() === 'error' && /shader|webgl|program/i.test(message.text())) errors.push(message.text());
  });
  try {
    await expect.poll(async () => {
      if (preview.exitCode !== null) throw new Error(`Preview exited: ${preview.exitCode}`);
      try { return (await fetch(`http://127.0.0.1:${port}/NewDawn/`)).status; } catch { return 0; }
    }, { timeout: 30000 }).toBe(200);
    await production.goto(`http://127.0.0.1:${port}/NewDawn/`);
    await production.locator('#importSaveFile').setInputFiles({
      name: 'natural-torch-world.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(lit)),
    });
    await expect(production.locator('#toast')).toHaveText('Save imported. Select Continue.');
    await production.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
      }
    });
    await context.setOffline(true);
    const bundle = production.waitForResponse(response => /\/assets\/index-[^/]+\.js$/.test(response.url()));
    await production.reload();
    expect((await bundle).fromServiceWorker()).toBe(true);
    await production.locator('#continueGame').click();
    await expect(production.locator('#actionA')).toHaveAttribute('aria-label', 'Mine coal');
    await production.locator('#toolHubButton').click();
    await production.locator('#inventoryButton').click();
    await expect(production.locator('#torchStatus')).toHaveText('Torch: equipped and burning');
    await production.locator('#closeCraft').click();
    await production.screenshot({ path: testInfo.outputPath('offline-torch.png') });
  } finally {
    await context.setOffline(false);
    await context.close();
    if (preview.exitCode === null) {
      const exited = new Promise<void>(resolve => preview.once('exit', () => resolve()));
      preview.kill('SIGTERM');
      await exited;
    }
  }
  expect(errors).toEqual([]);
});

for (const viewport of [
  { name: 'portrait', width: 390, height: 844 },
  { name: 'landscape', width: 844, height: 390 },
]) {
  test(`shows and clears the nearby coal hint in touch ${viewport.name}`, async ({ browser }, testInfo) => {
    test.setTimeout(120000);
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    try {
      await page.goto('./');
      await page.locator('#worldSeed').fill('1847');
      await page.locator('#newGame').tap();
      await expect.poll(async () => (await state(page)).terrainReady, { timeout: 30000 }).toBe(true);
      await page.locator('#pauseButton').tap();
      await page.locator('#cameraFollow').uncheck();
      await page.locator('#resumeGame').tap();
      const { coal, clearings } = await isolatedResources(page);
      expect(coal.length).toBeGreaterThan(0);
      expect(clearings.length).toBeGreaterThan(0);
      await walkTo(page, nearest(coal, (await state(page)).player), true);
      await expect(page.locator('#actionA span')).toHaveText('Coal');
      await expect(page.locator('#actionA')).toHaveAttribute('aria-label', 'Mine coal, pickaxe required');
      await page.screenshot({ path: testInfo.outputPath('coal-hint.png') });
      await page.locator('#actionA').tap();
      await expect(page.locator('#toast')).toHaveText('Craft a pickaxe to mine this deposit');
      await page.locator('[data-tool="build"]').tap();
      await expect(page.locator('#actionA')).toHaveAttribute('aria-label', 'Place building');
      await page.locator('#closeBuild').tap();
      await expect(page.locator('#actionA')).toHaveAttribute('aria-label', 'Mine coal, pickaxe required');
      await walkTo(page, clearings[0], true);
      await expect(page.locator('#actionA span')).toHaveText('Gather');
      await expect(page.locator('#actionA')).toHaveAttribute('aria-label', 'Primary action');
    } finally { await context.close(); }
  });
}
