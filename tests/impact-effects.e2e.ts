import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

type Point = { x: number; z: number };
type State = { player: Point; trees: Array<Point & { authored: boolean }>;
  deposits: Array<Point & { mineral: string }>; impactEffects: number; lastImpactEffect: string | null;
  groundArt: { stones: number; grass: number; shrubs: number };
  enemies: Array<{ health: number }> };

async function state(page: Page) {
  return page.evaluate(() => (window as Window & { __newDawnState: () => State }).__newDawnState());
}

async function positionAt(page: Page, point: Point) {
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.evaluate(async point => {
    const { World } = await import('/NewDawn/src/world.ts');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('new-dawn', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const record = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const request = db.transaction('saves').objectStore('saves').get('primary');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const world = new World(Number(record.seed));
    record.version = 11;
    delete record.planetPositions;
    record.player = { x: point.x, y: world.heightAt(point.x, point.z), z: point.z };
    record.npc = { x: point.x + 30, z: point.z + 30 };
    record.vehicle = { x: point.x + 35, z: point.z + 35 };
    record.wildlife = [];
    record.tools = ['pickaxe'];
    record.calendar = { minute: 720, day: 1, speed: 0.5 };
    world.dispose();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('saves', 'readwrite');
      tx.objectStore('saves').put(record, 'primary');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, point);
  await page.reload();
  await page.locator('#continueGame').click();
  await expect.poll(async () => {
    const snapshot = await state(page);
    return Math.hypot(snapshot.player.x - point.x, snapshot.player.z - point.z) < 0.5
      && snapshot.trees.some(tree => tree.authored)
      && snapshot.groundArt.stones > 0 && snapshot.groundArt.grass > 0 && snapshot.groundArt.shrubs > 0;
  }, { timeout: 30000 }).toBe(true);
}

test('real wood, stone and combat contacts emit bounded material effects', async ({ page }) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('./');
  await page.locator('#newGame').click();
  await expect.poll(async () => (await state(page)).trees.some(tree => tree.authored), { timeout: 30000 }).toBe(true);
  const initial = await state(page);
  const tree = initial.trees.find(item => item.authored)!;
  const deposit = initial.deposits.find(item => item.mineral === 'stone') ?? initial.deposits[0];
  expect(deposit).toBeDefined();
  const directory = join(process.cwd(), 'art-review', 'batch-005d-a3', 'impacts');
  await mkdir(directory, { recursive: true });

  await positionAt(page, { x: tree.x + 1, z: tree.z + 0.5 });
  await page.keyboard.press('Space');
  await expect.poll(async () => (await state(page)).lastImpactEffect).toBe('wood');
  expect((await state(page)).impactEffects).toBeGreaterThan(0);
  await page.screenshot({ path: join(directory, 'wood.png') });

  await positionAt(page, { x: deposit.x + 1, z: deposit.z + 0.5 });
  await page.keyboard.press('Space');
  await expect.poll(async () => (await state(page)).lastImpactEffect).toBe('stone');
  expect((await state(page)).impactEffects).toBeGreaterThan(0);
  await page.screenshot({ path: join(directory, 'stone.png') });

  await page.waitForTimeout(1000);
  await page.evaluate(() => {
    const win = window as Window & { __newDawnState: () => State; __newDawnSpawnEnemy: (kind: string, x: number, z: number) => void };
    const player = win.__newDawnState().player;
    win.__newDawnSpawnEnemy('raider', player.x + 1.5, player.z);
  });
  const health = (await state(page)).enemies[0].health;
  await page.keyboard.press('Space');
  await expect.poll(async () => (await state(page)).lastImpactEffect).toBe('damage');
  expect((await state(page)).enemies[0].health).toBeLessThan(health);
  expect((await state(page)).impactEffects).toBeGreaterThan(0);
  await page.screenshot({ path: join(directory, 'combat.png') });
  expect(errors).toEqual([]);
});
