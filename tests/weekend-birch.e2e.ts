import { expect, test, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import type * as THREE from 'three';
import { collectTree, sawTree, walkTo, workTree } from './timber-helpers';

type Tree = {
  id: string; x: number; z: number; species: string; variant?: string; falling: boolean;
  harvest: null | { phase: 'standing' | 'fallen' | 'logs'; total?: number; remaining?: number };
};
type State = { player: { x: number; z: number }; trees: Tree[];
  deposits: Array<{ x: number; z: number }> };
type Save = { resources: { wood: number }; depleted: string[];
  treeHarvest: Record<string, { phase: string; total: number; remaining: number }> };

async function state(page: Page) {
  return page.evaluate(() => (window as Window & { __newDawnState: () => State }).__newDawnState());
}

async function save(page: Page) {
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
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

async function newGame(page: Page) {
  await page.goto('./');
  await page.locator('#worldSeed').fill('1847');
  await page.locator('#newGame').click();
  await page.locator('#pauseButton').click();
  await page.locator('#cameraFollow').uncheck();
  await page.locator('#legacyCamera').check();
  await page.locator('#resumeGame').click();
  await expect.poll(async () => (await state(page)).trees.some(tree => tree.variant === 'mature-birch'),
    { timeout: 60000 }).toBe(true);
}

for (const viewport of [
  { name: 'desktop', width: 1280, height: 720, touch: false },
  { name: 'portrait', width: 390, height: 844, touch: true },
  { name: 'landscape', width: 844, height: 390, touch: true },
]) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.touch, isMobile: viewport.touch });

    test('finds and harvests a mature birch, retaining the remaining timber across reload', async ({ page }, testInfo) => {
      test.setTimeout(300000);
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => {
        if (message.type() === 'error' && /shader|webglprogram/i.test(message.text())) errors.push(message.text());
      });
      await newGame(page);
      const initial = await state(page);
      const tree = initial.trees.filter(item => item.variant === 'mature-birch'
        && initial.deposits.every(deposit => Math.hypot(deposit.x - item.x, deposit.z - item.z) > 2))
        .sort((a, b) => Math.hypot(a.x - initial.player.x, a.z - initial.player.z)
          - Math.hypot(b.x - initial.player.x, b.z - initial.player.z))[0];
      expect(tree).toBeDefined();
      expect(tree.species).toBe('birch');
      await walkTo(page, { x: tree.x + 4, z: tree.z + 4 }, viewport.touch);
      await page.screenshot({ path: testInfo.outputPath('natural-birch.png') });
      if (!viewport.touch) {
        await page.mouse.move(600, 350);
        await page.mouse.down({ button: 'right' });
        await page.mouse.move(600, 200);
        await page.mouse.up({ button: 'right' });
        await page.waitForTimeout(500);
        await page.screenshot({ path: testInfo.outputPath('birch-canopy.png') });
      }
      await walkTo(page, tree, viewport.touch);
      const target = async () => (await state(page)).trees.find(item => item.id === tree.id);
      await sawTree(page, tree.id, viewport.touch);
      const total = (await target())?.harvest?.total;
      expect(total).toBeGreaterThan(3);
      await workTree(page, tree.id, viewport.touch);
      expect((await target())?.harvest).toMatchObject({ phase: 'logs', total, remaining: total! - 3 });
      await page.screenshot({ path: testInfo.outputPath('birch-logs.png') });
      await save(page);
      const partial = await readSave(page);
      expect(partial.resources.wood).toBe(3);
      expect(partial.treeHarvest[tree.id]).toMatchObject({ phase: 'logs', total, remaining: total! - 3 });
      await page.reload();
      await page.locator('#continueGame').click();
      await expect.poll(async () => (await target())?.harvest).toMatchObject({
        phase: 'logs', total, remaining: total! - 3,
      });
      if (!viewport.touch) {
        await walkTo(page, { x: tree.x + 82, z: tree.z });
        expect(await target()).toBeUndefined();
        await walkTo(page, tree);
        await expect.poll(async () => (await target())?.harvest).toMatchObject({
          phase: 'logs', total, remaining: total! - 3,
        });
      }
      await collectTree(page, tree.id, viewport.touch);
      await save(page);
      expect(await readSave(page)).toMatchObject({ resources: { wood: total }, depleted: [tree.id] });
      await page.reload();
      await page.locator('#continueGame').click();
      await expect(page.locator('#menu')).not.toHaveClass(/active/);
      expect(await target()).toBeUndefined();
      console.log(`${viewport.name}: walked to birch ${tree.id}, harvested ${total} wood`);
      expect(errors).toEqual([]);
    });
  });
}

