import { expect, test, type Page } from '@playwright/test';

type TestSave = {
  version: number;
  planetPositions?: unknown;
  seed: number;
  player: { x: number; y: number; z: number };
  npc: { x: number; z: number };
  vehicle: { x: number; z: number };
  wildlife: unknown[];
  resources: { wood: number; stone: number };
  minerals: { ironOre: number; coal: number };
  mining: Record<string, number>;
  buildings: Array<{ kind: string; x: number; z: number; smelting?: { remaining: number } }>;
  tools: string[];
  ingots: { iron: number; copper: number };
  ironPickaxe: boolean;
};

async function save(page: Page) {
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.locator('#resumeGame').click();
}

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900, touch: false },
  { name: 'mobile portrait', width: 390, height: 844, touch: true },
  { name: 'mobile landscape', width: 844, height: 390, touch: true },
]) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.touch, isMobile: viewport.touch });

    test('crafts a pickaxe and mines a finite deposit across reloads', async ({ page }) => {
      await page.goto('./');
      await page.locator('#newGame').click();
      await save(page);
      const fixture = await page.evaluate(async () => {
        const { World } = await import('/NewDawn/src/world.ts');
        const save = await new Promise<TestSave>((resolve, reject) => {
          const request = indexedDB.open('new-dawn', 1);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const get = db.transaction('saves').objectStore('saves').get('primary');
            get.onerror = () => reject(get.error);
            get.onsuccess = () => { resolve(get.result); db.close(); };
          };
        });
        const world = new World(save.seed);
        const deposit = world.group.children.find(item => item.userData.depositId && item.userData.mineral === 'ironOre');
        if (!deposit) throw new Error('No starter iron deposit found');
        const result = { x: deposit.position.x, z: deposit.position.z, id: deposit.userData.depositId as string };
        world.dispose();
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('new-dawn', 1);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('saves', 'readwrite');
            save.version = 11;
            delete save.planetPositions;
            save.player = { x: result.x, y: 1, z: result.z };
            save.npc = { x: result.x + 20, z: result.z + 20 };
            save.vehicle = { x: result.x + 25, z: result.z + 25 };
            save.wildlife = [];
            save.resources.wood = 2;
            save.resources.stone = 3;
            tx.objectStore('saves').put(save, 'primary');
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => reject(tx.error);
          };
        });
        return result;
      });
      await page.reload();
      await page.locator('#continueGame').click();
      await expect(page.locator('#pauseButton')).toBeVisible();
      const gather = async () => {
        if (viewport.touch) await page.locator('#actionA').click();
        else await page.keyboard.press('Space');
      };
      await gather();
      await expect(page.locator('#toast')).toHaveText('Craft a pickaxe to mine this deposit');
      await page.locator('#toolHubButton').click();
      await page.locator('#inventoryButton').click();
      await page.locator('[data-craft="pickaxe"]').click();
      await page.locator('#closeCraft').click();
      await gather();
      await expect(page.locator('#toast')).toHaveText('+1 ironOre · 1/3');
      await save(page);
      await page.reload();
      await page.locator('#continueGame').click();
      await expect(page.locator('#pauseButton')).toBeVisible();
      await page.locator('#toolHubButton').click();
      await page.locator('#inventoryButton').click();
      await expect(page.locator('#mineralInventory')).toContainText('iron ore 1');
      await page.locator('#closeCraft').click();
      await gather();
      await expect(page.locator('#toast')).toHaveText('+1 ironOre · 2/3');
      await page.waitForTimeout(800);
      await gather();
      await expect(page.locator('#toast')).toHaveText('+1 ironOre · 3/3');
      await save(page);
      const saved = await page.evaluate(() => new Promise<TestSave>((resolve, reject) => {
        const request = indexedDB.open('new-dawn', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const get = db.transaction('saves').objectStore('saves').get('primary');
          get.onerror = () => reject(get.error);
          get.onsuccess = () => { resolve(get.result); db.close(); };
        };
      }));
      expect(saved.minerals.ironOre).toBe(3);
      expect(saved.mining[fixture.id]).toBe(3);
      expect(saved.resources).toMatchObject({ wood: 0, stone: 0 });
      await page.reload();
      await page.locator('#continueGame').click();
      await expect(page.locator('#pauseButton')).toBeVisible();
      await page.locator('#toolHubButton').click();
      await page.locator('#inventoryButton').click();
      await expect(page.locator('#mineralInventory')).toContainText('iron ore 3');
    });
  });
}

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900, touch: false },
  { name: 'mobile landscape', width: 844, height: 390, touch: true },
]) {
test.describe(`smelting ${viewport.name}`, () => {
  test.use({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.touch, isMobile: viewport.touch });
test('builds a smelter, resumes a fuelled job after reload and forges an iron pickaxe', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('./');
  await page.locator('#newGame').click();
  await save(page);
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('saves', 'readwrite');
      const store = tx.objectStore('saves');
      const get = store.get('primary');
      get.onsuccess = () => {
        const data = get.result as TestSave;
        data.resources.wood = 10;
        data.resources.stone = 8;
        data.minerals.ironOre = 4;
        data.minerals.coal = 2;
        data.tools = ['pickaxe'];
        data.wildlife = [];
        store.put(data, 'primary');
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }));
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  await page.locator('[data-tool="build"]').click();
  await page.locator('[data-building="smelter"]').click();
  let valid = false;
  for (const y of [0.55, 0.65, 0.75, 0.45]) {
    for (const x of [0.5, 0.35, 0.65, 0.25, 0.75]) {
      if (viewport.touch) await page.touchscreen.tap(viewport.width * x, viewport.height * y);
      else await page.mouse.move(viewport.width * x, viewport.height * y);
      if (await page.locator('#placementStatus').innerText() === 'Ready to place') { valid = true; break; }
    }
    if (valid) break;
  }
  expect(valid).toBe(true);
  if (viewport.touch) await page.locator('#actionA').tap();
  else await page.locator('#confirmBuild').click();
  await expect(page.locator('#toast')).toHaveText('Smelter constructed');
  if (viewport.touch) await page.locator('#actionB').tap();
  else await page.locator('#cancelBuild').click();
  await save(page);
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('saves', 'readwrite');
      const store = tx.objectStore('saves');
      const get = store.get('primary');
      get.onsuccess = () => {
        const data = get.result as TestSave;
        data.version = 11;
        delete data.planetPositions;
        const smelter = data.buildings.find(building => building.kind === 'smelter')!;
        data.player.x = smelter.x + 1.5;
        data.player.z = smelter.z;
        data.npc = { x: smelter.x + 20, z: smelter.z + 20 };
        data.vehicle = { x: smelter.x + 25, z: smelter.z + 25 };
        store.put(data, 'primary');
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }));
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  const openSmelter = async () => {
    if (viewport.touch) await page.locator('#actionB').tap();
    else await page.keyboard.press('e');
    await expect(page.locator('#smelterPanel')).toBeVisible();
  };
  await openSmelter();
  await page.locator('[data-smelt="ironOre"]').click();
  await expect(page.locator('#toast')).toHaveText('Smelting started');
  await page.locator('#closeSmelter').click();
  await save(page);
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  await openSmelter();
  await expect(page.locator('#smelterStatus')).toContainText('Processing ironOre');
  await page.locator('#closeSmelter').click();
  await expect(page.locator('#toast')).toHaveText('Smelting complete', { timeout: 20000 });
  await openSmelter();
  await page.locator('[data-smelt="ironOre"]').click();
  await page.locator('#closeSmelter').click();
  await expect(page.locator('#toast')).toHaveText('Smelting complete', { timeout: 20000 });
  await openSmelter();
  await expect(page.locator('#smelterStatus')).toContainText('Ready. Iron: 2');
  await page.locator('#forgePickaxe').click();
  await expect(page.locator('#toast')).toHaveText('Iron pickaxe forged');
  await page.locator('#closeSmelter').click();
  await save(page);
  await page.evaluate(async () => {
    const { World } = await import('/NewDawn/src/world.ts');
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('new-dawn', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('saves', 'readwrite');
        const store = tx.objectStore('saves');
        const get = store.get('primary');
        get.onsuccess = () => {
          const data = get.result as TestSave;
          data.version = 11;
          delete data.planetPositions;
          const world = new World(data.seed);
          const deposit = world.group.children.find(item => item.userData.mineral === 'ironOre'
            && data.buildings.every(building => Math.hypot(building.x - item.position.x, building.z - item.position.z) > 5));
          if (!deposit) { tx.abort(); world.dispose(); return; }
          data.player = { x: deposit.position.x, y: deposit.position.y, z: deposit.position.z };
          data.npc = { x: deposit.position.x + 20, z: deposit.position.z + 20 };
          data.vehicle = { x: deposit.position.x + 25, z: deposit.position.z + 25 };
          world.dispose();
          store.put(data, 'primary');
        };
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onabort = () => { db.close(); reject(tx.error ?? new Error('No iron deposit found')); };
        tx.onerror = () => reject(tx.error);
      };
    });
  });
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  if (viewport.touch) await page.locator('#actionA').tap();
  else await page.keyboard.press('Space');
  await expect(page.locator('#toast')).toHaveText('+2 ironOre · 1/3');
  await page.locator('#toolHubButton').click();
  await page.locator('#inventoryButton').click();
  await expect(page.locator('#mineralInventory')).toContainText('iron pickaxe');
  await expect(page.locator('#mineralInventory')).toContainText('iron ore 2');
});
});
}
