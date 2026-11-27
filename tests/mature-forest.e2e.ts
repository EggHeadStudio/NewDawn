import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

type Tree = { id: string; x: number; z: number; variant?: string; species?: string };
type State = { trees: Tree[]; player: { x: number; z: number }; terrainReady: boolean;
  groundArt: { grass: number; shrubs: number } };

test('selective mature trees retain resource identity and depletion across reloads', async ({ page }) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const url = message.location().url;
    if (url && new URL(url).pathname === '/favicon.ico' && message.text().includes('404')) return;
    errors.push(`${message.text()} (${url})`);
  });
  const state = () => page.evaluate(() => (window as Window & { __newDawnState: () => State }).__newDawnState());
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('./');
  await page.locator('#newGame').click();
  const isMature = (tree: Tree) => tree.variant === 'mature' || tree.variant === 'mature-pine';
  await expect.poll(async () => (await state()).trees.some(isMature), { timeout: 30000 }).toBe(true);
  const snapshot = await state();
  const tree = snapshot.trees.filter(isMature)
    .sort((a, b) => Math.hypot(a.x - snapshot.player.x, a.z - snapshot.player.z)
      - Math.hypot(b.x - snapshot.player.x, b.z - snapshot.player.z))[0];
  console.log('Selected mature gameplay tree:', tree.species, tree.variant);
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.evaluate(async tree => {
    const { terrainHeight } = await import('/NewDawn/src/world.ts');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('new-dawn', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const data = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const request = db.transaction('saves').objectStore('saves').get('primary');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    data.version = 11;
    delete data.planetPositions;
    const x = tree.x + 1.5;
    const z = tree.z + 1.5;
    data.player = { x, y: terrainHeight(x, z, Number(data.seed)), z };
    data.npc = { x: tree.x + 30, z: tree.z + 30 };
    data.vehicle = { x: tree.x + 35, z: tree.z + 35 };
    data.wildlife = [];
    data.calendar = { minute: 720, day: 1, speed: 0.5 };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('saves', 'readwrite');
      tx.objectStore('saves').put(data, 'primary');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, tree);
  await page.reload();
  await page.locator('#continueGame').click();
  await expect.poll(async () => {
    const current = await state();
    return current.terrainReady && current.groundArt.grass > 0 && current.groundArt.shrubs > 0
      && current.trees.some(item => item.id === tree.id && item.variant === tree.variant)
      && current.trees.some(item => item.variant === 'default');
  }, { timeout: 30000 }).toBe(true);
  const directory = join(process.cwd(), 'art-review', 'batch-005d-a3-2', 'selective-mature');
  await mkdir(directory, { recursive: true });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: join(directory, `${tree.variant}-near-tree.png`) });
  await page.keyboard.press('Space');
  await expect.poll(async () => (await state()).trees.some(item => item.id === tree.id)).toBe(false);
  await expect(page.locator('#toast')).toContainText('wood');
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.reload();
  await page.locator('#continueGame').click();
  await expect.poll(async () => (await state()).trees.some(isMature), { timeout: 30000 }).toBe(true);
  expect((await state()).trees.some(item => item.id === tree.id)).toBe(false);
  await page.locator('#legacyCamera').evaluate((element: HTMLInputElement) => {
    element.checked = true;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
  let clearance = 0;
  for (let step = 0; step < 20 && !clearance; step++) {
    await page.mouse.move(600, 350);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(720, 350);
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(350);
    clearance = await page.evaluate(() => (window as Window & { __newDawnFoliageClearance: () => number }).__newDawnFoliageClearance());
  }
  expect(clearance, 'camera orbit should encounter an authored foliage obstruction').toBeGreaterThan(0);
  await page.waitForTimeout(1000);
  const localized = await page.screenshot({ path: join(directory, 'occlusion-orbit.png') });
  await page.evaluate(() => (window as Window & { __newDawnUseLegacyFoliageFade: () => void }).__newDawnUseLegacyFoliageFade());
  await page.waitForTimeout(1500);
  const legacy = await page.screenshot({ path: join(directory, 'occlusion-orbit-legacy.png') });
  const greenPixels = async (image: Buffer) => {
    const pixels = await sharp(image).extract({ left: 550, top: 150, width: 300, height: 180 }).removeAlpha().raw().toBuffer();
    let count = 0;
    for (let i = 0; i < pixels.length; i += 3) {
      if (pixels[i + 1] > pixels[i] * 1.12 && pixels[i + 1] > pixels[i + 2] * 1.12 && pixels[i + 1] > 24) count++;
    }
    return count;
  };
  expect(await greenPixels(localized)).toBeGreaterThan((await greenPixels(legacy)) + 1000);
  expect(errors).toEqual([]);
});

