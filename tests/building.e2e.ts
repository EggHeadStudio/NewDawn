import { test, expect, type Page } from '@playwright/test';

const viewports = [
  { name: 'portrait', width: 390, height: 844, touch: true },
  { name: 'landscape', width: 844, height: 390, touch: true },
  { name: 'tablet', width: 1024, height: 768, touch: true },
  { name: 'desktop', width: 1440, height: 900, touch: false },
];

async function save(page: Page) {
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.locator('#resumeGame').click();
}

async function readSave(page: Page) {
  return page.evaluate(() => new Promise<{
    resources: { wood: number; stone: number };
    buildings: Array<{ kind: string; x: number; z: number; rotation: number }>;
    player: { x: number; z: number };
    vehicle: { x: number; z: number };
    npc: { x: number; z: number };
    npcState: { recruited: boolean; job: string };
    terrain: Record<string, number>;
    wildlife: Array<{ species: string }>;
    calendar: { minute: number };
    appearance: { hair: string; facialHair: string; hat: string; clothing: string };
    playerName: string;
  }>((resolve, reject) => {
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

test('new survivor cosmetics render and survive save and continue', async ({ page }) => {
  await page.goto('./');
  await page.locator('#playerName').fill('Aino');
  await page.locator('#customizeCharacter').click();
  const before = await page.locator('#characterPreview').screenshot();
  await page.locator('#appearance-hair').selectOption('braided');
  await page.locator('#appearance-facialHair').selectOption('braided');
  await page.locator('#appearance-hat').selectOption('helmet');
  await page.locator('#appearance-clothing').selectOption('fur');
  await page.waitForTimeout(100);
  expect((await page.locator('#characterPreview').screenshot()).equals(before)).toBe(false);
  await page.locator('#finishCharacter').click();
  await page.locator('#newGame').click();
  await save(page);
  expect(await readSave(page)).toMatchObject({
    playerName: 'Aino',
    appearance: { hair: 'braided', facialHair: 'braided', hat: 'helmet', clothing: 'fur' },
  });
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#survivorLabel')).toHaveText('Aino');
  await save(page);
  expect((await readSave(page)).appearance).toMatchObject({ hair: 'braided', facialHair: 'braided', hat: 'helmet', clothing: 'fur' });
});

async function setScenario(page: Page, scenario: 'npc' | 'vehicle' | 'combat') {
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
        data.version = 11;
        delete data.planetPositions;
        if (scenario === 'npc') {
          data.resources.wood = 10;
          data.resources.stone = 10;
          data.player.x = data.npc.x + 1;
          data.player.z = data.npc.z;
        } else if (scenario === 'vehicle') {
          data.player.x = data.vehicle.x - 1;
          data.player.z = data.vehicle.z;
        } else {
          data.player.x = 0;
          data.player.z = 0;
          data.calendar.minute = 1300;
          data.wildlife = [{ id: 'wolf-0', species: 'wolf', x: 1, z: 0, homeX: 1, homeZ: 0, heading: 0, health: 1, behavior: 'rest', decisionTimer: 10, attackTimer: 100, decisions: 0 }];
        }
        store.put(data, 'primary');
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    };
  }), scenario);
}

async function giveResources(page: Page) {
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
        data.resources.wood = 20;
        data.resources.stone = 20;
        store.put(data, 'primary');
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    };
  }));
}

async function aim(page: Page, touch: boolean, x: number, y: number) {
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.move(x, y);
  await page.waitForTimeout(80);
}

