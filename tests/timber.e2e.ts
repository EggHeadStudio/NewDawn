import { expect, test, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { sawTree, selectSaw, timberAction, walkTo, workTree } from './timber-helpers';

type Tree = {
  id: string; x: number; z: number; authored: boolean; species: string;
  falling: boolean;
  harvest: null | { phase: 'standing' | 'fallen' | 'logs'; progress?: number; total?: number; remaining?: number };
};
type State = {
  player: { x: number; z: number };
  cameraAngle: number;
  animationAction: string;
  trees: Tree[];
  deposits: Array<{ x: number; z: number }>;
  rendering: { calls: number; triangles: number; geometries: number; textures: number };
};
type Save = {
  version: number; selectedWeapon: string; resources: { wood: number };
  depleted: string[]; treeHarvest: Record<string, NonNullable<Tree['harvest']>>;
};

async function state(page: Page) {
  return page.evaluate(() => (window as Window & { __newDawnState: () => State }).__newDawnState());
}

async function readSave(page: Page, key = 'primary') {
  return page.evaluate(key => new Promise<Save>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const get = db.transaction('saves').objectStore('saves').get(key);
      get.onerror = () => { db.close(); reject(get.error); };
      get.onsuccess = () => { db.close(); resolve(get.result); };
    };
  }), key);
}

async function save(page: Page) {
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
}

async function selectFists(page: Page, touch: boolean) {
  if (touch) {
    await page.locator('#toolHubButton').tap();
    await page.locator('[data-hub="fists"]').tap();
  } else {
    await page.locator('#toolHubButton').click();
    await page.locator('[data-hub="fists"]').click();
  }
}

