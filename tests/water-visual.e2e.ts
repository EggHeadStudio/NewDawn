import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { cameraRelativeMovement } from '../src/camera';
import { World } from '../src/world';

test('moving from dry land into water produces a bounded real splash', async ({ page }) => {
  const world = new World(1847);
  const direction = cameraRelativeMovement(0, -1, 0.78);
  let start: { x: number; z: number; y: number } | undefined;
  for (let z = -44; z <= 44 && !start; z += 0.5) {
    for (let x = -44; x <= 44 && !start; x += 0.5) {
      const height = world.heightAt(x, z);
      if (height < 0.45 || height > 0.7) continue;
      const samples = Array.from({ length: 16 }, (_, i) =>
        world.heightAt(x + direction.x * i * 0.2, z + direction.y * i * 0.2));
      if (samples.every(value => value > -0.48) && samples.slice(4).some(value => value < -0.18)) {
        start = { x, z, y: height };
      }
    }
  }
  world.dispose();
  expect(start).toBeDefined();
  await page.goto('./');
  await page.locator('#newGame').click();
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.evaluate(point => new Promise<void>((resolve, reject) => {
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
        data.player = point;
        data.vehicle = { x: point!.x + 40, z: point!.z + 40 };
        data.npc = { x: point!.x + 50, z: point!.z + 50 };
        data.wildlife = [];
        data.structures = [];
        data.buildings = [];
        data.calendar = { minute: 720, day: 1, speed: 0.5 };
        store.put(data, 'primary');
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }), start);
  await page.reload();
  await page.locator('#continueGame').click();
  const state = () => page.evaluate(() => (window as Window & {
    __newDawnState: () => { waterContact: boolean; waterEffects: number };
  }).__newDawnState());
  await page.waitForTimeout(600);
  expect(await state()).toMatchObject({ waterContact: false, waterEffects: 0 });
  await page.keyboard.down('KeyW');
  await expect.poll(async () => (await state()).waterContact, { timeout: 10000 }).toBe(true);
  expect((await state()).waterEffects).toBeGreaterThan(0);
  const directory = join(process.cwd(), 'art-review', 'batch-005d-a', 'after');
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: join(directory, 'water-entry.png') });
  await page.keyboard.up('KeyW');
  await expect.poll(async () => (await state()).waterEffects, { timeout: 5000 }).toBe(0);
});
