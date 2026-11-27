import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { weatherForDay } from '../src/calendar';
import { geographicToPlanetPosition } from '../src/planet';
import { biomeAt, terrainHeight } from '../src/world';

test('captures deterministic gameplay environments for visual review', async ({ page }) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) errors.push(message.text());
  });
  const seed = 1847;
  const dayFor = (weather: 'Clear' | 'Rain' | 'Cloudy') => {
    for (let day = 1; day <= 21; day++) if (weatherForDay(day, seed) === weather) return day;
    throw new Error(`No ${weather} day for fixture`);
  };
  let desert: { x: number; z: number } | undefined;
  for (let latitude = -30; latitude <= 30 && !desert; latitude += 5) {
    for (let longitude = -180; longitude < 180 && !desert; longitude += 5) {
      const point = geographicToPlanetPosition(latitude, longitude);
      if (biomeAt(point.x, point.z, seed) === 'desert' && terrainHeight(point.x, point.z, seed) > 1) desert = point;
    }
  }
  expect(desert).toBeDefined();
  let coast: { x: number; z: number } | undefined;
  for (let z = -45; z <= 45 && !coast; z++) {
    for (let x = -45; x <= 45 && !coast; x++) {
      const height = terrainHeight(x, z, seed);
      if (height > 0.2 && height < 0.5 && terrainHeight(x + 4, z + 4, seed) < -0.15) coast = { x, z };
    }
  }
  expect(coast).toBeDefined();
  let snow: { x: number; z: number } | undefined;
  for (let latitude = 60; latitude <= 88 && !snow; latitude += 2) {
    for (let longitude = -180; longitude < 180 && !snow; longitude += 5) {
      const point = geographicToPlanetPosition(latitude, longitude);
      if (biomeAt(point.x, point.z, seed) === 'snow' && terrainHeight(point.x, point.z, seed) > 1) snow = point;
    }
  }
  expect(snow).toBeDefined();
  const polarSummerDay = Array.from({ length: 92 }, (_, index) => 173 + index)
    .find(day => weatherForDay(day, seed) === 'Clear');
  expect(polarSummerDay).toBeDefined();
  const scenes = [
    { name: 'daylight', point: { x: 0, z: 0 }, minute: 720, day: dayFor('Clear') },
    { name: 'forest', point: { x: 14, z: 10 }, minute: 720, day: dayFor('Clear') },
    { name: 'desert', point: desert!, minute: 720, day: dayFor('Clear') },
    { name: 'snow', point: snow!, minute: 720, day: polarSummerDay! },
    { name: 'coast', point: coast!, minute: 720, day: dayFor('Clear') },
    { name: 'sunrise', point: { x: 0, z: 0 }, minute: 375, day: dayFor('Clear') },
    { name: 'sunset', point: { x: 0, z: 0 }, minute: 1065, day: dayFor('Clear') },
    { name: 'rain', point: { x: 0, z: 0 }, minute: 720, day: dayFor('Rain') },
    { name: 'night', point: { x: 0, z: 0 }, minute: 0, day: dayFor('Clear') },
  ];
  const selected = process.env.VISUAL_SCENE;
  if (selected && !scenes.some(scene => scene.name === selected)) throw new Error(`Unknown visual scene: ${selected}`);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('./');
  await page.locator('#newGame').click();
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  const directory = join(process.cwd(), 'art-review', 'batch-005d-a', process.env.VISUAL_PASS ?? 'after');
  await mkdir(directory, { recursive: true });

  for (const scene of scenes.filter(scene => !selected || scene.name === selected)) {
    await page.evaluate(async ({ point, minute, day, seed }) => {
      const { terrainHeight } = await import('/NewDawn/src/world.ts');
      return new Promise<void>((resolve, reject) => {
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
          const y = terrainHeight(point.x, point.z, seed);
          data.player = { ...point, y };
          data.vehicle = { x: point.x + 40, z: point.z + 40 };
          data.npc = { x: point.x + 50, z: point.z + 50 };
          data.wildlife = [];
          data.buildings = [];
          data.structures = [];
          data.roads = [];
          data.terrain = {};
          data.calendar = { minute, day, speed: 0.5 };
          store.put(data, 'primary');
        };
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      };
      });
    }, { ...scene, point: scene.point, seed });
    await page.reload();
    await page.locator('#continueGame').click();
    await expect(page.locator('#pauseButton')).toBeVisible();
    await expect.poll(async () => page.evaluate(() => (window as Window & {
      __newDawnState: () => { terrainReady: boolean }
    }).__newDawnState().terrainReady), { timeout: 30000 }).toBe(true);
    if (scene.name === 'daylight' || scene.name === 'forest') {
      await expect.poll(async () => page.evaluate(() => {
        const state = (window as Window & { __newDawnState: () => {
          trees: Array<{ authored: boolean }>; groundArt: { grass: number; shrubs: number }
        } }).__newDawnState();
        return state.trees.some(tree => tree.authored) && state.groundArt.grass > 0 && state.groundArt.shrubs > 0;
      }), { timeout: 30000 }).toBe(true);
    }
    if (scene.name === 'forest' && process.env.VISUAL_MATURE === '1') {
      await expect.poll(async () => page.evaluate(() => (window as Window & { __newDawnState: () => {
        trees: Array<{ variant?: string }>
      } }).__newDawnState().trees.some(tree => tree.variant === 'mature')), { timeout: 30000 }).toBe(true);
    }
    if (scene.name === 'snow') {
      await expect.poll(async () => page.evaluate(() => {
        const trees = (window as Window & { __newDawnState: () => {
          trees: Array<{ species: string; authored: boolean }>
        } }).__newDawnState().trees;
        return ['pine', 'spruce'].every(species => trees.some(tree => tree.species === species && tree.authored));
      }), { timeout: 30000 }).toBe(true);
    }
    await page.waitForTimeout(process.env.VISUAL_MATURE === '1' ? 5000 : 1000);
    await page.mouse.move(600, 350);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(600, 250);
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(directory, `${scene.name}.png`) });
    if (scene.name === 'forest') {
      const clip = { x: 300, y: 120, width: 400, height: 250 };
      const first = await page.screenshot({ clip, path: join(directory, 'forest-wind-1.png') });
      await page.waitForTimeout(1500);
      const second = await page.screenshot({ clip, path: join(directory, 'forest-wind-2.png') });
      expect(second.equals(first), 'forest canopy pixels should change over time').toBe(false);
    }
    if (scene.name === 'coast') {
      const clip = { x: 10, y: 245, width: 120, height: 110 };
      const first = await page.screenshot({ clip });
      await page.waitForTimeout(1000);
      const second = await page.screenshot({ clip });
      expect(second.equals(first), 'water pixels should change over time').toBe(false);
      await page.screenshot({ path: join(directory, 'coast-motion.png') });
    }
    if (scene.name === 'daylight') {
      const performance = await page.evaluate(async () => {
        const samples = await new Promise<{ frames: number; elapsed: number }>(resolve => {
          let frames = 0;
          const start = window.performance.now();
          const frame = (now: number) => {
            frames++;
            if (now - start >= 1500) resolve({ frames, elapsed: now - start });
            else requestAnimationFrame(frame);
          };
          requestAnimationFrame(frame);
        });
        const state = (window as Window & { __newDawnState: () => { rendering: unknown } }).__newDawnState();
        return { ...samples, rendering: state.rendering };
      });
      console.log(`Visual review performance at 1280x720: ${JSON.stringify(performance)}`);
    }
    if (scene.name === 'sunrise' || scene.name === 'sunset' || scene.name === 'rain' || scene.name === 'night') {
      await page.locator('#legacyCamera').evaluate((element: HTMLInputElement) => {
        element.checked = true;
        element.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await page.mouse.move(600, 350);
      await page.mouse.down({ button: 'right' });
      await page.mouse.move(scene.name === 'sunset' ? 470 : 990, 180);
      await page.mouse.up({ button: 'right' });
      await page.waitForTimeout(600);
      await page.screenshot({ path: join(directory, `${scene.name}-sky.png`) });
    }
    if (scene.name === 'daylight') {
      for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
        await page.setViewportSize(viewport);
        await page.waitForTimeout(300);
        await page.screenshot({ path: join(directory, `hud-${viewport.width}x${viewport.height}.png`) });
      }
      await page.setViewportSize({ width: 1280, height: 720 });
    }
  }
  expect(errors).toEqual([]);
});
