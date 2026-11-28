import { expect, test, type Page } from '@playwright/test';
import { walkTo } from './timber-helpers';

function intersects(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

async function minimapHeading(page: Page, direction?: { x: number; z: number }) {
  return page.locator('#minimap').evaluate((canvas, direction) => {
    const { player } = (window as Window & { __newDawnState: () => { player: { yaw: number } } }).__newDawnState();
    const forward = direction ?? { x: Math.sin(player.yaw), z: Math.cos(player.yaw) };
    const context = (canvas as HTMLCanvasElement).getContext('2d')!;
    const image = context.getImageData(72, 72, 36, 36);
    let x = 0, y = 0, count = 0;
    for (let row = 0; row < image.height; row++) for (let col = 0; col < image.width; col++) {
      const offset = (row * image.width + col) * 4;
      if (image.data[offset] >= 230 && image.data[offset + 1] >= 230 && image.data[offset + 2] >= 220) {
        x += col + 72 - 90;
        y += row + 72 - 90;
        count++;
      }
    }
    return { yaw: player.yaw, alignment: count
      ? (x * forward.x - y * forward.z) / (Math.hypot(x, y) * Math.hypot(forward.x, forward.z)) : -1 };
  }, direction);
}

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900, touch: false },
  { name: 'portrait', width: 390, height: 844, touch: true },
  { name: 'landscape', width: 844, height: 390, touch: true },
]) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.touch, isMobile: viewport.touch });

    test('shows missing-save feedback in the main menu', async ({ page }, testInfo) => {
      await page.goto('./');
      if (viewport.touch) await page.locator('#exportSave').tap();
      else await page.locator('#exportSave').click();
      await expect(page.locator('#toast')).toHaveText('No saved world found');
      await page.screenshot({ path: testInfo.outputPath('missing-save.png') });
      const notice = page.locator('.menu-card #panelNotification');
      await expect(notice).toBeVisible();
      await expect(notice).toHaveText('No saved world found');
      await expect(notice).toHaveAttribute('role', 'status');
      const bounds = await notice.boundingBox();
      const button = await page.locator('#exportSave').boundingBox();
      expect(bounds).not.toBeNull();
      expect(button).not.toBeNull();
      expect(intersects(bounds!, button!)).toBe(false);
    });

    test('opens the pack and atlas, and restores the selected tool', async ({ page }, testInfo) => {
      await page.goto('./');
      await page.locator('#newGame').click();
      await expect(page.locator('#pauseButton')).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('gameplay.png') });

      expect(await page.locator('.quickbar > button:not(.hidden)').count()).toBe(2);
      await expect(page.locator('#toolHubButton')).toHaveAttribute('aria-label', 'Open tools, fists selected');
      const activate = async (selector: string) => {
        if (viewport.touch) await page.locator(selector).tap();
        else await page.locator(selector).click();
      };
      await activate('#toolHubButton');
      await expect(page.locator('[data-hub="fists"]')).toHaveAttribute('aria-pressed', 'true');
      await activate('[data-hub="stick"]');
      await expect(page.locator('#toolHubButton')).toHaveAttribute('aria-label', 'Open tools, stick selected');
      expect(await page.locator('#toolHubIcon').innerHTML()).toBe(await page.locator('#weaponIcon').innerHTML());
      await activate('#toolHubButton');
      await expect(page.locator('[data-hub="stick"]')).toHaveAttribute('aria-pressed', 'true');
      await activate('#inventoryButton');
      await expect(page.locator('#craftPanel')).toBeVisible();
      await expect(page.locator('#basicInventory')).toContainText('food 3');
      await expect(page.locator('[data-craft="axe"] svg').first()).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('pack.png') });
      await page.keyboard.press('i');
      await expect(page.locator('#craftPanel')).toBeHidden();
      await page.keyboard.press('i');
      await expect(page.locator('#craftPanel')).toBeVisible();
      await activate('#closeCraft');

      await activate('#minimap');
      await expect(page.locator('#atlasPanel')).toBeVisible();
      await expect(page.locator('#atlasZoom')).toHaveText('1×');
      await activate('#atlasAddMarker');
      await expect(page.locator('.atlas-controls #panelNotification')).toHaveText('Map marker added');
      await page.screenshot({ path: testInfo.outputPath('atlas.png') });
      await activate('#closeAtlas');
      await expect(page.locator('#panelNotification')).toBeHidden();
      await activate('#pauseButton');
      await activate('#saveGame');
      await expect(page.locator('#toast')).toHaveText('World saved');
      await page.reload();
      await activate('#continueGame');
      await expect(page.locator('#toolHubButton')).toHaveAttribute('aria-label', 'Open tools, stick selected');
      await activate('#toolHubButton');
      await expect(page.locator('[data-hub="stick"]')).toHaveAttribute('aria-pressed', 'true');
    });

    test('minimap heading follows the player in both directions', async ({ page }, testInfo) => {
      await page.goto('./');
      await page.locator('#newGame').click();
      await expect(page.locator('#pauseButton')).toBeVisible();
      await page.locator('#pauseButton').click();
      await page.locator('#cameraFollow').uncheck();
      await page.locator('#resumeGame').click();
      const joystick = viewport.touch ? await page.locator('#joystick').boundingBox() : null;
      const touch = viewport.touch ? await page.context().newCDPSession(page) : null;
      if (viewport.touch) expect(joystick).not.toBeNull();
      const walk = async (direction: -1 | 1) => {
        if (joystick && touch) {
          const x = joystick.x + joystick.width / 2;
          const y = joystick.y + joystick.height / 2;
          await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
          await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + direction * 38 }] });
          await page.waitForTimeout(700);
          await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else {
          const key = direction < 0 ? 'w' : 's';
          await page.keyboard.down(key);
          await page.waitForTimeout(700);
          await page.keyboard.up(key);
        }
      };
      await walk(-1);
      await expect.poll(async () => (await minimapHeading(page)).alignment).toBeGreaterThan(0.8);
      const first = await minimapHeading(page);
      await walk(1);
      await expect.poll(async () => (await minimapHeading(page)).alignment).toBeGreaterThan(0.8);
      const second = await minimapHeading(page);
      expect(Math.abs(Math.atan2(Math.sin(second.yaw - first.yaw), Math.cos(second.yaw - first.yaw)))).toBeGreaterThan(2);
      await page.screenshot({ path: testInfo.outputPath('minimap-heading.png') });
      const activate = async (selector: string) => {
        if (viewport.touch) await page.locator(selector).tap();
        else await page.locator(selector).click();
      };
      await activate('#pauseButton');
      await activate('#saveGame');
      await expect(page.locator('#toast')).toHaveText('World saved');
      await page.reload();
      await activate('#continueGame');
      await expect.poll(async () => (await minimapHeading(page)).alignment).toBeGreaterThan(0.8);
      await activate('#minimap');
      await expect(page.locator('#atlasPanel')).toBeVisible();
    });

    test('shows crafting and save feedback without covering gameplay or menu controls', async ({ page }, testInfo) => {
      await page.goto('./');
      await page.locator('#newGame').click();
      const activate = async (selector: string) => {
        if (viewport.touch) await page.locator(selector).tap();
        else await page.locator(selector).click();
      };
      await activate('#toolHubButton');
      await activate('#inventoryButton');
      await activate('[data-craft="axe"]');
      await expect(page.locator('#toast')).toHaveText('Not enough resources');
      await page.screenshot({ path: testInfo.outputPath('craft-feedback.png') });

      const notice = page.locator('#panelNotification');
      await expect(notice).toBeVisible();
      await expect(notice).toHaveText('Not enough resources');
      await expect(notice).toHaveAttribute('role', 'status');
      await expect(notice).toHaveAttribute('aria-live', 'polite');
      const bounds = await notice.boundingBox();
      const close = await page.locator('#closeCraft').boundingBox();
      const craft = await page.locator('[data-craft="axe"]').boundingBox();
      expect(bounds).not.toBeNull();
      expect(close).not.toBeNull();
      expect(craft).not.toBeNull();
      expect(intersects(bounds!, close!)).toBe(false);
      expect(intersects(bounds!, craft!)).toBe(false);
      await expect(page.locator('#toast')).toBeHidden();

      await activate('#closeCraft');
      await activate('#pauseButton');
      await expect(notice).toBeHidden();
      await activate('#saveGame');
      await expect(page.locator('#toast')).toHaveText('World saved');
      await expect(notice).toBeVisible();
      await expect(notice).toHaveText('World saved');
      const savedNotice = await notice.boundingBox();
      const saveButton = await page.locator('#saveGame').boundingBox();
      expect(savedNotice).not.toBeNull();
      expect(saveButton).not.toBeNull();
      expect(intersects(savedNotice!, saveButton!)).toBe(false);
      await page.screenshot({ path: testInfo.outputPath('save-feedback.png') });
      await activate('#resumeGame');
      await expect(page.locator('#toast')).toBeVisible();
      const toast = await page.locator('#toast').boundingBox();
      const minimap = await page.locator('#minimap').boundingBox();
      expect(toast).not.toBeNull();
      expect(minimap).not.toBeNull();
      expect(toast!.y).toBeGreaterThanOrEqual(minimap!.y + minimap!.height);
      expect(toast!.x + toast!.width).toBeLessThan(viewport.width * 0.5);
      await page.screenshot({ path: testInfo.outputPath('gameplay-feedback.png') });
      await page.reload();
      await activate('#continueGame');
      await expect(page.locator('#pauseButton')).toBeVisible();
    });

    test('keeps a long save error readable and preserves the previous save', async ({ page }, testInfo) => {
      await page.goto('./');
      await page.locator('#newGame').click();
      const activate = async (selector: string) => {
        if (viewport.touch) await page.locator(selector).tap();
        else await page.locator(selector).click();
      };
      await activate('#pauseButton');
      await activate('#saveGame');
      await expect(page.locator('#panelNotification')).toHaveText('World saved');
      await page.evaluate(() => {
        indexedDB.open = () => { throw new DOMException('Storage blocked for test', 'SecurityError'); };
      });
      await activate('#saveGame');
      const notice = page.locator('#panelNotification');
      await expect(notice).toHaveText('Could not save world. Check browser storage and console.');
      await expect(notice).toBeVisible();
      const noticeBox = await notice.boundingBox();
      const panelBox = await page.locator('#pausePanel').boundingBox();
      const saveBox = await page.locator('#saveGame').boundingBox();
      expect(noticeBox).not.toBeNull();
      expect(panelBox).not.toBeNull();
      expect(saveBox).not.toBeNull();
      expect(noticeBox!.y).toBeGreaterThanOrEqual(panelBox!.y);
      expect(noticeBox!.y + noticeBox!.height).toBeLessThanOrEqual(panelBox!.y + panelBox!.height);
      expect(intersects(noticeBox!, saveBox!)).toBe(false);
      await page.screenshot({ path: testInfo.outputPath('save-error.png') });
      await page.reload();
      await activate('#continueGame');
      await expect(page.locator('#pauseButton')).toBeVisible();
    });
  });
}

