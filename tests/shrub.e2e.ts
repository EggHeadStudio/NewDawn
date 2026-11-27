import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { InstancedMesh, Object3D } from 'three';

type Bush = { id: string; x: number; z: number; authored: boolean };
type State = { bushes: Bush[]; player: { x: number; z: number } };

test('authored berry shrubs gather and stay depleted on reload', async ({ page }) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const state = () => page.evaluate(() => (window as Window & { __newDawnState: () => State }).__newDawnState());
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('./');
  await page.locator('#newGame').click();
  await expect.poll(async () => (await state()).bushes.some(bush => bush.authored), { timeout: 30000 }).toBe(true);
  const bush = (await state()).bushes.find(item => item.authored)!;
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.evaluate(async bush => {
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
    record.player = { x: bush.x, y: world.heightAt(bush.x, bush.z), z: bush.z };
    record.npc = { x: bush.x + 30, z: bush.z + 30 };
    record.vehicle = { x: bush.x + 35, z: bush.z + 35 };
    record.wildlife = [];
    record.calendar = { minute: 720, day: 1, speed: 0.5 };
    world.dispose();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('saves', 'readwrite');
      tx.objectStore('saves').put(record, 'primary');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, bush);
  await page.reload();
  await page.locator('#continueGame').click();
  await expect.poll(async () => {
    const snapshot = await state();
    return Math.hypot(snapshot.player.x - bush.x, snapshot.player.z - bush.z) < 0.5
      && snapshot.bushes.some(item => item.id === bush.id && item.authored);
  }, { timeout: 30000 }).toBe(true);
  const directory = join(process.cwd(), 'art-review', 'batch-005d-a3', 'shrub');
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: join(directory, 'gather-before.png') });
  await page.keyboard.press('Space');
  await expect(page.locator('#toast')).toContainText('food');
  expect((await state()).bushes.some(item => item.id === bush.id)).toBe(false);
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.reload();
  await page.locator('#continueGame').click();
  await expect.poll(async () => {
    const snapshot = await state();
    return Math.hypot(snapshot.player.x - bush.x, snapshot.player.z - bush.z) < 0.5
      && snapshot.bushes.some(item => item.authored);
  }, { timeout: 30000 }).toBe(true);
  expect((await state()).bushes.some(item => item.id === bush.id)).toBe(false);
  expect(errors).toEqual([]);
});

test('authored shrubs follow terrain edits and retain shared assets across streamed revisits', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const { World } = await import('/NewDawn/src/world.ts');
    const isInstancedMesh = (object: Object3D | undefined): object is InstancedMesh =>
      Boolean(object && 'isInstancedMesh' in object && object.isInstancedMesh === true);
    const world = new World(1847, 1);
    const findBush = () => world.group.children.find(object => object.userData.resource === 'food'
      && object.children.some(child => child.userData.natureGround));
    const deadline = performance.now() + 30000;
    let bush = findBush();
    while (!bush && performance.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 100));
      bush = findBush();
    }
    if (!bush) throw new Error('No authored shrub loaded');
    const foliage = bush.children.find(child => child.userData.natureGround);
    if (!isInstancedMesh(foliage) || !isInstancedMesh(foliage.children[0])) {
      throw new Error('Missing shared shrub or berry mesh');
    }
    const shrubGeometry = foliage.geometry;
    const berryGeometry = foliage.children[0].geometry;
    let shrubDisposals = 0;
    let berryDisposals = 0;
    shrubGeometry.addEventListener('dispose', () => shrubDisposals++);
    berryGeometry.addEventListener('dispose', () => berryDisposals++);
    const id = bush.userData.resourceId;
    const { x, z, y } = bush.position;
    world.editTerrain(x, z, 3, 'raise');
    const afterEdit = bush.position.y;
    const heightAfterEdit = world.heightAt(x, z);
    world.updateChunks(180, 180, true);
    world.updateChunks(0, 0, true);
    bush = world.group.children.find(object => object.userData.resourceId === id);
    const revisited = bush?.children.find(child => child.userData.natureGround);
    const beforeDispose = [shrubDisposals, berryDisposals];
    const revisitHeight = bush?.position.y;
    const shared = isInstancedMesh(revisited)
      && revisited.geometry === shrubGeometry
      && isInstancedMesh(revisited.children[0])
      && revisited.children[0].geometry === berryGeometry;
    world.dispose();
    return { y, afterEdit, heightAfterEdit, revisitHeight, shared, beforeDispose, afterDispose: [shrubDisposals, berryDisposals] };
  });
  expect(result.afterEdit).toBeGreaterThan(result.y);
  expect(result.afterEdit).toBeCloseTo(result.heightAfterEdit, 5);
  expect(result.revisitHeight).toBeCloseTo(result.heightAfterEdit, 5);
  expect(result.shared).toBe(true);
  expect(result.beforeDispose).toEqual([0, 0]);
  expect(result.afterDispose).toEqual([1, 1]);
});
