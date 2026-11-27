import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { InstancedMesh, Mesh } from 'three';

type Tree = { id: string; x: number; z: number; family: string; authored: boolean };
type State = { trees: Tree[]; player: { x: number; z: number } };

test('procedural wildflowers render distinct petals and stems in WebGL', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /shader|webglprogram/i.test(message.text())) errors.push(message.text());
  });
  await page.goto('./');
  const colors = await page.evaluate(async () => {
    const THREE = await import('/NewDawn/node_modules/three/build/three.module.js');
    const { World } = await import('/NewDawn/src/world.ts');
    const world = new World(1847, 1);
    const flowers = world.group.children.find((object): object is InstancedMesh =>
      object.type === 'Mesh' && object.userData.groundCover === 'flower');
    if (!flowers) throw new Error('No flower instances were generated');
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 2));
    scene.add(new THREE.Mesh(flowers.geometry, flowers.material));
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 10);
    camera.position.set(0.32, 0.3, 0.45);
    camera.lookAt(0, 0, 0);
    const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true });
    renderer.setSize(128, 128);
    renderer.render(scene, camera);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const context = canvas.getContext('2d')!;
    context.drawImage(renderer.domElement, 0, 0);
    const pixels = context.getImageData(0, 0, 128, 128).data;
    let light = 0, green = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      const [r, g, b] = [pixels[i], pixels[i + 1], pixels[i + 2]];
      if (r > 120 && g > 120 && b > 100) light++;
      if (g > r * 1.08 && g > b * 1.15 && g > 30) green++;
    }
    renderer.dispose();
    world.dispose();
    return { light, green };
  });
  expect(colors.light).toBeGreaterThan(10);
  expect(colors.green).toBeGreaterThan(10);
  expect(errors).toEqual([]);
});

test('local rocks and instanced plants load into streamed gameplay', async ({ page }) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico')) errors.push(message.text());
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('./');
  await page.locator('#newGame').click();
  await expect.poll(async () => page.evaluate(() => {
    const snapshot = (window as Window & { __newDawnState: () => { groundArt: Record<string, number> } }).__newDawnState();
    const { stones, deposits, grass, ferns, shrubs } = snapshot.groundArt;
    return [stones, deposits, grass, ferns, shrubs].every(count => count > 0);
  }), { timeout: 30000 }).toBe(true);
  const directory = join(process.cwd(), 'art-review', 'batch-005d-a2', 'ground');
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: join(directory, 'starter.png') });
  expect(errors).toEqual([]);
});

test('authored ground assets survive editing, gathering and chunk streaming', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const { World } = await import('/NewDawn/src/world.ts');
    const world = new World(1847);
    const deadline = performance.now() + 30000;
    let stone: Mesh | undefined;
    let cover: InstancedMesh | undefined;
    while (performance.now() < deadline) {
      stone = world.group.children.find((object): object is Mesh =>
        object.type === 'Mesh' && object.userData.resource === 'stone' && object.userData.natureGround);
      cover = world.group.children.find((object): object is InstancedMesh =>
        object.type === 'Mesh' && object.userData.groundCover === 'grass' && object.userData.natureGround);
      if (stone && cover) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!stone || !cover) throw new Error('Authored ground assets did not load');
    const geometry = stone.geometry;
    const coverGeometry = cover.geometry;
    let stoneDisposals = 0;
    let coverDisposals = 0;
    geometry.addEventListener('dispose', () => stoneDisposals++);
    coverGeometry.addEventListener('dispose', () => coverDisposals++);
    const id = stone.userData.resourceId as string;
    const position = world.resourceLocation(stone);
    world.editTerrain(position.x, position.z, 2, 'raise');
    const aligned = Math.abs(stone.position.y - world.heightAt(position.x, position.z) - 0.12) < 0.001;
    const gathered = world.gatherNearest(position.x, position.z, 0.1, 'stone')?.resource;
    world.updateChunks(180, 180, true);
    world.updateChunks(0, 0, true);
    const persisted = world.depletedSnapshot().includes(id)
      && !world.group.children.some(object => object.userData.resourceId === id);
    const reused = world.group.children.some(object => object.type === 'Mesh' && 'geometry' in object
      && object.userData.resource === 'stone' && object.geometry === geometry)
      && world.group.children.some(object => object.type === 'Mesh' && 'geometry' in object
        && object.userData.groundCover === 'grass' && object.geometry === coverGeometry);
    const earlyDisposals = [stoneDisposals, coverDisposals];
    world.dispose();
    return { aligned, gathered, persisted, reused, earlyDisposals, finalDisposals: [stoneDisposals, coverDisposals] };
  });
  expect(result).toEqual({ aligned: true, gathered: 'stone', persisted: true, reused: true,
    earlyDisposals: [0, 0], finalDisposals: [1, 1] });
});