for (const viewport of [
  { name: 'desktop', width: 1280, height: 720, touch: false },
  { name: 'portrait', width: 390, height: 844, touch: true },
  { name: 'landscape', width: 844, height: 390, touch: true },
]) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.touch, isMobile: viewport.touch });

    test('starts with a saw and persists the actual felling, sawing and collection journey', async ({ page }, testInfo) => {
      test.setTimeout(240000);
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => {
        if (message.type() === 'error' && /shader|webglprogram/i.test(message.text())) errors.push(message.text());
      });
      await page.goto('./');
      await page.locator('#newGame').click();
      await page.locator('#pauseButton').click();
      await page.locator('#cameraFollow').uncheck();
      await page.locator('#cameraDistance').fill('8');
      await page.locator('#gameSpeed').fill('8');
      await page.locator('#resumeGame').click();
      await expect.poll(async () => (await state(page)).trees.some(tree => tree.authored), { timeout: 30000 }).toBe(true);
      const initial = await state(page);
      const tree = initial.trees.filter(item => item.authored
        && initial.deposits.every(deposit => Math.hypot(deposit.x - item.x, deposit.z - item.z) > 2))
        .sort((a, b) => Math.hypot(a.x - initial.player.x, a.z - initial.player.z)
          - Math.hypot(b.x - initial.player.x, b.z - initial.player.z))[0];
      expect(tree).toBeDefined();
      await walkTo(page, tree, viewport.touch);
      const target = async () => (await state(page)).trees.find(item => item.id === tree.id);
      const work = () => workTree(page, tree.id, viewport.touch);
      await page.screenshot({ path: testInfo.outputPath('standing.png') });
      const beforeRender = (await state(page)).rendering;

      await expect(page.locator('#actionA span')).toHaveText('Saw needed');
      await expect(page.locator('#actionA')).toHaveAttribute('aria-label', 'Saw tree, saw required');
      if (!viewport.touch) await expect(page.locator('#controlsHint')).toContainText('Space saw tree (saw required)');
      await page.screenshot({ path: testInfo.outputPath('tree-needs-saw.png') });
      await timberAction(page, viewport.touch);
      await expect(page.locator('#toast')).toContainText('Select the starter saw');
      expect((await target())?.harvest).toBeNull();
      await selectSaw(page, viewport.touch);
      await expect(page.locator('#weaponButton')).toHaveAttribute('aria-label', 'Attack with saw; use primary action to saw');
      await expect(page.locator('#weaponLabel')).toHaveText('Attack');
      await expect(page.locator('#actionA span')).toHaveText('Saw tree');
      await expect(page.locator('#actionA')).toHaveAttribute('aria-label', 'Saw tree');
      await page.screenshot({ path: testInfo.outputPath('tree-hint.png') });
      const position = (await state(page)).player;
      const dx = position.x - tree.x, dz = position.z - tree.z;
      const distance = Math.hypot(dx, dz);
      const direction = distance > 0.1 ? { x: dx / distance, z: dz / distance } : { x: 1, z: 0 };
      await walkTo(page, { x: tree.x + direction.x * 3, z: tree.z + direction.z * 3 }, viewport.touch);
      const farther = (await state(page)).player;
      expect(Math.hypot(farther.x - tree.x, farther.z - tree.z)).toBeGreaterThan(1.5);
      expect(Math.hypot(farther.x - tree.x, farther.z - tree.z)).toBeLessThan(3.2);
      await expect(page.locator('#actionA span')).toHaveText('Get closer');
      await expect(page.locator('#actionA')).toHaveAttribute('aria-label', 'Move closer to tree');
      if (!viewport.touch) await expect(page.locator('#controlsHint')).toContainText('Space move closer to tree');
      await page.screenshot({ path: testInfo.outputPath('tree-distance.png') });
      await timberAction(page, viewport.touch);
      await expect(page.locator('#toast')).toHaveText('Move closer to the tree or logs');
      expect((await target())?.harvest).toBeNull();
      await walkTo(page, tree, viewport.touch);
      await expect(page.locator('#actionA')).toHaveAttribute('aria-label', 'Saw tree');
      await work();
      await expect.poll(async () => (await target())?.harvest).toMatchObject({ phase: 'standing', progress: 1 });
      await page.waitForTimeout(250);
      await page.screenshot({ path: testInfo.outputPath('sawing.png') });
      await page.waitForTimeout(250);
      await page.screenshot({ path: testInfo.outputPath('sawing-late.png') });
      await save(page);
      const standingSave = await readSave(page);
      expect(standingSave).toMatchObject({ version: 13, selectedWeapon: 'saw', resources: { wood: 0 },
        treeHarvest: { [tree.id]: { phase: 'standing', progress: 1 } } });
      await page.reload();
      await page.locator('#continueGame').click();
      await expect(page.locator('#menu')).not.toHaveClass(/active/);
      await expect(page.locator('#toolHubButton')).toHaveAttribute('aria-label', 'Open tools, saw selected');
      await expect.poll(async () => (await target())?.harvest).toMatchObject({ phase: 'standing', progress: 1 });
      await expect(page.locator('#actionA')).toHaveAttribute('aria-label', 'Saw tree');

      await work();
      await expect.poll(async () => (await target())?.harvest).toMatchObject({ phase: 'standing', progress: 2 });
      await work();
      await expect.poll(async () => (await target())?.harvest?.phase).toBe('fallen');
      expect((await target())?.falling).toBe(true);
      await expect(page.locator('#actionA span')).toHaveText('Wait');
      await expect(page.locator('#actionA')).toHaveAttribute('aria-label', 'Wait for tree to fall');
      await page.screenshot({ path: testInfo.outputPath('falling.png') });
      await expect.poll(async () => (await target())?.falling, { timeout: 15000 }).toBe(false);
      await expect(page.locator('#actionA span')).toHaveText('Saw trunk');
      await expect(page.locator('#actionA')).toHaveAttribute('aria-label', 'Saw trunk');
      const total = (await target())?.harvest?.total;
      expect(total).toBeGreaterThan(3);
      await page.screenshot({ path: testInfo.outputPath('fallen.png') });
      await selectFists(page, viewport.touch);
      await expect(page.locator('#actionA span')).toHaveText('Saw needed');
      await expect(page.locator('#actionA')).toHaveAttribute('aria-label', 'Saw trunk, saw required');
      await timberAction(page, viewport.touch);
      await expect(page.locator('#toast')).toContainText('Select the starter saw');
      await expect.poll(async () => (await target())?.harvest).toMatchObject({ phase: 'fallen', progress: 0 });
      await selectSaw(page, viewport.touch);
      await work();
      await expect.poll(async () => (await target())?.harvest).toMatchObject({ phase: 'fallen', progress: 1 });
      await work();
      await expect.poll(async () => (await target())?.harvest).toMatchObject({ phase: 'logs', remaining: total });
      await expect(page.locator('#actionA span')).toHaveText('Collect');
      await expect(page.locator('#actionA')).toHaveAttribute('aria-label', `Collect cut wood, ${total} remaining`);
      await page.screenshot({ path: testInfo.outputPath('logs.png') });
      const logsRender = (await state(page)).rendering;
      await selectFists(page, viewport.touch);
      await expect(page.locator('#actionA')).toHaveAttribute('aria-label', `Collect cut wood, ${total} remaining`);
      await work();
      await expect.poll(async () => (await target())?.harvest?.remaining).toBe(total! - 3);
      await save(page);
      const partial = await readSave(page);
      expect(partial.resources.wood).toBe(3);
      expect(partial.treeHarvest[tree.id]).toMatchObject({ phase: 'logs', total, remaining: total! - 3 });
      await page.reload();
      await page.locator('#continueGame').click();
      await expect(page.locator('#menu')).not.toHaveClass(/active/);
      await expect.poll(async () => (await target())?.harvest).toMatchObject({ phase: 'logs', total, remaining: total! - 3 });
      await expect(page.locator('#actionA')).toHaveAttribute('aria-label', `Collect cut wood, ${total! - 3} remaining`);
      if (!viewport.touch) {
        await walkTo(page, { x: tree.x + 82, z: tree.z }, false);
        expect(await target()).toBeUndefined();
        await walkTo(page, tree, false);
        await expect.poll(async () => (await target())?.harvest).toMatchObject({ phase: 'logs', total, remaining: total! - 3 });
      }
      while (await target()) await work();
      await save(page);
      const depleted = await readSave(page);
      expect(depleted.resources.wood).toBe(total);
      expect(depleted.depleted).toContain(tree.id);
      expect(depleted.treeHarvest).not.toHaveProperty(tree.id);
      await page.reload();
      await page.locator('#continueGame').click();
      await expect(page.locator('#menu')).not.toHaveClass(/active/);
      expect(await target()).toBeUndefined();
      await save(page);
      const reloaded = await readSave(page);
      expect(reloaded.resources.wood).toBe(total);
      expect(reloaded.depleted).toContain(tree.id);
      console.log(`${viewport.name} tree ${tree.id} (${tree.species}), wood ${total}; renderer before/after:`,
        beforeRender, logsRender);
      expect(errors).toEqual([]);
    });
  });
}

