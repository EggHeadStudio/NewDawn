import { expect, test, type Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { weatherForDay, type Weather } from '../src/calendar';

type SavedWorld = {
  resources: { wood: number };
  minerals: { coal: number };
  torch?: { crafted: boolean; equipped: boolean; lit: boolean };
  buildings: Array<{ kind: string; id?: string; lit?: boolean; x: number; z: number }>;
  terrain: Record<string, number>;
  player: { x: number; z: number };
  npc: { x: number; z: number };
  vehicle: { x: number; z: number };
  calendar: { minute: number; day: number };
};

async function worldRecord(page: Page, update?: 'resources' | 'night' | 'day') {
  return page.evaluate(update => new Promise<SavedWorld>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('saves', update ? 'readwrite' : 'readonly');
      const store = tx.objectStore('saves');
      const get = store.get('primary');
      let data: SavedWorld;
      get.onsuccess = () => {
        data = get.result;
        if (update === 'resources') {
          data.version = 11;
          delete data.planetPositions;
        }
        if (update === 'resources') {
          data.resources.wood = 30;
          data.minerals.coal = 2;
          data.npc = { x: data.player.x + 30, z: data.player.z + 30 };
          data.vehicle = { x: data.player.x - 30, z: data.player.z - 30 };
          data.calendar.minute = 0;
        } else if (update) data.calendar.minute = update === 'day' ? 720 : 0;
        if (update) store.put(data, 'primary');
      };
      tx.oncomplete = () => { db.close(); resolve(data); };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    };
  }), update);
}

async function save(page: Page) {
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.locator('#resumeGame').click();
}

async function continueWorld(page: Page) {
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
}

