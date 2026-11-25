import { expect, test, type Page } from '@playwright/test';

type SavedWorld = {
  version: number;
  player: { x: number; z: number };
  npc: { x: number; z: number };
  vehicle: { x: number; z: number };
  wildlife: unknown[];
  resources: { wood: number };
  minerals: { sand: number; coal: number };
  ingots: { iron: number; copper: number; glass: number };
  buildings: Array<{ kind: string; x: number; z: number }>;
  structures: Array<{ id: string; kind: string; x: number; z: number; rotation: number }>;
};

async function save(page: Page) {
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.locator('#resumeGame').click();
}

async function readSave(page: Page) {
  return page.evaluate(() => new Promise<SavedWorld>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const get = db.transaction('saves').objectStore('saves').get('primary');
      get.onerror = () => reject(get.error);
      get.onsuccess = () => { resolve(get.result); db.close(); };
    };
  }));
}

test('mouse look locks only from a world click and releases for menus and construction', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await page.locator('#newGame').click();
  await save(page);
  const before = (await readSave(page)).player;
  const lock = async () => {
    await page.mouse.click(1000, 500);
    await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe('game');
    await expect(page.locator('#controlsHint')).toContainText('MOUSE LOOK ACTIVE');
  };
  await lock();
  await page.mouse.move(1100, 550, { steps: 4 });
  await page.keyboard.press('b');
  await expect(page.locator('#buildPanel')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement)).toBeNull();
  await page.locator('[data-building="floor"]').click();
  await expect(page.locator('#placementToolbar')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#placementToolbar')).toBeHidden();
  await save(page);
  expect((await readSave(page)).player).toEqual(before);
  await lock();
  await page.keyboard.press('i');
  await expect(page.locator('#craftPanel')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement)).toBeNull();
  await page.locator('#closeCraft').click();
  await lock();
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => document.pointerLockElement)).toBeNull();
  await expect(page.locator('#pausePanel')).toBeHidden();
  await page.waitForTimeout(350);
  await page.keyboard.press('Escape');
  await expect(page.locator('#pausePanel')).toBeVisible();
  await page.locator('#legacyCamera').check();
  await page.locator('#resumeGame').click();
  await expect(page.locator('#controlsHint')).toContainText('Right-drag');
  await page.mouse.move(900, 500);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(980, 520, { steps: 4 });
  await page.mouse.up({ button: 'right' });
  await expect.poll(() => page.evaluate(() => document.pointerLockElement)).toBeNull();
});

