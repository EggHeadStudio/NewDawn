import { expect, test, type Page } from '@playwright/test';

type Piece = { id: string; kind: string; x: number; z: number; y: number; level: number; rotation: number; open: boolean };
type World = { version: number; resources: { wood: number }; structures: Piece[]; player: { x: number; y: number; z: number }; npc: { x: number; z: number }; vehicle: { x: number; z: number } };

async function readRecord(page: Page, key = 'primary') {
  return page.evaluate(key => new Promise<World>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const get = db.transaction('saves').objectStore('saves').get(key);
      get.onerror = () => reject(get.error);
      get.onsuccess = () => { resolve(get.result); db.close(); };
    };
  }), key);
}

async function setFixture(page: Page, scenario: 'legacy' | 'door') {
  await page.evaluate(scenario => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('saves', 'readwrite');
      const store = tx.objectStore('saves');
      const get = store.get('primary');
      get.onsuccess = () => {
        const data = get.result;
        if (scenario === 'legacy') {
          data.version = 6;
          delete data.structures;
          delete data.autoRoof;
          data.resources.wood = 50;
        } else {
          const door = data.structures.find((piece: Piece) => piece.kind === 'door');
          data.player = { x: door.x, y: door.y, z: door.z + 1.2 };
          data.npc = { x: door.x + 15, z: door.z + 15 };
          data.vehicle = { x: door.x - 15, z: door.z - 15 };
        }
        store.put(data, 'primary');
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    };
  }), scenario);
}

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

    test('places and restores structural pieces and operates a persistent door', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      if (!viewport.touch) await page.addInitScript(() => Object.defineProperty(crypto, 'randomUUID', { value: undefined }));
      await page.goto('./');
      await page.locator('#newGame').click();
      await save(page);
      await setFixture(page, 'legacy');
      await page.reload();
      await page.locator('#continueGame').click();
      await expect(page.locator('#pauseButton')).toBeVisible();
      expect((await readRecord(page, 'pre-construction-backup')).version).toBe(6);
      await page.locator('[data-tool="build"]').click();

      const aim = async (x: number, y: number) => {
        if (viewport.touch) await page.touchscreen.tap(x, y);
        else await page.mouse.move(x, y);
      };
      const findTarget = async () => {
        for (const y of [0.55, 0.65, 0.75, 0.45, 0.8]) {
          for (const x of [0.5, 0.35, 0.65, 0.25, 0.75]) {
            const point = { x: Math.round(viewport.width * x), y: Math.round(viewport.height * y) };
            await aim(point.x, point.y);
            if (await page.locator('#placementStatus').innerText() === 'Ready to place') return point;
          }

        }
        throw new Error('No valid visible construction target');
      };
      const place = async () => {
        if (viewport.touch) await page.locator('#actionA').tap();
        else await page.locator('#confirmBuild').click();
      };
      const choose = async (kind: string) => {
        await page.locator(`[data-building="${kind}"]`).click();
        await expect(page.locator('#buildPanel')).toBeHidden();
        await expect(page.locator('#floorControls')).toBeVisible();
      };
      await choose('floor');
      await findTarget();
      await place();
      await expect.poll(async () => (await readRecord(page)).structures?.length).toBe(1);
      await page.locator('#floorUp').click();
      await expect(page.locator('#floorLevel')).toHaveText('LEVEL 1');
      await expect(page.locator('#placementStatus')).toHaveText('Ready to place');
      await place();
      await expect.poll(async () => (await readRecord(page)).structures?.length).toBe(2);
      await page.locator('#floorDown').click();
      await page.locator('#changeBuild').click();
      await choose('doorframe');
      const framePoint = await findTarget();
      await place();
      await expect.poll(async () => (await readRecord(page)).structures?.length).toBe(3);
      await page.locator('#changeBuild').click();
      await choose('door');
      await aim(framePoint.x, framePoint.y);
      await expect(page.locator('#placementStatus')).toHaveText('Ready to place');
      await place();
      await expect.poll(async () => (await readRecord(page)).structures?.length).toBe(4);
      const built = await readRecord(page);
      expect(built.resources.wood).toBe(42);
      expect(built.structures.filter(piece => piece.kind === 'floor').map(piece => piece.level)).toEqual([0, 1]);
      if (viewport.touch) await page.locator('#actionB').tap();
      else await page.keyboard.press('Escape');
      await save(page);
      await setFixture(page, 'door');
      await page.reload();
      await page.locator('#continueGame').click();
      await expect(page.locator('#pauseButton')).toBeVisible();
      if (viewport.touch) await page.locator('#actionB').tap();
      else await page.keyboard.press('e');
      await expect(page.locator('#toast')).toHaveText('Door opened');
      await expect.poll(async () => (await readRecord(page)).structures.find(piece => piece.kind === 'door')?.open).toBe(true);
      await page.reload();
      await page.locator('#continueGame').click();
      await expect(page.locator('#pauseButton')).toBeVisible();
      if (viewport.touch) await page.locator('#actionB').tap();
      else await page.keyboard.press('e');
      await expect(page.locator('#toast')).toHaveText('Door closed');
      await expect.poll(async () => (await readRecord(page)).structures.find(piece => piece.kind === 'door')?.open).toBe(false);
      expect(errors).toEqual([]);
    });
  });
}

