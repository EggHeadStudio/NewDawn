import { expect, test, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { sawTree, timberAction, walkTo, workTree } from './timber-helpers';

type State = {
  player: { x: number; z: number };
  selectedWeapon: string;
  trees: Array<{ id: string; x: number; z: number; authored: boolean }>;
  deposits: Array<{ x: number; z: number }>;
  characterVisual: { heldTools: string[] };
};
type Save = {
  version: number;
  axeRequiresCrafting?: true;
  selectedWeapon: string;
  resources: { wood: number; stone: number };
  tools: string[];
  depleted: string[];
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

async function save(page: Page, touch = false) {
  if (touch) {
    await page.locator('#pauseButton').tap();
    await page.locator('#saveGame').tap();
  } else {
    await page.locator('#pauseButton').click();
    await page.locator('#saveGame').click();
  }
  await expect(page.locator('#toast')).toHaveText('World saved');
}

async function looseStone(page: Page, position: { x: number; z: number }) {
  return page.evaluate(async position => {
    const { World } = await import('/NewDawn/src/world.ts');
    const world = new World(1847);
    try {
      const natural = world.group.children.filter(object => object.userData.resource);
      const deposits = world.group.children.filter(object => object.userData.depositId);
      const locations = natural.map(object => ({ object, ...world.resourceLocation(object) }));
      const depositLocations = deposits.map(object => world.resourceLocation(object));
      const candidates = locations.filter(item => item.object.userData.resource === 'stone'
        && locations.every(other => other.object === item.object || Math.hypot(other.x - item.x, other.z - item.z) > 2.4)
        && depositLocations.every(other => Math.hypot(other.x - item.x, other.z - item.z) > 2.4));
      candidates.sort((a, b) => Math.hypot(a.x - position.x, a.z - position.z)
        - Math.hypot(b.x - position.x, b.z - position.z));
      const candidate = candidates[0];
      if (!candidate) throw new Error('No accessible loose stone in the starting chunks');
      return { id: candidate.object.userData.resourceId as string, x: candidate.x, z: candidate.z };
    } finally {
      world.dispose();
    }
  }, position);
}

for (const viewport of [
  { name: 'desktop', width: 1280, height: 720, touch: false },
  { name: 'portrait', width: 390, height: 844, touch: true },
  { name: 'landscape', width: 844, height: 390, touch: true },
]) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.touch, isMobile: viewport.touch });

    test('crafts and equips an axe from naturally gathered materials', async ({ browser, page }, testInfo) => {
      test.setTimeout(240000);
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      const activate = async (selector: string) => {
        if (viewport.touch) await page.locator(selector).tap();
        else await page.locator(selector).click();
      };

      await page.goto('./');
      await activate('#newGame');
      await activate('#toolHubButton');
      const axe = page.locator('[data-hub="axe"]');
      await expect(axe).toHaveClass(/needs-crafting/);
      await expect(axe).toHaveAccessibleName('Axe, craft in Pack first');
      await page.screenshot({ path: testInfo.outputPath('axe-unavailable.png') });
      if (viewport.touch) await activate('[data-hub="axe"]');
      else { await axe.focus(); await page.keyboard.press('Enter'); }
      await expect(page.locator('#panelNotification')).toHaveText('Craft an axe in Pack first');
      await expect(axe).toHaveAttribute('aria-pressed', 'false');
      await page.screenshot({ path: testInfo.outputPath('axe-explanation.png') });
      expect((await state(page)).selectedWeapon).toBe('fists');
      const header = (await page.locator('#toolHub header').boundingBox())!;
      const hub = (await page.locator('#toolHub').boundingBox())!;
      const pack = (await page.locator('#inventoryButton').boundingBox())!;
      expect(pack.y).toBeGreaterThanOrEqual(header.y + header.height);
      expect(pack.y + pack.height).toBeLessThanOrEqual(hub.y + hub.height);
      if (viewport.touch) await activate('#inventoryButton');
      else {
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Shift+Tab');
        await expect(page.locator('#inventoryButton')).toBeFocused();
        await page.keyboard.press('Enter');
      }
      await expect(page.locator('#craftPanel')).toBeVisible();
      await activate('[data-craft="axe"]');
      await expect(page.locator('#panelNotification')).toHaveText('Not enough resources');
      await activate('#closeCraft');
      await save(page, viewport.touch);
      expect(await readSave(page)).toMatchObject({ version: 13, axeRequiresCrafting: true,
        selectedWeapon: 'fists', tools: [], resources: { wood: 0, stone: 0 } });
      await page.reload();
      await activate('#continueGame');
      await activate('#toolHubButton');
      await expect(axe).toHaveClass(/needs-crafting/);
      await activate('#closeToolHub');
      await activate('#pauseButton');
      await page.locator('#cameraFollow').uncheck();
      await activate('#resumeGame');

      await expect.poll(async () => (await state(page)).trees.some(tree => tree.authored), { timeout: 30000 }).toBe(true);
      const initial = await state(page);
      const tree = initial.trees.filter(item => item.authored
        && initial.deposits.every(deposit => Math.hypot(deposit.x - item.x, deposit.z - item.z) > 2))
        .sort((a, b) => Math.hypot(a.x - initial.player.x, a.z - initial.player.z)
          - Math.hypot(b.x - initial.player.x, b.z - initial.player.z))[0];
      expect(tree).toBeDefined();
      await walkTo(page, tree, viewport.touch);
      await sawTree(page, tree.id, viewport.touch);
      await workTree(page, tree.id, viewport.touch);

      const rock = await looseStone(page, (await state(page)).player);
      await walkTo(page, rock, viewport.touch);
      await timberAction(page, viewport.touch);
      await expect(page.locator('#toast')).toHaveText('+2 stone');
      await save(page, viewport.touch);
      expect(await readSave(page)).toMatchObject({ resources: { wood: 3, stone: 2 }, tools: [] });
      expect((await readSave(page)).depleted).toContain(rock.id);
      await activate('#resumeGame');

      await activate('#toolHubButton');
      await activate('#inventoryButton');
      await expect(page.locator('[data-craft="axe"]')).toBeEnabled();
      await activate('[data-craft="axe"]');
      await expect(page.locator('#panelNotification')).toHaveText('axe crafted');
      await expect(page.locator('[data-craft="axe"]')).toBeDisabled();
      await page.screenshot({ path: testInfo.outputPath('axe-crafted.png') });
      await activate('#closeCraft');
      await expect(page.locator('#toolHubButton')).toHaveAttribute('aria-label', 'Open tools, axe selected');
      await expect.poll(async () => (await state(page)).characterVisual.heldTools, { timeout: 30000 }).toEqual(['chop']);
      if (!viewport.touch) {
        await page.keyboard.press('1');
        expect((await state(page)).selectedWeapon).toBe('fists');
        await page.keyboard.press('2');
        expect((await state(page)).selectedWeapon).toBe('saw');
        await page.keyboard.press('3');
        expect((await state(page)).selectedWeapon).toBe('axe');
        await page.keyboard.press('4');
        await expect(page.locator('#toast')).toHaveText('Craft a pickaxe in Pack first');
        expect((await state(page)).selectedWeapon).toBe('axe');
      }
      await activate('#toolHubButton');
      await expect(axe).not.toHaveClass(/needs-crafting/);
      await expect(axe).toHaveAccessibleName('Axe');
      if (viewport.touch) await activate('[data-hub="axe"]');
      else { await axe.focus(); await page.keyboard.press('Space'); }
      await expect(page.locator('#toolHubButton')).toHaveAttribute('aria-label', 'Open tools, axe selected');
      await expect.poll(async () => (await state(page)).characterVisual.heldTools, { timeout: 30000 }).toEqual(['chop']);
      await page.screenshot({ path: testInfo.outputPath('axe-equipped.png') });
      await save(page, viewport.touch);
      expect(await readSave(page)).toMatchObject({ axeRequiresCrafting: true, selectedWeapon: 'axe',
        tools: ['axe'], resources: { wood: 0, stone: 0 } });
      await page.reload();
      await activate('#continueGame');
      await expect(page.locator('#toolHubButton')).toHaveAttribute('aria-label', 'Open tools, axe selected');
      await expect.poll(async () => (await state(page)).characterVisual.heldTools, { timeout: 30000 }).toEqual(['chop']);
      await save(page, viewport.touch);
      expect(await readSave(page)).toMatchObject({ axeRequiresCrafting: true, selectedWeapon: 'axe',
        tools: ['axe'], resources: { wood: 0, stone: 0 } });
      if (!viewport.touch) {
        const onlineSave = await readSave(page);
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
            name: 'crafted-axe-world.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(onlineSave)),
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
          await production.locator('#continueGame').tap();
          await expect(production.locator('#toolHubButton')).toHaveAttribute('aria-label', 'Open tools, axe selected');
          await production.locator('#toolHubButton').tap();
          await production.locator('[data-hub="fists"]').tap();
          await production.locator('#toolHubButton').tap();
          await production.locator('[data-hub="axe"]').tap();
          await expect(production.locator('#toolHubButton')).toHaveAttribute('aria-label', 'Open tools, axe selected');
          await production.screenshot({ path: testInfo.outputPath('axe-offline.png') });
          await save(production, true);
          expect(await readSave(production)).toMatchObject({ axeRequiresCrafting: true, selectedWeapon: 'axe',
            tools: ['axe'], resources: { wood: 0, stone: 0 } });
          await production.reload();
          await production.locator('#continueGame').tap();
          await expect(production.locator('#toolHubButton')).toHaveAttribute('aria-label', 'Open tools, axe selected');
        } finally {
          await context.setOffline(false);
          await context.close();
          if (preview.exitCode === null) {
            const exited = new Promise<void>(resolve => preview.once('exit', () => resolve()));
            preview.kill('SIGTERM');
            await exited;
          }
        }
      }
      expect(errors).toEqual([]);
    });
  });
}