test('makes glass in the furnace and installs it into a wall replacement', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1440, height: 900 });
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
        const data = get.result;
        data.resources.wood = 50;
        data.resources.stone = 8;
        data.minerals.sand = 2;
        data.minerals.coal = 1;
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
  const findReady = async () => {
    for (const y of [495, 585, 675, 405, 720]) {
      for (const x of [720, 504, 936, 360, 1080]) {
        await page.mouse.move(x, y);
        if (await page.locator('#placementStatus').innerText() === 'Ready to place') return { x, y };
      }
    }
    throw new Error('No valid construction target');
  };
  await findReady();
  await page.locator('#confirmBuild').click();
  await expect(page.locator('#toast')).toHaveText('Smelter constructed');
  await page.locator('#cancelBuild').click();
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
        const data = get.result as SavedWorld;
        const furnace = data.buildings.find(building => building.kind === 'smelter')!;
        data.player.x = furnace.x + 1.5;
        data.player.z = furnace.z;
        data.npc = { x: furnace.x + 20, z: furnace.z + 20 };
        data.vehicle = { x: furnace.x + 25, z: furnace.z + 25 };
        store.put(data, 'primary');
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }));
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  await page.keyboard.press('e');
  await expect(page.locator('#smelterPanel')).toBeVisible();
  await page.locator('[data-smelt="sand"]').click();
  await expect(page.locator('#toast')).toHaveText('Smelting started');
  await page.locator('#closeSmelter').click();
  await expect(page.locator('#toast')).toHaveText('Smelting complete', { timeout: 20000 });
  await save(page);
  const processed = await readSave(page);
  expect(processed.minerals).toMatchObject({ sand: 0, coal: 0 });
  expect(processed.ingots.glass).toBe(1);
  await page.locator('[data-tool="build"]').click();
  await page.locator('[data-building="floor"]').click();
  const point = await findReady();
  await page.locator('#confirmBuild').click();
  await expect.poll(async () => (await readSave(page)).structures.length).toBe(1);
  await page.locator('#changeBuild').click();
  await page.locator('[data-building="wall"]').click();
  await page.mouse.move(point.x, point.y);
  await expect(page.locator('#placementStatus')).toHaveText('Ready to place');
  await page.locator('#confirmBuild').click();
  await expect.poll(async () => (await readSave(page)).structures.length).toBe(2);
  const wall = (await readSave(page)).structures.find(piece => piece.kind === 'wall')!;
  await page.locator('#changeBuild').click();
  await page.locator('[data-building="windowframe"]').click();
  let replacementPoint: { x: number; y: number } | undefined;
  for (let y = Math.max(300, point.y - 160); y <= Math.min(780, point.y + 160); y += 15) {
    for (let x = Math.max(230, point.x - 160); x <= Math.min(1120, point.x + 160); x += 15) {
      await page.mouse.move(x, y);
      if ((await page.locator('#placementStatus').innerText()).startsWith('Replace wall')) { replacementPoint = { x, y }; break; }
    }
    if (replacementPoint) break;
  }
  expect(replacementPoint).toBeDefined();
  await page.locator('#confirmBuild').click();
  await expect.poll(async () => (await readSave(page)).structures.some(piece => piece.kind === 'windowframe')).toBe(true);
  await page.locator('#changeBuild').click();
  await page.locator('[data-building="window"]').click();
  await page.mouse.move(replacementPoint!.x, replacementPoint!.y);
  await expect(page.locator('#placementStatus')).toHaveText('Ready to place');
  await page.locator('#confirmBuild').click();
  await expect.poll(async () => (await readSave(page)).structures.some(piece => piece.kind === 'window')).toBe(true);
  const built = await readSave(page);
  expect(built.ingots.glass).toBe(0);
  expect(built.structures.find(piece => piece.kind === 'windowframe')).toMatchObject({ id: wall.id, x: wall.x, z: wall.z });
  expect(built.structures).toHaveLength(3);
  await page.keyboard.press('Escape');
  await save(page);
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  expect((await readSave(page)).structures).toEqual(built.structures);
  expect((await readSave(page)).version).toBe(11);
});

test('a window without glass is rejected without consuming wood', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
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
      get.onsuccess = () => { const data = get.result; data.resources.wood = 10; store.put(data, 'primary'); };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }));
  await page.reload();
  await page.locator('#continueGame').click();
  await page.locator('[data-tool="build"]').click();
  await page.locator('[data-building="windowframe"]').click();
  let target: { x: number; y: number } | undefined;
  for (const y of [495, 585, 675, 405, 720]) {
    for (const x of [720, 504, 936, 360, 1080]) {
      await page.mouse.move(x, y);
      if (await page.locator('#placementStatus').innerText() === 'Ready to place') { target = { x, y }; break; }
    }
    if (target) break;
  }
  expect(target).toBeDefined();
  await page.locator('#confirmBuild').click();
  await expect.poll(async () => (await readSave(page)).structures.length).toBe(1);
  const before = await readSave(page);
  await page.locator('#changeBuild').click();
  await page.locator('[data-building="window"]').click();
  await page.mouse.move(target!.x, target!.y);
  await expect(page.locator('#placementStatus')).toHaveText('Need 1 glass');
  await page.locator('#confirmBuild').click();
  await expect(page.locator('#toast')).toHaveText('Need 1 glass');
  await page.keyboard.press('Escape');
  await save(page);
  const after = await readSave(page);
  expect(after.resources.wood).toBe(before.resources.wood);
  expect(after.ingots.glass).toBe(0);
  expect(after.structures).toEqual(before.structures);
});