test('mature birches share geometry, keep branches separate from foliage, and dispose once', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const { NatureAssets } = await import('/NewDawn/src/nature-assets.ts');
    const { assets, a } = await new Promise<{ assets: InstanceType<typeof NatureAssets>; a: THREE.Object3D }>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Birch did not load')), 30000);
      let found = false;
      const cache = new NatureAssets(() => {
        if (found) return;
        const instance = cache.create('deciduous', 0, 'mature-birch');
        if (!instance) return;
        found = true;
        clearTimeout(timeout);
        resolve({ assets: cache, a: instance });
      });
    });
    const b = assets.create('deciduous', 1, 'mature-birch')!;
    type Part = { mesh: THREE.Mesh; material: THREE.Material };
    const parts = (root: typeof a) => {
      const found: Part[] = [];
      root.traverse(object => {
        if (!('isMesh' in object) || object.isMesh !== true) return;
        const mesh = object as THREE.Mesh;
        if (Array.isArray(mesh.material)) throw new Error('Expected one material per birch mesh');
        found.push({ mesh, material: mesh.material });
      });
      return found;
    };
    const first = parts(a), second = parts(b);
    const leaves = first.find(part => /leaves/i.test(part.material.name));
    const branches = first.find(part => /branches/i.test(part.material.name));
    if (!leaves || !branches) throw new Error('Birch leaf or branch material missing');
    let disposals = 0;
    leaves.mesh.geometry.addEventListener('dispose', () => disposals++);
    first.forEach(part => { part.material.dispose(); part.mesh.customDepthMaterial?.dispose(); });
    const before = disposals;
    const shared = first.every((part, i) => part.mesh.geometry === second[i].mesh.geometry && part.material !== second[i].material);
    const foliage = typeof leaves.mesh.userData.foliageTier === 'number' && Boolean(leaves.mesh.customDepthMaterial);
    const structural = branches.mesh.userData.foliageTier === undefined;
    second.forEach(part => { part.material.dispose(); part.mesh.customDepthMaterial?.dispose(); });
    assets.dispose();
    return { before, after: disposals, shared, foliage, structural };
  });
  expect(result).toEqual({ before: 0, after: 1, shared: true, foliage: true, structural: true });
});

test('uses the existing broadleaf fallback when birch art is unavailable, then restores it on reload', async ({ page }) => {
  test.setTimeout(120000);
  let failures = 0;
  const errors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.route('**/assets/environment/trees/mature-birch.glb', route => {
    failures++;
    return route.abort();
  });
  await page.goto('./');
  await page.locator('#worldSeed').fill('1847');
  await page.locator('#newGame').click();
  await expect.poll(() => failures, { timeout: 30000 }).toBeGreaterThan(0);
  const target = await page.evaluate(async () => {
    const { treeAgeClass } = await import('/NewDawn/src/world.ts');
    const current = (window as Window & { __newDawnState: () => State }).__newDawnState();
    return current.trees.find(tree => tree.species === 'birch' && treeAgeClass('birch', tree.x, tree.z, 1847) === 'mature')?.id;
  });
  expect(target).toBeDefined();
  await expect.poll(async () => (await state(page)).trees.find(tree => tree.id === target)?.variant,
    { timeout: 30000 }).toBe('default');
  await expect.poll(() => errors.some(error => error.includes('Failed to load local tree asset')
    && error.includes('mature-birch.glb'))).toBe(true);
  await save(page);
  await page.unroute('**/assets/environment/trees/mature-birch.glb');
  await page.reload();
  await page.locator('#continueGame').click();
  await expect.poll(async () => (await state(page)).trees.find(tree => tree.id === target)?.variant,
    { timeout: 60000 }).toBe('mature-birch');
});

test('the production shell serves mature birches after an offline reload', async ({ browser }) => {
  test.setTimeout(120000);
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  const preview = spawn(process.execPath, [
    resolve('node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort',
  ], { stdio: 'ignore' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  try {
    await expect.poll(async () => {
      if (preview.exitCode !== null) throw new Error(`Preview exited: ${preview.exitCode}`);
      try { return (await fetch(`http://127.0.0.1:${port}/NewDawn/`)).status; } catch { return 0; }
    }, { timeout: 30000 }).toBe(200);
    await page.goto(`http://127.0.0.1:${port}/NewDawn/`);
    await page.locator('#worldSeed').fill('1847');
    await page.locator('#newGame').click();
    await save(page);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
      }
    });
    await context.setOffline(true);
    await page.reload();
    const response = page.waitForResponse(result => result.url().endsWith('/mature-birch.glb'));
    await page.locator('#continueGame').click();
    expect((await response).fromServiceWorker()).toBe(true);
    await expect(page.locator('#menu')).not.toHaveClass(/active/);
    await save(page);
    expect(await readSave(page)).toMatchObject({ resources: { wood: 0 } });
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