test('upgrades a version 12 save with a backup and an available starter saw', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('./');
  await page.locator('#newGame').click();
  await expect.poll(async () => (await state(page)).trees.length).toBeGreaterThan(0);
  const tree = (await state(page)).trees[0];
  await save(page);
  await page.evaluate(id => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('saves', 'readwrite');
      const store = tx.objectStore('saves');
      const get = store.get('primary');
      get.onsuccess = () => {
        const data = get.result;
        data.version = 12;
        data.selectedWeapon = 'fists';
        data.resources.wood = 17;
        data.depleted = [id];
        delete data.treeHarvest;
        store.put(data, 'primary');
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Legacy fixture transaction aborted')); };
    };
  }), tree.id);
  const legacy = await readSave(page);
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#menu')).not.toHaveClass(/active/);
  expect(await readSave(page, 'pre-timber-backup')).toEqual(legacy);
  expect((await state(page)).trees.some(item => item.id === tree.id)).toBe(false);
  await selectSaw(page);
  await save(page);
  expect(await readSave(page)).toMatchObject({
    version: 13, selectedWeapon: 'saw', resources: { wood: 17 }, depleted: [tree.id], treeHarvest: {},
  });
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#menu')).not.toHaveClass(/active/);
  await expect(page.locator('#toolHubButton')).toHaveAttribute('aria-label', 'Open tools, saw selected');
  expect((await state(page)).trees.some(item => item.id === tree.id)).toBe(false);
});

test('continues a gameplay-harvested trunk offline in the production build', async ({ browser, page }, testInfo) => {
  test.setTimeout(180000);
  await page.goto('./');
  await page.locator('#newGame').click();
  await page.locator('#pauseButton').click();
  await page.locator('#cameraFollow').uncheck();
  await page.locator('#resumeGame').click();
  await expect.poll(async () => (await state(page)).trees.some(tree => tree.authored), { timeout: 30000 }).toBe(true);
  const initial = await state(page);
  const tree = initial.trees.filter(item => item.authored
    && initial.deposits.every(deposit => Math.hypot(deposit.x - item.x, deposit.z - item.z) > 2))
    .sort((a, b) => Math.hypot(a.x - initial.player.x, a.z - initial.player.z)
      - Math.hypot(b.x - initial.player.x, b.z - initial.player.z))[0];
  expect(tree).toBeDefined();
  await walkTo(page, tree);
  await sawTree(page, tree.id);
  await save(page);
  const onlineSave = await readSave(page);
  const remaining = onlineSave.treeHarvest[tree.id].remaining!;
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
      name: 'harvested-world.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(onlineSave)),
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
    await production.locator('#continueGame').click();
    await expect(production.locator('#menu')).not.toHaveClass(/active/);
    await expect(production.locator('#toolHubButton')).toHaveAttribute('aria-label', 'Open tools, saw selected');
    await production.screenshot({ path: testInfo.outputPath('offline-harvest.png') });
    await production.locator('#actionA').tap();
    await expect.poll(async () => (await readSave(production)).resources.wood, { timeout: 15000 }).toBe(3);
    const collected = await readSave(production);
    expect(collected.treeHarvest[tree.id]).toMatchObject({ phase: 'logs', remaining: remaining - 3 });
    await production.reload();
    await production.locator('#continueGame').click();
    await expect(production.locator('#menu')).not.toHaveClass(/active/);
    await save(production);
    expect(await readSave(production)).toMatchObject({
      resources: { wood: 3 }, treeHarvest: { [tree.id]: { phase: 'logs', remaining: remaining - 3 } },
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