test('minimap places northern terrain and wildlife above the player', async ({ page }) => {
  await page.goto('./');
  await page.locator('#worldSeed').fill('1847');
  await page.locator('#newGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  const samples = async () => page.locator('#minimap').evaluate(canvas => {
    const state = (window as Window & { __newDawnState: () => {
      player: { x: number; z: number };
      wildlife: { id: string; species: string; x: number; z: number }[];
    } }).__newDawnState();
    const context = (canvas as HTMLCanvasElement).getContext('2d')!;
    const rowCount = (y: number, color: readonly number[]) => {
      const pixels = context.getImageData(80, y, 20, 1).data;
      return Array.from({ length: 20 }, (_, index) =>
        color.every((channel, i) => pixels[index * 4 + i] === channel)).filter(Boolean).length;
    };
    const animal = state.wildlife.find(candidate => candidate.species !== 'wolf'
      && candidate.z - state.player.z > 8 && candidate.z - state.player.z < 30
      && Math.abs(candidate.x - state.player.x) < 30
      && !state.wildlife.some(other => other.id !== candidate.id
        && Math.abs(other.x - candidate.x) < 3
        && Math.abs(other.z - candidate.z) < 3));
    let animalAbove = false;
    if (animal) {
      const x = Math.round(90 + (animal.x - state.player.x) * 1.7);
      const y = Math.round(90 - (animal.z - state.player.z) * 1.7);
      const pixels = context.getImageData(x - 2, y - 2, 7, 7).data;
      animalAbove = Array.from({ length: 49 }, (_, index) =>
        pixels[index * 4] === 242 && pixels[index * 4 + 1] === 228 && pixels[index * 4 + 2] === 165).some(Boolean);
    }
    return { northernLand: rowCount(41, [114, 168, 93]), southernWater: rowCount(150, [78, 157, 170]),
      foundAnimal: Boolean(animal), animalAbove };
  });
  await expect.poll(async () => (await samples()).northernLand).toBeGreaterThan(10);
  await expect.poll(async () => (await samples()).southernWater).toBeGreaterThan(10);
  await expect.poll(async () => (await samples()).foundAnimal).toBe(true);
  await expect.poll(async () => (await samples()).animalAbove).toBe(true);
});