for (const viewport of viewports) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.touch, isMobile: viewport.touch });

    test('places, rejects overlaps, cancels and restores a building', async ({ page }) => {
      await page.goto('./');
      await page.locator('#customizeCharacter').click();
      await expect(page.locator('#characterPanel')).toBeVisible();
      await page.locator('#finishCharacter').click();
      await page.locator('#newGame').click();
      await expect(page.locator('#pauseButton')).toBeVisible();
      await save(page);
      await giveResources(page);
      await page.reload();
      await page.locator('#continueGame').click();
      await expect(page.locator('#survivorLabel')).toHaveText('Survivor');

      await page.locator('#inventoryButton').click();
      await expect(page.locator('#craftPanel')).toBeVisible();
      const craft = await page.locator('#craftPanel').boundingBox();
      expect(craft!.x >= 0 && craft!.y >= 0 && craft!.x + craft!.width <= viewport.width && craft!.y + craft!.height <= viewport.height).toBeTruthy();
      await page.locator('#closeCraft').click();
      await page.locator('#pauseButton').click();
      await expect(page.locator('#cameraDistance')).toBeVisible();
      await page.locator('#resumeGame').click();
      await page.locator('#minimap').click();
      await expect(page.locator('#atlasPanel')).toBeVisible();
      await page.locator('#closeAtlas').click();

      await page.locator('[data-tool="build"]').click();
      await expect(page.locator('#buildPanel')).toBeVisible();
      await page.locator('[data-building="shelter"]').click();
      await expect(page.locator('#buildPanel')).toBeHidden();
      await expect(page.locator('#placementToolbar')).toBeVisible();
      await expect(page.locator('#placementName')).toContainText('Shelter');
      if (!viewport.touch) {
        const zoom = Number(await page.locator('#cameraDistance').inputValue());
        await page.mouse.move(400, 450);
        await page.mouse.wheel(0, -100);
        await expect.poll(async () => Number(await page.locator('#cameraDistance').inputValue())).toBeLessThan(zoom);
      }
      await page.locator('#changeBuild').click();
      await expect(page.locator('#buildPanel')).toBeVisible();
      await page.locator('[data-building="shelter"]').click();
      expect((await readSave(page)).buildings).toHaveLength(0);
      const toolbar = await page.locator('#placementToolbar').boundingBox();
      expect(toolbar).not.toBeNull();
      expect(toolbar!.x + toolbar!.width <= viewport.width && toolbar!.y + toolbar!.height <= viewport.height).toBeTruthy();
      expect(toolbar!.x > viewport.width / 2 || toolbar!.y > viewport.height / 2
        || toolbar!.x + toolbar!.width < viewport.width / 2 || toolbar!.y + toolbar!.height < viewport.height / 2).toBeTruthy();

      const initialGrid = await page.locator('#placementCoordinates').innerText();
      let point: { x: number; y: number } | undefined;
      for (const y of [0.55, 0.65, 0.75, 0.45]) {
        for (const x of [0.5, 0.35, 0.65, 0.25, 0.75]) {
          const candidate = { x: Math.round(viewport.width * x), y: Math.round(viewport.height * y) };
          await aim(page, viewport.touch, candidate.x, candidate.y);
          if (await page.locator('#placementStatus').innerText() === 'Ready to place') { point = candidate; break; }
        }
        if (point) break;
      }
      expect(point, 'a visible, valid terrain target').toBeDefined();
      expect(await page.locator('#placementCoordinates').innerText()).not.toBe(initialGrid);
      await page.locator('#rotateBuild').click();
      expect((await readSave(page)).buildings).toHaveLength(0);
      if (viewport.touch) await page.locator('#actionA').tap();
      else await page.mouse.click(point!.x, point!.y);
      await expect(page.locator('#toast')).toHaveText('Shelter constructed');
      await expect(page.locator('#placementStatus')).toHaveText('Too close to another building');
      await expect.poll(async () => (await readSave(page)).buildings.length).toBe(1);
      const placed = await readSave(page);
      expect(placed.resources).toMatchObject({ wood: 12, stone: 16 });
      expect(placed.buildings[0].rotation).toBeCloseTo(Math.PI / 2);
      if (viewport.touch) await page.locator('#actionA').tap();
      else await page.locator('#confirmBuild').click();
      await expect(page.locator('#toast')).toHaveText('Too close to another building');
      expect((await readSave(page)).buildings).toHaveLength(1);
      if (viewport.touch) await page.locator('#actionB').tap();
      else {
        await page.mouse.move(400, 450);
        await page.mouse.down({ button: 'right' });
        await page.mouse.move(445, 470, { steps: 4 });
        await page.mouse.up({ button: 'right' });
        await expect(page.locator('#placementToolbar')).toBeVisible();
        await page.mouse.click(445, 470, { button: 'right' });
      }
      await expect(page.locator('#placementToolbar')).toBeHidden();
      await expect(page.locator('[data-tool="build"]')).toBeVisible();
      if (!viewport.touch) {
        await page.locator('[data-tool="build"]').click();
        await page.locator('[data-building="lamp"]').click();
        await page.keyboard.press('Escape');
        await expect(page.locator('#placementToolbar')).toBeHidden();
      }
      await save(page);
      await page.reload();
      await page.locator('#continueGame').click();
      await expect(page.locator('#survivorLabel')).toHaveText('Survivor');
      expect((await readSave(page)).buildings).toEqual(placed.buildings);
      await expect(page.locator('#resources')).toContainText('12');
    });
  });
}