async function brightness(page: Page, screenshot: Buffer) {
  return page.evaluate(async data => {
    const image = new Image();
    image.src = `data:image/png;base64,${data}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let total = 0;
    for (let i = 0; i < pixels.length; i += 4) total += 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
    return total / (pixels.length / 4);
  }, screenshot.toString('base64'));
}

test('noon is visibly brighter than midnight in the same scene', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await page.locator('#newGame').click();
  await save(page);
  await worldRecord(page, 'day');
  await continueWorld(page);
  await page.waitForTimeout(1500);
  const day = await page.locator('#game').screenshot();
  await worldRecord(page, 'night');
  await continueWorld(page);
  await page.waitForTimeout(1500);
  const night = await page.locator('#game').screenshot();
  expect(await brightness(page, night)).toBeLessThan((await brightness(page, day)) * 0.65);
  const folder = join('art-review', 'batch-004b-r2');
  await mkdir(folder, { recursive: true });
  const { writeFile } = await import('node:fs/promises');
  await writeFile(join(folder, 'noon.png'), day);
  await writeFile(join(folder, 'clear-night.png'), night);
});

test('shows actual sunrise, sunset and weather-dependent nights', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await page.locator('#newGame').click();
  await save(page);
  const dayFor = (weather: Weather) => {
    const day = Array.from({ length: 112 }, (_, index) => index + 1).find(value => weatherForDay(value, 1847) === weather);
    if (!day) throw new Error(`No day with ${weather} weather`);
    return day;
  };
  const scenarios = [
    { name: 'dawn', day: dayFor('Clear'), minute: 360, weather: 'Clear' },
    { name: 'sunset', day: dayFor('Clear'), minute: 1080, weather: 'Clear' },
    { name: 'cloudy-night', day: dayFor('Cloudy'), minute: 0, weather: 'Cloudy' },
    { name: 'storm-night', day: dayFor('Storm'), minute: 0, weather: 'Storm' },
    { name: 'snow-night', day: dayFor('Snow'), minute: 0, weather: 'Snow' },
  ];
  const folder = join('art-review', 'batch-004b-r2');
  await mkdir(folder, { recursive: true });
  for (const scenario of scenarios) {
    await page.evaluate(({ day, minute }) => new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('new-dawn', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('saves', 'readwrite');
        const store = tx.objectStore('saves');
        const get = store.get('primary');
        get.onsuccess = () => {
          const data = get.result;
          data.calendar.day = day;
          data.calendar.minute = minute;
          store.put(data, 'primary');
        };
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      };
    }), scenario);
    await continueWorld(page);
    await expect(page.locator('#seasonText')).toContainText(scenario.weather.toUpperCase());
    await page.waitForTimeout(1000);
    await page.screenshot({ path: join(folder, `${scenario.name}.png`) });
  }
});

test('places a torch post and lights, extinguishes and reloads it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await page.locator('#newGame').click();
  await save(page);
  await worldRecord(page, 'resources');
  await continueWorld(page);
  await page.locator('#inventoryButton').click();
  await page.locator('#craftTorch').click();
  await page.locator('#equipTorch').click();
  await page.locator('#igniteTorch').click();
  await page.locator('#closeCraft').click();
  const start = await worldRecord(page);
  await page.locator('[data-tool="build"]').click();
  await page.locator('[data-building="torchpost"]').click();
  await page.waitForTimeout(1000);
  const point = await page.evaluate(player => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
    const status = document.querySelector('#placementStatus')!;
    const coordinates = document.querySelector('#placementCoordinates')!;
    for (let y = 180; y < innerHeight - 80; y += 8) for (let x = 120; x < innerWidth - 80; x += 8) {
      if (document.elementFromPoint(x, y) !== canvas) continue;
      canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse', clientX: x, clientY: y }));
      const match = /Grid (-?\d+), (-?\d+)/.exec(coordinates.textContent ?? '');
      if (!match || status.textContent !== 'Ready to place') continue;
      const distance = Math.hypot(Number(match[1]) - player.x, Number(match[2]) - player.z);
      if (distance > 1.1 && distance < 2.3) return { x, y };
    }
    return null;
  }, start.player);
  expect(point, 'No accessible post placement near the survivor').not.toBeNull();
  await page.mouse.move(point!.x, point!.y);
  await page.locator('#confirmBuild').click();
  await expect.poll(async () => (await worldRecord(page)).buildings.filter(building => building.kind === 'torchpost').length).toBe(1);
  await page.locator('#cancelBuild').click();
  const placed = (await worldRecord(page)).buildings.find(building => building.kind === 'torchpost')!;
  expect(Math.hypot(placed.x - start.player.x, placed.z - start.player.z), `Placed post: ${JSON.stringify(placed)}`).toBeLessThan(2.5);
  await expect(page.locator('#controlsHint')).toContainText('Light torch');
  await page.mouse.click(1000, 500);
  await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe('game');
  await expect(page.locator('#controlsHint')).toContainText('MOUSE LOOK ACTIVE');
  await expect(page.locator('#controlsHint')).toContainText('Light torch');
  await page.keyboard.press('e');
  await expect(page.locator('#toast')).toHaveText('Torch post lit');
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => document.pointerLockElement)).toBeNull();
  await save(page);
  const first = (await worldRecord(page)).buildings.find(building => building.kind === 'torchpost')!;
  expect(first.lit).toBe(true);
  expect(first.id).toBeTruthy();
  await continueWorld(page);
  await page.keyboard.press('e');
  await expect(page.locator('#toast')).toHaveText('Torch post extinguished');
  await page.keyboard.press('e');
  await expect(page.locator('#toast')).toHaveText('Torch post lit');
  await save(page);
  const restored = (await worldRecord(page)).buildings.find(building => building.kind === 'torchpost')!;
  expect(restored.id).toBe(first.id);
  expect(restored.lit).toBe(true);
  await page.reload();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportSave').click();
  const exported = JSON.parse(await readFile(await (await downloadPromise).path(), 'utf8')) as SavedWorld;
  expect(exported.torch).toEqual({ crafted: true, equipped: true, lit: true });
  expect(exported.buildings.find(building => building.id === first.id)?.lit).toBe(true);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#importSaveFile').setInputFiles({ name: 'fire-save.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) });
  await expect(page.locator('#toast')).toHaveText('Save imported. Select Continue.');
  await page.locator('#continueGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  const imported = await worldRecord(page);
  expect(imported.torch).toEqual(exported.torch);
  expect(imported.buildings.find(building => building.id === first.id)?.lit).toBe(true);
});

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900, touch: false },
  { name: 'mobile portrait', width: 390, height: 844, touch: true },
  { name: 'mobile landscape', width: 844, height: 390, touch: true },
]) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.touch, isMobile: viewport.touch });
    test('crafts, equips and persists a burning torch without unwanted interaction', async ({ page }) => {
      await page.goto('./');
      await page.locator('#newGame').click();
      await save(page);
      await worldRecord(page, 'resources');
      await continueWorld(page);
      await page.waitForTimeout(1000);
      const before = !viewport.touch ? await page.locator('#game').screenshot() : undefined;
      await page.locator('#inventoryButton').click();
      await page.locator('#craftTorch').click();
      await page.locator('#equipTorch').click();
      await page.locator('#igniteTorch').click();
      await expect(page.locator('#torchStatus')).toContainText('burning');
      await page.locator('#closeCraft').click();
      await page.waitForTimeout(1000);
      if (before) expect(await brightness(page, await page.locator('#game').screenshot())).toBeGreaterThan((await brightness(page, before)) + 1);
      const folder = join('art-review', 'batch-004b-r2');
      await mkdir(folder, { recursive: true });
      await page.screenshot({ path: join(folder, viewport.touch ? `${viewport.name.replace(' ', '-')}-torch.png` : 'held-torch.png') });
      await save(page);
      const crafted = await worldRecord(page);
      expect(crafted.resources.wood).toBe(28);
      expect(crafted.minerals.coal).toBe(1);
      expect(crafted.torch).toEqual({ crafted: true, equipped: true, lit: true });
      await continueWorld(page);
      await page.locator('#inventoryButton').click();
      await expect(page.locator('#torchStatus')).toContainText('burning');
      await page.locator('#equipTorch').click();
      await expect(page.locator('#torchStatus')).toContainText('unequipped');
      await page.locator('#closeCraft').click();
      await save(page);
      expect((await worldRecord(page)).torch).toEqual({ crafted: true, equipped: false, lit: false });
    });

    if (viewport.touch) test('places and lights a post with contextual touch controls', async ({ page }) => {
      test.setTimeout(120000);
      await page.goto('./');
      await page.locator('#newGame').click();
      await save(page);
      await worldRecord(page, 'resources');
      await continueWorld(page);
      await page.locator('#inventoryButton').tap();
      await page.locator('#craftTorch').tap();
      await page.locator('#equipTorch').tap();
      await page.locator('#igniteTorch').tap();
      await page.locator('#closeCraft').tap();
      const start = await worldRecord(page);
      await page.locator('#pauseButton').tap();
      await page.locator('#cameraFollow').uncheck();
      await page.locator('#resumeGame').tap();
      await page.locator('[data-tool="build"]').tap();
      await page.locator('[data-building="torchpost"]').tap();
      let found = false;
      for (const y of [0.45, 0.55, 0.65, 0.35, 0.75]) {
        for (const x of [0.5, 0.35, 0.65, 0.25, 0.75]) {
          await page.touchscreen.tap(Math.round(viewport.width * x), Math.round(viewport.height * y));
          if (await page.locator('#placementStatus').innerText() === 'Ready to place') {
            found = true;
            break;
          }
        }
        if (found) break;
      }
      expect(found, 'No accessible touch placement near the survivor').toBe(true);
      await page.locator('#actionA').tap();
      await expect.poll(async () => (await worldRecord(page)).buildings.some(building => building.kind === 'torchpost')).toBe(true);
      await page.locator('#actionB').tap();
      const post = (await worldRecord(page)).buildings.find(building => building.kind === 'torchpost')!;
      let position = start.player;
      const joystick = await page.locator('#joystick').boundingBox();
      expect(joystick).not.toBeNull();
      const cdp = await page.context().newCDPSession(page);
      for (let attempt = 0; attempt < 40 && Math.hypot(post.x - position.x, post.z - position.z) > 2.2; attempt++) {
        const dx = post.x - position.x;
        const dz = post.z - position.z;
        const sx = dx * Math.cos(0.78) - dz * Math.sin(0.78);
        const sy = dx * Math.sin(0.78) + dz * Math.cos(0.78);
        const length = Math.hypot(sx, sy);
        const origin = { x: joystick!.x + joystick!.width / 2, y: joystick!.y + joystick!.height / 2, id: 1 };
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [origin] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...origin, x: origin.x + sx / length * 35, y: origin.y + sy / length * 35 }] });
        await page.waitForTimeout(180);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await save(page);
        position = (await worldRecord(page)).player;
      }
      await cdp.detach();
      expect(Math.hypot(post.x - position.x, post.z - position.z)).toBeLessThan(2.5);
      await expect(page.locator('#actionB span')).toHaveText('Light torch');
      await page.locator('#actionB').tap();
      await expect(page.locator('#toast')).toHaveText('Torch post lit');
      await expect.poll(async () => (await worldRecord(page)).buildings.find(building => building.kind === 'torchpost')?.lit).toBe(true);
      expect((await worldRecord(page)).terrain).toEqual(start.terrain);
      const folder = join('art-review', 'batch-004b-r2');
      await mkdir(folder, { recursive: true });
      await page.screenshot({ path: join(folder, `${viewport.name.replace(' ', '-')}-post.png`) });
      await continueWorld(page);
      expect((await worldRecord(page)).buildings.find(building => building.kind === 'torchpost')?.lit).toBe(true);
    });
  });
}
