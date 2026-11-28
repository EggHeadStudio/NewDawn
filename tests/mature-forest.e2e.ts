import { expect, test } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { collectTree, sawTree, walkTo } from './timber-helpers';

type Tree = { id: string; x: number; z: number; variant?: string; species?: string };
type State = { trees: Tree[]; player: { x: number; z: number }; cameraAngle: number; terrainReady: boolean;
  groundArt: { grass: number; shrubs: number } };

test('authored foliage casts a cutout shadow onto visible ground', async ({ page }) => {
  await page.goto('./');
  const darkened = await page.evaluate(async () => {
    const THREE = await import('/NewDawn/node_modules/three/build/three.module.js');
    const { NatureAssets } = await import('/NewDawn/src/nature-assets.ts');
    const { assets, tree } = await new Promise<{
      assets: InstanceType<typeof NatureAssets>; tree: InstanceType<typeof THREE.Group>;
    }>((resolve, reject) => {
      let ready = false;
      const timeout = setTimeout(() => reject(new Error('Conifer did not load')), 30000);
      const assets = new NatureAssets(() => {
        if (ready) return;
        const tree = assets.create('conifer', 0);
        if (!tree) return;
        ready = true;
        clearTimeout(timeout);
        resolve({ assets, tree });
      });
    });
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(512, 512);
    renderer.shadowMap.enabled = true;
    const target = new THREE.WebGLRenderTarget(512, 512);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-8, 8, 8, -8, 0.1, 50);
    camera.position.set(0, 20, 0);
    camera.lookAt(0, 0, 0);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30),
      new THREE.MeshStandardMaterial({ color: '#ffffff' }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    const sun = new THREE.DirectionalLight('#ffffff', 3);
    sun.position.set(8, 15, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 });
    scene.add(tree, ground, sun, new THREE.AmbientLight('#ffffff', 0.3));
    assets.wind.time.value = 2;
    assets.wind.wind.value = 1;
    const isMesh = (object: InstanceType<typeof THREE.Object3D>): object is InstanceType<typeof THREE.Mesh> =>
      'isMesh' in object && object.isMesh === true;
    const leaves: InstanceType<typeof THREE.Mesh>[] = [];
    tree.traverse(object => {
      if (isMesh(object) && object.customDepthMaterial) leaves.push(object);
    });
    const sample = () => {
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      const pixels = new Uint8Array(512 * 512 * 4);
      renderer.readRenderTargetPixels(target, 0, 0, 512, 512, pixels);
      return pixels;
    };
    try {
      if (!leaves.length || leaves.some(leaf => !leaf.castShadow)) throw new Error('Canopy shadows are disabled');
      leaves.forEach(leaf => { leaf.castShadow = false; });
      const before = sample();
      leaves.forEach(leaf => { leaf.castShadow = true; });
      const after = sample();
      let darker = 0;
      for (let i = 0; i < before.length; i += 4) {
        if (before[i] + before[i + 1] + before[i + 2] > after[i] + after[i + 1] + after[i + 2] + 24) darker++;
      }
      return darker;
    } finally {
      tree.traverse(object => {
        if (!isMesh(object)) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
        object.customDepthMaterial?.dispose();
      });
      assets.dispose();
      ground.geometry.dispose();
      ground.material.dispose();
      sun.shadow.map?.dispose();
      target.dispose();
      renderer.dispose();
    }
  });
  expect(darkened).toBeGreaterThan(100);
});

test('authored wood clears and restores only the local player sightline', async ({ page }) => {
  await page.goto('./');
  const samples = await page.evaluate(async () => {
    const THREE = await import('/NewDawn/node_modules/three/build/three.module.js');
    const { TreeClearance, installTreeClearance } = await import('/NewDawn/src/tree-occlusion.ts');
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(256, 256);
    const target = new THREE.WebGLRenderTarget(256, 256);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(90, 1, 0.1, 10);
    camera.position.set(0, 1.05, 4);
    camera.lookAt(0, 1.05, 0);
    const material = new THREE.MeshStandardMaterial({ color: '#806044' });
    installTreeClearance(material);
    const branch = new THREE.Mesh(new THREE.BoxGeometry(4, 0.2, 0.1), material);
    branch.position.set(0, 1.05, 2);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.8, 0.1), new THREE.MeshBasicMaterial({ color: '#00ff00' }));
    body.position.y = 1.05;
    scene.add(branch, body, new THREE.AmbientLight('#ffffff', 3));
    const clearance: unknown = material.userData.treeClearance;
    if (!(clearance instanceof TreeClearance)) throw new Error('Wood has no localized clearance');
    clearance.camera.value.copy(camera.position);
    clearance.target.value.set(0, 1.05, 0);
    const sample = () => {
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      const center = new Uint8Array(4), edge = new Uint8Array(4);
      renderer.readRenderTargetPixels(target, 128, 128, 1, 1, center);
      renderer.readRenderTargetPixels(target, 240, 128, 1, 1, edge);
      return { center: [...center], edge: [...edge] };
    };
    try {
      const before = sample();
      clearance.amount.value = 1;
      const cleared = sample();
      clearance.amount.value = 0;
      const restored = sample();
      return { before, cleared, restored, opacity: material.opacity,
        transparent: material.transparent, depthWrite: material.depthWrite };
    } finally {
      branch.geometry.dispose();
      material.dispose();
      body.geometry.dispose();
      body.material.dispose();
      target.dispose();
      renderer.dispose();
    }
  });
  expect(samples.before.center[0]).toBeGreaterThan(samples.before.center[1]);
  expect(samples.cleared.center[1]).toBeGreaterThan(samples.cleared.center[0] + 100);
  expect(samples.cleared.edge).toEqual(samples.before.edge);
  expect(samples.restored).toEqual(samples.before);
  expect(samples.opacity).toBe(1);
  expect(samples.transparent).toBe(false);
  expect(samples.depthWrite).toBe(true);
});