test('keyboard selection and Space place a building', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await page.locator('#newGame').click();
  await save(page);
  await giveResources(page);
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  await page.keyboard.press('b');
  await page.locator('[data-building="shelter"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#buildPanel')).toBeHidden();
  let valid = false;
  for (const y of [500, 600, 700, 400]) {
    for (const x of [720, 500, 950, 350, 1100]) {
      await page.mouse.move(x, y);
      if (await page.locator('#placementStatus').innerText() === 'Ready to place') { valid = true; break; }
    }
    if (valid) break;
  }
  expect(valid).toBeTruthy();
  await page.keyboard.press('Space');
  await expect(page.locator('#toast')).toHaveText('Shelter constructed');
  await expect.poll(async () => (await readSave(page)).buildings.length).toBe(1);
});

test('the placement ghost is actually rendered in the world', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('./');
  await page.locator('#newGame').click();
  await save(page);
  await giveResources(page);
  await page.reload();
  await page.locator('#continueGame').click();
  await page.locator('[data-tool="build"]').click();
  await page.locator('[data-building="shelter"]').click();
  let valid = false;
  for (const y of [230, 270, 310, 190]) {
    for (const x of [420, 300, 540, 220, 620]) {
      await page.mouse.move(x, y);
      if (await page.locator('#placementStatus').innerText() === 'Ready to place') { valid = true; break; }
    }
    if (valid) break;
  }
  expect(valid).toBeTruthy();
  await page.waitForTimeout(1000);
  await page.addStyleTag({ content: '#hud, #placementToolbar, #buildPanel, #toast { visibility: hidden !important }' });
  const withGhost = await page.screenshot();
  await page.evaluate(() => document.querySelector<HTMLButtonElement>('#changeBuild')!.click());
  await page.waitForTimeout(150);
  const withoutGhost = await page.screenshot();
  const changedPixels = await page.evaluate(async ([first, second]) => {
    const pixels = async (data: string) => {
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, image.width, image.height).data;
    };
    const a = await pixels(first);
    const b = await pixels(second);
    let changed = 0;
    for (let i = 0; i < a.length; i += 4) {
      if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 75) changed++;
    }
    return changed;
  }, [withGhost.toString('base64'), withoutGhost.toString('base64')]);
  expect(changedPixels).toBeGreaterThan(500);
});