for (const legacy of [
  { version: 12, selectedWeapon: 'axe' },
  { version: 13, selectedWeapon: 'fists' },
]) {
  test(`preserves the previously free axe in a version ${legacy.version} save with ${legacy.selectedWeapon} selected`, async ({ page }) => {
    await page.goto('./');
    await page.locator('#newGame').click();
    await save(page);
    const original = await page.evaluate(legacy => new Promise<Save>((resolve, reject) => {
      const request = indexedDB.open('new-dawn', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('saves', 'readwrite');
        const store = tx.objectStore('saves');
        const get = store.get('primary');
        let record: Save;
        get.onsuccess = () => {
          record = get.result;
          record.version = legacy.version;
          record.selectedWeapon = legacy.selectedWeapon;
          record.tools = ['pickaxe'];
          record.resources.wood = 9;
          record.resources.stone = 4;
          delete record.axeRequiresCrafting;
          if (record.version < 13) delete (record as Save & { treeHarvest?: unknown }).treeHarvest;
          store.put(record, 'primary');
        };
        tx.oncomplete = () => { db.close(); resolve(record); };
        tx.onerror = () => { db.close(); reject(tx.error); };
        tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Legacy equipment fixture aborted')); };
      };
    }), legacy);
    await page.reload();
    await page.locator('#continueGame').click();
    await expect(page.locator('#toolHubButton')).toHaveAttribute('aria-label', `Open tools, ${legacy.selectedWeapon} selected`);
    await page.locator('#toolHubButton').click();
    await expect(page.locator('[data-hub="axe"]')).not.toHaveClass(/needs-crafting/);
    await page.locator('[data-hub="axe"]').click();
    await expect(page.locator('#toolHubButton')).toHaveAttribute('aria-label', 'Open tools, axe selected');
    await save(page);
    expect(await readSave(page, 'pre-equipment-backup')).toEqual(original);
    expect(await readSave(page)).toMatchObject({ version: 13, axeRequiresCrafting: true, selectedWeapon: 'axe',
      tools: ['pickaxe', 'axe'], resources: { wood: 9, stone: 4 } });
    await page.reload();
    await page.locator('#continueGame').click();
    await expect(page.locator('#toolHubButton')).toHaveAttribute('aria-label', 'Open tools, axe selected');
    await save(page);
    expect((await readSave(page)).tools).toEqual(['pickaxe', 'axe']);
  });
}