test('climbs fixture-built stairs and renders a roof after reloading', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /shader|webglprogram/i.test(message.text())) errors.push(message.text());
  });
  await page.goto('./');
  await page.locator('#newGame').click();
  await save(page);
  const start = await page.evaluate(() => new Promise<{ x: number; z: number; y: number }>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('saves', 'readwrite');
      const store = tx.objectStore('saves');
      const get = store.get('primary');
      let start: { x: number; z: number; y: number };
      get.onsuccess = () => {
        const data = get.result;
        const x = Math.round(data.player.x / 2) * 2;
        const z = Math.round(data.player.z / 2) * 2;
        const y = data.player.y;
        start = { x, z: z + 0.9, y };
        data.player = start;
        data.npc = { x: x + 15, z: z + 15 };
        data.vehicle = { x: x - 15, z: z - 15 };
        data.structures = [
          { id: 'stairs', kind: 'stairs', x, z, y, level: 0, rotation: 2, open: false },
          { id: 'upper', kind: 'floor', x, z: z - 2, y: y + 2.4, level: 1, rotation: 0, open: false },
          { id: 'roof', kind: 'roof', x, z, y, level: 0, rotation: 0, open: false },
        ];
        store.put(data, 'primary');
      };
      tx.oncomplete = () => { db.close(); resolve(start); };
      tx.onerror = () => reject(tx.error);
    };
  }));
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  await page.locator('#pauseButton').click();
  await page.locator('#cameraFollow').uncheck();
  await page.locator('#resumeGame').click();
  await page.keyboard.down('w');
  await page.keyboard.down('d');
  await page.waitForTimeout(500);
  await page.keyboard.up('w');
  await page.keyboard.up('d');
  await save(page);
  const after = await readRecord(page);
  expect(after.player.z).toBeLessThan(start.z - 1);
  expect(after.player.y).toBeGreaterThan(start.y + 1);
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  await save(page);
  expect((await readRecord(page)).player.y).toBeGreaterThan(start.y + 1);
  expect(errors).toEqual([]);
});

test('completes and demolishes a fixture-assisted room with a paid automatic roof', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await page.locator('#newGame').click();
  await save(page);
  await setFixture(page, 'legacy');
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  await page.waitForTimeout(800);
  await page.locator('[data-tool="build"]').click();
  await page.locator('[data-building="wall"]').click();
  let point: { x: number; y: number } | undefined;
  for (const y of [500, 600, 700, 400]) {
    for (const x of [720, 500, 950, 350, 1100]) {
      await page.mouse.move(x, y);
      if (await page.locator('#placementStatus').innerText() === 'Ready to place') { point = { x, y }; break; }
    }
    if (point) break;
  }
  expect(point).toBeDefined();
  const coordinates = await page.locator('#placementCoordinates').innerText();
  const match = /Grid (-?\d+), (-?\d+) · Level 0 · Elev (-?[\d.]+)/.exec(coordinates);
  expect(match).not.toBeNull();
  const target = { x: Number(match![1]), z: Number(match![2]), y: Number(match![3]) };
  await page.keyboard.press('Escape');
  await save(page);
  await page.evaluate(target => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('saves', 'readwrite');
      const store = tx.objectStore('saves');
      const get = store.get('primary');
      get.onsuccess = () => {
        const data = get.result;
        const common = { y: target.y, level: 0, open: false };
        data.structures = [
          { ...common, id: 'floor', kind: 'floor', x: target.x, z: target.z - 1, rotation: 0 },
          { ...common, id: 'back', kind: 'wall', x: target.x, z: target.z - 2, rotation: 0 },
          { ...common, id: 'left', kind: 'doorframe', x: target.x - 1, z: target.z - 1, rotation: 1 },
          { ...common, id: 'door', kind: 'door', x: target.x - 1, z: target.z - 1, rotation: 1 },
          { ...common, id: 'right', kind: 'wall', x: target.x + 1, z: target.z - 1, rotation: 1 },
        ];
        store.put(data, 'primary');
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }), target);
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  await page.waitForTimeout(800);
  await page.locator('[data-tool="build"]').click();
  await page.locator('[data-building="wall"]').click();
  await page.mouse.move(point!.x, point!.y);
  await expect(page.locator('#placementCoordinates')).toHaveText(coordinates);
  await expect(page.locator('#placementStatus')).toHaveText('Ready to place');
  await page.locator('#confirmBuild').click();
  await expect(page.locator('#toast')).toHaveText('Room roofed · 2 wood');
  await expect.poll(async () => (await readRecord(page)).structures.filter(piece => piece.kind === 'roof').length).toBe(1);
  expect((await readRecord(page)).resources.wood).toBe(46);
  await page.keyboard.press('Escape');
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  expect((await readRecord(page)).structures.filter(piece => piece.kind === 'roof')).toHaveLength(1);
  await page.waitForTimeout(800);
  await page.locator('[data-tool="build"]').click();
  await page.locator('[data-building="wall"]').click();
  await page.mouse.move(point!.x, point!.y);
  await expect(page.locator('#placementCoordinates')).toHaveText(coordinates);
  await page.locator('#removePiece').click();
  await expect.poll(async () => (await readRecord(page)).structures.filter(piece => piece.kind === 'roof').length).toBe(0);
  expect((await readRecord(page)).resources.wood).toBe(48);
  await page.keyboard.press('Escape');
  await save(page);
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  expect((await readRecord(page)).structures).toHaveLength(5);
});