test.describe('touch camera gestures', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

  test('pinches and orbits during placement without constructing', async ({ page }) => {
    await page.goto('./');
    await page.locator('#newGame').click();
    await save(page);
    await page.locator('[data-tool="build"]').tap();
    await page.locator('[data-building="shelter"]').tap();
    const before = Number(await page.locator('#cameraDistance').inputValue());
    const cdp = await page.context().newCDPSession(page);
    const first = { x: 250, y: 190, id: 1 };
    const second = { x: 350, y: 190, id: 2 };
    const initialGrid = await page.locator('#placementCoordinates').innerText();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...first, x: 300, y: 210 }] });
    await expect(page.locator('#placementCoordinates')).not.toHaveText(initialGrid);
    first.x = 300;
    first.y = 210;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [first, second] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [first, { ...second, x: 440, y: 215 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    await page.waitForTimeout(300);
    expect(Number(await page.locator('#cameraDistance').inputValue())).toBeLessThan(before);
    await expect(page.locator('#placementToolbar')).toBeVisible();
    let foundUnaffordable = false;
    for (const y of [210, 250, 290, 170]) {
      for (const x of [400, 300, 500, 200]) {
        await page.touchscreen.tap(x, y);
        if (await page.locator('#placementStatus').innerText() === 'Not enough resources') { foundUnaffordable = true; break; }
      }
      if (foundUnaffordable) break;
    }
    expect(foundUnaffordable).toBeTruthy();
    await page.locator('#actionA').tap();
    await expect(page.locator('#toast')).toHaveText('Not enough resources');
    expect((await readSave(page)).buildings).toHaveLength(0);
    await page.locator('#actionB').tap();
    await expect(page.locator('#placementToolbar')).toBeHidden();
  });

  test('menus and existing gameplay remain usable', async ({ page }) => {
    await page.goto('./');
    await page.locator('#customizeCharacter').click();
    await expect(page.locator('#characterPanel')).toBeVisible();
    await page.locator('#finishCharacter').click();
    await page.locator('#newGame').click();
    await page.keyboard.press('Space');
    await expect(page.locator('#toast')).toContainText('wood');
    await page.keyboard.press('e');
    await expect(page.locator('#toast')).toHaveText('Excavated terrain');
    await save(page);
    const first = await readSave(page);
    expect(first.resources.wood).toBeGreaterThan(0);
    expect(Object.values(first.terrain).some(value => value < 0)).toBeTruthy();

    await setScenario(page, 'npc');
    await page.reload();
    await page.locator('#continueGame').click();
    await page.locator('#inventoryButton').click();
    await expect(page.locator('#craftPanel')).toBeVisible();
    await page.keyboard.press('e');
    await page.locator('[data-craft="axe"]').click();
    await expect(page.locator('#toolStatus')).toContainText('axe');
    await page.keyboard.press('Escape');
    await expect(page.locator('#craftPanel')).toBeHidden();
    await page.keyboard.press('e');
    await expect(page.locator('#npcPanel')).toBeVisible();
    await page.locator('#npcRecruit').click();
    await page.locator('[data-job="wood"]').click();
    await page.locator('#closeNpc').click();
    await page.locator('#minimap').click();
    await expect(page.locator('#atlasPanel')).toBeVisible();
    await page.locator('#closeAtlas').click();
    await save(page);
    const afterNpc = await readSave(page);
    expect(afterNpc.npcState).toMatchObject({ recruited: true, job: 'wood' });
    expect(afterNpc.resources).toMatchObject({ wood: 7, stone: 8 });
    expect(afterNpc.terrain).toEqual(first.terrain);

    await setScenario(page, 'vehicle');
    await page.reload();
    await page.locator('#continueGame').click();
    await expect(page.locator('#pauseButton')).toBeVisible();
    await page.keyboard.press('e');
    await expect(page.locator('#vehicleIndicator')).toBeVisible();
    await page.keyboard.down('w');
    await page.waitForTimeout(900);
    await page.keyboard.up('w');
    await page.keyboard.press('e');
    await expect(page.locator('#vehicleIndicator')).toBeHidden();
    await save(page);
    const afterVehicle = await readSave(page);
    expect(Math.hypot(afterVehicle.vehicle.x - afterNpc.vehicle.x, afterVehicle.vehicle.z - afterNpc.vehicle.z)).toBeGreaterThan(0.1);

    await setScenario(page, 'combat');
    await page.reload();
    await page.locator('#continueGame').click();
    await expect(page.locator('#pauseButton')).toBeVisible();
    await page.keyboard.press('Space');
    await expect(page.locator('#toast')).toHaveText('Wolf driven off');
    await save(page);
    const afterCombat = await readSave(page);
    expect(afterCombat.wildlife).toHaveLength(0);
    expect(afterCombat.calendar.minute).toBeGreaterThanOrEqual(1200);
  });
});