test('minimap heading follows the rover and returns to the player on exit', async ({ page }) => {
  await page.goto('./');
  await page.locator('#newGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  await page.locator('#pauseButton').click();
  await page.locator('#cameraFollow').uncheck();
  await page.locator('#resumeGame').click();
  const player = () => page.evaluate(() => (window as Window & {
    __newDawnState: () => { player: { x: number; z: number } }
  }).__newDawnState().player);
  const spawn = await player();
  await walkTo(page, { x: spawn.x + 7, z: spawn.z - 1 });
  await page.keyboard.press('e');
  await expect(page.locator('#vehicleIndicator')).toBeVisible();
  await page.keyboard.down('w');
  await page.keyboard.down('d');
  await page.waitForTimeout(600);
  await page.keyboard.up('d');
  await page.waitForTimeout(300);
  const start = await player();
  await page.waitForTimeout(500);
  const end = await player();
  await page.keyboard.up('w');
  const direction = { x: end.x - start.x, z: end.z - start.z };
  expect(Math.hypot(direction.x, direction.z)).toBeGreaterThan(0.25);
  await expect.poll(async () => (await minimapHeading(page, direction)).alignment).toBeGreaterThan(0.8);
  await expect.poll(() => page.evaluate(() => Math.abs((window as Window & {
    __newDawnState: () => { vehicle: { speed: number } }
  }).__newDawnState().vehicle.speed))).toBeLessThanOrEqual(0.3);
  await page.keyboard.press('e');
  await expect(page.locator('#vehicleIndicator')).toBeHidden();
  await expect.poll(async () => (await minimapHeading(page)).alignment).toBeGreaterThan(0.8);
  const rover = () => page.evaluate(() => (window as Window & {
    __newDawnState: () => { vehicle: { x: number; z: number; yaw: number } }
  }).__newDawnState().vehicle);
  const parked = await rover();
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  const restored = await rover();
  expect(Math.hypot(restored.x - parked.x, restored.z - parked.z)).toBeLessThan(0.01);
  expect(Math.atan2(Math.sin(restored.yaw - parked.yaw), Math.cos(restored.yaw - parked.yaw))).toBeCloseTo(0, 3);
});

test('shows performance feedback inside the active monitor', async ({ page }) => {
  await page.goto('./');
  await page.locator('#newGame').click();
  await page.locator('#pauseButton').click();
  const notice = page.locator('#panelNotification');
  await page.locator('#showPerformance').click();
  await page.locator('#startBenchmark').click();
  await expect(notice).toHaveText('Resume gameplay before starting the test');
  await expect(page.locator('#performanceMonitor').locator('#panelNotification')).toBeVisible();
  await expect(page.locator('#toast')).toBeHidden();
  await page.locator('#hidePerformance').click();
  await expect(notice).toBeHidden();
});

test('opening the full atlas does not stream distant trees', async ({ page }) => {
  await page.goto('./');
  await page.locator('#newGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  const result = await page.evaluate(() => {
    const snapshot = (window as Window & { __newDawnState: () => { trees: { id: string }[] } }).__newDawnState;
    const before = snapshot().trees.map(tree => tree.id).sort();
    const open = () => {
      const start = performance.now();
      document.querySelector<HTMLElement>('#minimap')!.click();
      return performance.now() - start;
    };
    const first = open();
    const after = snapshot().trees.map(tree => tree.id).sort();
    document.querySelector<HTMLButtonElement>('#closeAtlas')!.click();
    const cached = open();
    return { before, after, first, cached };
  });
  expect(result.after).toEqual(result.before);
  console.log(`Atlas synchronous open: cold ${result.first.toFixed(1)} ms, cached ${result.cached.toFixed(1)} ms`);
});