test('authored broadleaf trees gather and remain depleted after reload', async ({ page }) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico')) errors.push(message.text());
  });

  const state = () => page.evaluate(() =>
    (window as Window & { __newDawnState: () => State }).__newDawnState());
  await page.goto('./');
  await page.locator('#newGame').click();
  await expect.poll(async () => (await state()).trees.some(tree => tree.family === 'deciduous' && tree.authored)).toBe(true);
  const tree = (await state()).trees.find(item => item.family === 'deciduous' && item.authored)!;

  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.evaluate(async tree => {
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
    record.player = { x: tree.x, y: world.heightAt(tree.x, tree.z), z: tree.z };
    record.npc = { x: tree.x + 30, z: tree.z + 30 };
    record.vehicle = { x: tree.x + 35, z: tree.z + 35 };
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
  }, tree);
  await page.reload();
  await page.locator('#continueGame').click();
  await expect.poll(async () => {
    const snapshot = await state();
    return Math.hypot(snapshot.player.x - tree.x, snapshot.player.z - tree.z) < 0.5
      && snapshot.trees.some(item => item.id === tree.id && item.authored);
  }, { timeout: 30000 }).toBe(true);
  const directory = join(process.cwd(), 'art-review', 'batch-005d-a2', 'gather');
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: join(directory, 'before.png') });
  await page.keyboard.press('Space');
  await expect.poll(async () => (await state()).trees.some(item => item.id === tree.id)).toBe(false);
  await expect(page.locator('#toast')).toContainText('wood');
  await page.screenshot({ path: join(directory, 'after.png') });
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.reload();
  await page.locator('#continueGame').click();
  await expect.poll(async () => {
    const snapshot = await state();
    return Math.hypot(snapshot.player.x - tree.x, snapshot.player.z - tree.z) < 0.5
      && snapshot.trees.some(item => item.family === 'deciduous' && item.authored);
  }, { timeout: 30000 }).toBe(true);
  expect((await state()).trees.some(item => item.id === tree.id)).toBe(false);
  await page.screenshot({ path: join(directory, 'reload.png') });
  expect(errors).toEqual([]);
});

test('authored conifers load in a streamed high-latitude gameplay region', async ({ page }) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico')) errors.push(message.text());
  });
  await page.goto('./');
  await page.locator('#newGame').click();
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  const target = await page.evaluate(async () => {
    const { World } = await import('/NewDawn/src/world.ts');
    const { geographicToPlanetPosition } = await import('/NewDawn/src/planet.ts');
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
    let tree: { x: number; z: number; id: string } | undefined;
    for (const latitude of [50, 60, -50, -60]) {
      for (let longitude = -180; longitude < 180 && !tree; longitude += 20) {
        const point = geographicToPlanetPosition(latitude, longitude);
        world.updateChunks(point.x, point.z, true);
        const object = world.group.children.find(item =>
          item.userData.resource === 'wood' && item.userData.vegetationFamily === 'conifer');
        if (object) {
          const position = world.resourceLocation(object);
          tree = { ...position, id: object.userData.resourceId as string };
        }
      }
      if (tree) break;
    }
    if (!tree) throw new Error('No conifer found in tested regions');
    const x = tree.x + 2;
    const z = tree.z + 2;
    record.version = 11;
    delete record.planetPositions;
    record.player = { x, y: world.heightAt(x, z), z };
    record.npc = { x: x + 30, z: z + 30 };
    record.vehicle = { x: x + 35, z: z + 35 };
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
    return tree;
  });
  await page.reload();
  await page.locator('#continueGame').click();
  await expect.poll(async () => page.evaluate(id =>
    (window as Window & { __newDawnState: () => State }).__newDawnState().trees
      .some(tree => tree.id === id && tree.family === 'conifer' && tree.authored), target.id),
  { timeout: 30000 }).toBe(true);
  const directory = join(process.cwd(), 'art-review', 'batch-005d-a2', 'conifer');
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: join(directory, 'gameplay.png') });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: join(directory, 'gameplay-later.png') });
  expect(errors).toEqual([]);
});