test('mature and default trees load in either order and failure retains the fallback', async ({ page }) => {
  test.setTimeout(180000);
  const state = () => page.evaluate(() => (window as Window & { __newDawnState: () => State }).__newDawnState());
  let releaseMature!: () => void;
  const matureGate = new Promise<void>(resolve => { releaseMature = resolve; });
  await page.route('**/mature-broadleaf.glb', async route => {
    await matureGate;
    await route.continue();
  });
  await page.goto('./');
  await page.locator('#newGame').click();
  try {
    await expect.poll(async () => (await state()).trees.some(tree => tree.variant === 'default'), { timeout: 30000 }).toBe(true);
  } finally {
    releaseMature();
  }
  await expect.poll(async () => (await state()).trees.some(tree => tree.variant === 'mature'), { timeout: 30000 }).toBe(true);
  const matureId = (await state()).trees.find(tree => tree.variant === 'mature')!.id;
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.unroute('**/mature-broadleaf.glb');

  let releaseDefault!: () => void;
  const defaultGate = new Promise<void>(resolve => { releaseDefault = resolve; });
  await page.route('**/tree-small.glb', async route => {
    await defaultGate;
    await route.continue();
  });
  await page.reload();
  await page.locator('#continueGame').click();
  try {
    await expect.poll(async () => (await state()).trees.find(tree => tree.id === matureId)?.variant, { timeout: 30000 }).toBe('mature');
  } finally {
    releaseDefault();
  }
  await expect.poll(async () => (await state()).trees.some(tree => tree.variant === 'default'), { timeout: 30000 }).toBe(true);
  expect((await state()).trees.find(tree => tree.id === matureId)?.variant).toBe('mature');
  await page.unroute('**/tree-small.glb');

  await page.route('**/mature-broadleaf.glb', route => route.abort());
  await page.reload();
  await page.locator('#continueGame').click();
  await expect.poll(async () => (await state()).trees.find(tree => tree.id === matureId)?.variant, { timeout: 30000 }).toBe('default');
});

test('mature conifers render with the bounded local CC0 pine prototype', async ({ page }) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('./');
  await page.locator('#newGame').click();
  await page.locator('#pauseButton').click();
  const tree = await page.evaluate(async () => {
    const { geographicToPlanetPosition } = await import('/NewDawn/src/planet.ts');
    const { World } = await import('/NewDawn/src/world.ts');
    const point = geographicToPlanetPosition(60, 0);
    const world = new World(1847, 1);
    world.updateChunks(point.x, point.z, true);
    const deadline = performance.now() + 30000;
    let mature = world.group.children.find(object => object.userData.natureVariant === 'mature-pine');
    while (!mature && performance.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 100));
      mature = world.group.children.find(object => object.userData.natureVariant === 'mature-pine');
    }
    if (!mature) throw new Error('No selected mature pine prototype loaded in the boreal fixture');
    const position = world.resourceLocation(mature);
    const result = { id: mature.userData.resourceId as string, x: position.x, z: position.z, species: mature.userData.treeSpecies as string };
    world.dispose();
    return result;
  });
  expect(tree.species).toBe('pine');
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.evaluate(async tree => {
    const { terrainHeight } = await import('/NewDawn/src/world.ts');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('new-dawn', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const data = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const request = db.transaction('saves').objectStore('saves').get('primary');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const x = tree.x + 2;
    const z = tree.z + 2;
    data.version = 11;
    delete data.planetPositions;
    data.player = { x, y: terrainHeight(x, z, Number(data.seed)), z };
    data.npc = { x: tree.x + 30, z: tree.z + 30 };
    data.vehicle = { x: tree.x + 35, z: tree.z + 35 };
    data.wildlife = [];
    data.calendar = { minute: 720, day: 173, speed: 0.5 };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('saves', 'readwrite');
      tx.objectStore('saves').put(data, 'primary');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, tree);
  await page.reload();
  await page.locator('#continueGame').click();
  await expect.poll(async () => page.evaluate(id => (window as Window & { __newDawnState: () => State }).__newDawnState()
    .trees.some(item => item.id === id && item.variant === 'mature-pine'), tree.id), { timeout: 30000 }).toBe(true);
  const directory = join(process.cwd(), 'art-review', 'batch-005d-a3-2', 'selective-mature');
  await mkdir(directory, { recursive: true });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: join(directory, 'mature-pine-boreal.png') });
  expect(errors).toEqual([]);
});