test('selective mature trees retain resource identity and depletion across reloads', async ({ page }, testInfo) => {
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
  await page.waitForTimeout(5000);
  await page.screenshot({ path: testInfo.outputPath(`${tree.variant}-near-tree.png`) });
  await walkTo(page, tree);
  await sawTree(page, tree.id);
  await collectTree(page, tree.id);
  await expect.poll(async () => (await state()).trees.some(item => item.id === tree.id)).toBe(false);
  await expect(page.locator('#toast')).toContainText('wood');
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.reload();
  await page.locator('#continueGame').click();
  await expect.poll(async () => (await state()).trees.some(isMature), { timeout: 30000 }).toBe(true);
  expect((await state()).trees.some(item => item.id === tree.id)).toBe(false);
  const greenPixels = async (image: Buffer) => {
    const pixels = await sharp(image).extract({ left: 550, top: 150, width: 300, height: 180 }).removeAlpha().raw().toBuffer();
    let count = 0;
    for (let i = 0; i < pixels.length; i += 3) {
      if (pixels[i + 1] > pixels[i] * 1.12 && pixels[i + 1] > pixels[i + 2] * 1.12 && pixels[i + 1] > 24) count++;
    }
    return count;
  };
  const enableRightDrag = () => page.locator('#legacyCamera').evaluate((element: HTMLInputElement) => {
    element.checked = true;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const orbit = async () => {
    await page.mouse.move(600, 350);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(720, 350);
    await page.mouse.up({ button: 'right' });
    await page.waitForTimeout(350);
  };
  await enableRightDrag();
  await page.waitForTimeout(1500);
  const localized = new Map<number, { image: Buffer; angle: number }>();
  for (let step = 0; step < 20; step++) {
    await orbit();
    const clearance = await page.evaluate(() => (window as Window & { __newDawnFoliageClearance: () => number }).__newDawnFoliageClearance());
    if (clearance) localized.set(step, { image: await page.screenshot(), angle: (await state()).cameraAngle });
  }
  expect(localized.size, 'camera orbit should encounter an authored foliage obstruction').toBeGreaterThan(0);

  await page.reload();
  await page.locator('#continueGame').click();
  await expect.poll(async () => (await state()).trees.some(isMature), { timeout: 30000 }).toBe(true);
  await enableRightDrag();
  await page.waitForTimeout(1500);
  await page.evaluate(() => (window as Window & { __newDawnUseLegacyFoliageFade: () => void }).__newDawnUseLegacyFoliageFade());
  let bestDifference = -Infinity;
  let best: { localized: Buffer; legacy: Buffer } | undefined;
  for (let step = 0; step < 20; step++) {
    await orbit();
    const candidate = localized.get(step);
    if (!candidate) continue;
    expect((await state()).cameraAngle).toBeCloseTo(candidate.angle, 4);
    const legacy = await page.screenshot();
    const difference = (await greenPixels(candidate.image)) - (await greenPixels(legacy));
    if (difference > bestDifference) {
      bestDifference = difference;
      best = { localized: candidate.image, legacy };
    }
  }
  expect(bestDifference, 'localized clearance should preserve visibly more foliage than whole-mesh fading').toBeGreaterThan(1000);
  await writeFile(testInfo.outputPath('occlusion-orbit.png'), best!.localized);
  await writeFile(testInfo.outputPath('occlusion-orbit-legacy.png'), best!.legacy);
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
    const x = tree.x + 5;
    const z = tree.z + 5;
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
  await page.locator('#legacyCamera').evaluate((element: HTMLInputElement) => {
    element.checked = true;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.mouse.move(600, 350);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(600, 200);
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(directory, 'mature-pine-canopy.png') });
  expect(errors).toEqual([]);
});