test('walking forward follows a changed mouse-look direction', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await page.locator('#newGame').click();
  await page.locator('#pauseButton').click();
  await page.locator('#cameraFollow').uncheck();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.locator('#resumeGame').click();
  const start = (await readSave(page)).player;
  const lock = async () => {
    await page.mouse.click(1000, 500);
    await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe('game');
  };
  await lock();
  await page.keyboard.down('w');
  await page.waitForTimeout(700);
  await page.keyboard.up('w');
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => document.pointerLockElement)).toBeNull();
  await page.waitForTimeout(350);
  await save(page);
  const first = (await readSave(page)).player;
  await lock();
  await page.mouse.move(1250, 500, { steps: 5 });
  await page.keyboard.down('w');
  await page.waitForTimeout(700);
  await page.keyboard.up('w');
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => document.pointerLockElement)).toBeNull();
  await page.waitForTimeout(350);
  await save(page);
  const second = (await readSave(page)).player;
  const a = { x: first.x - start.x, z: first.z - start.z };
  const b = { x: second.x - first.x, z: second.z - first.z };
  expect(Math.hypot(a.x, a.z)).toBeGreaterThan(0.3);
  expect(Math.hypot(b.x, b.z)).toBeGreaterThan(0.3);
  const cosine = (a.x * b.x + a.z * b.z) / (Math.hypot(a.x, a.z) * Math.hypot(b.x, b.z));
  expect(cosine).toBeLessThan(0.6);
});

test('places a floor and wall, then replaces the wall with a frame without duplicating it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
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
        const data = get.result as SavedWorld;
        data.resources.wood = 50;
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
  await page.locator('[data-building="floor"]').click();
  let point: { x: number; y: number } | undefined;
  for (const y of [495, 585, 675, 405]) {
    for (const x of [720, 504, 936, 360, 1080]) {
      await page.mouse.move(x, y);
      if (await page.locator('#placementStatus').innerText() === 'Ready to place') { point = { x, y }; break; }
    }
    if (point) break;
  }
  expect(point).toBeDefined();
  await page.locator('#confirmBuild').click();
  await expect.poll(async () => (await readSave(page)).structures.length).toBe(1);
  const floor = (await readSave(page)).structures[0];
  await page.locator('#changeBuild').click();
  await page.locator('[data-building="wall"]').click();
  await page.mouse.move(point!.x, point!.y);
  await expect(page.locator('#placementStatus')).toHaveText('Ready to place');
  const coordinates = await page.locator('#placementCoordinates').innerText();
  const match = /Grid (-?\d+), (-?\d+)/.exec(coordinates)!;
  expect(Math.abs(Number(match[1]) - floor.x) + Math.abs(Number(match[2]) - floor.z)).toBe(1);
  await page.locator('#confirmBuild').click();
  await expect.poll(async () => (await readSave(page)).structures.length).toBe(2);
  const built = await readSave(page);
  const wall = built.structures.find(piece => piece.kind === 'wall')!;
  await page.locator('#changeBuild').click();
  await page.locator('[data-building="doorframe"]').click();
  let replacement = false;
  for (let y = Math.max(300, point!.y - 160); y <= Math.min(780, point!.y + 160); y += 15) {
    for (let x = Math.max(230, point!.x - 160); x <= Math.min(1120, point!.x + 160); x += 15) {
      await page.mouse.move(x, y);
      if ((await page.locator('#placementStatus').innerText()).startsWith('Replace wall')) { replacement = true; break; }
    }
    if (replacement) break;
  }
  expect(replacement).toBe(true);
  await page.locator('#confirmBuild').click();
  await expect.poll(async () => (await readSave(page)).structures.some(piece => piece.kind === 'doorframe')).toBe(true);
  const after = await readSave(page);
  expect(after.structures).toHaveLength(2);
  expect(after.structures.find(piece => piece.kind === 'doorframe')).toMatchObject({ id: wall.id, x: wall.x, z: wall.z, rotation: wall.rotation });
  expect(after.resources.wood).toBe(built.resources.wood - 1);
  await page.keyboard.press('Escape');
  await save(page);
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  expect((await readSave(page)).structures).toEqual(after.structures);
});
