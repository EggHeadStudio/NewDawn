import { expect, test, type Page } from '@playwright/test';
import type { InstancedMesh, Mesh, Object3D } from 'three';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

async function setNoonSave(page: Page) {
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('saves', 'readwrite');
      const store = tx.objectStore('saves');
      const get = store.get('primary');
      get.onsuccess = () => {
        const save = get.result;
        save.calendar = { minute: 720, day: 1, speed: 0.5 };
        save.wildlife = [];
        store.put(save, 'primary');
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    };
  }));
  await page.reload();
  await page.locator('#continueGame').click();
}

test('authored tree detail switches and shared geometry survives streamed revisits', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const { World } = await import('/NewDawn/src/world.ts');
    const world = new World(1847, 1);
    const findTree = () => world.group.children.find(object => object.userData.natureAuthored
      && object.position.x >= 0 && object.position.x < 8 && object.position.z >= 0 && object.position.z < 8);
    const deadline = performance.now() + 30000;
    let tree = findTree();
    while (!tree && performance.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 100));
      tree = findTree();
    }
    if (!tree) throw new Error('No nearby authored tree loaded');
    const foliage = () => {
      let found: Mesh | undefined;
      tree!.traverse(object => {
        if (object.type === 'Mesh' && object.userData.natureMidGeometry) found = object as Mesh;
      });

      if (!found) throw new Error('No shared foliage LOD found');
      return found;
    };
    const id = tree.userData.resourceId;
    const position = { x: tree.position.x, z: tree.position.z };
    const near = foliage().geometry;
    const nearCount = near.index!.count;
    let nearDisposals = 0;
    near.addEventListener('dispose', () => nearDisposals++);
    world.updateChunks(position.x + 28, position.z);
    const mid = foliage().geometry;
    const midCount = mid.index!.count;
    let midDisposals = 0;
    mid.addEventListener('dispose', () => midDisposals++);
    world.updateChunks(position.x, position.z);
    const returnedNear = foliage().geometry === near;
    world.updateChunks(180, 180, true);
    world.updateChunks(0, 0, true);
    tree = world.group.children.find(object => object.userData.resourceId === id);
    const revisited = Boolean(tree && foliage().geometry === near);
    const beforeDispose = [nearDisposals, midDisposals];
    world.dispose();
    return { nearCount, midCount, returnedNear, revisited, beforeDispose, afterDispose: [nearDisposals, midDisposals] };
  });
  expect(result.midCount).toBeGreaterThan(0);
  expect(result.midCount).toBeLessThan(result.nearCount * 0.7);
  expect(result.returnedNear).toBe(true);
  expect(result.revisited).toBe(true);
  expect(result.beforeDispose).toEqual([0, 0]);
  expect(result.afterDispose).toEqual([1, 1]);
});

test('ground-cover quality scales instances without losing edited hidden placements', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const { World } = await import('/NewDawn/src/world.ts');
    const world = new World(1847, 1);
    const isGrass = (object: Object3D): object is InstancedMesh =>
      object.userData.groundCover === 'grass' && 'isInstancedMesh' in object;
    const grass = world.group.children.find(object => isGrass(object) && object.position.x === 0 && object.position.z === 0);
    if (!grass || !isGrass(grass)) throw new Error('No grass in the origin chunk');
    const fullCount = grass.instanceMatrix.count;
    world.setVegetationQuality('low');
    world.updateChunks(40, 0, true);
    const reducedCount = grass.count;
    const hiddenIndex = fullCount - 1;
    if (reducedCount >= fullCount) throw new Error('No hidden grass instance to test');
    const matrix = grass.matrix.clone();
    grass.getMatrixAt(hiddenIndex, matrix);
    const x = matrix.elements[12], z = matrix.elements[14], before = matrix.elements[13];
    world.editTerrain(x, z, 3, 'raise');
    grass.getMatrixAt(hiddenIndex, matrix);
    const edited = matrix.elements[13];
    const expected = world.heightAt(x, z) + 0.13;
    world.setVegetationQuality('high');
    world.updateChunks(0, 0, true);
    const restoredCount = grass.count;
    world.dispose();
    return { fullCount, reducedCount, restoredCount, before, edited, expected };
  });
  expect(result.reducedCount).toBeLessThan(result.fullCount * 0.5);
  expect(result.restoredCount).toBe(result.fullCount);
  expect(result.edited).toBeGreaterThan(result.before);
  expect(result.edited).toBeCloseTo(result.expected, 5);
});

test('alpha-masked foliage uses coverage only when enabled', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const { World } = await import('/NewDawn/src/world.ts');
    const inspect = async (enabled: boolean) => {
      const world = new World(1847, 1, enabled);
      const find = () => {
        let tree: boolean | undefined;
        let grass: boolean | undefined;
        world.group.traverse(object => {
          if (object.type !== 'Mesh' && object.type !== 'InstancedMesh') return;
          const mesh = object as Mesh;
          for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
            if (material.alphaTest <= 0) continue;
            if (object.userData.natureMidGeometry) tree = material.alphaToCoverage;
            if (object.userData.groundCover === 'grass' && object.userData.natureGround) grass = material.alphaToCoverage;
          }
        });
        return { tree, grass };
      };
      const deadline = performance.now() + 30000;
      let found = find();
      while ((found.tree === undefined || found.grass === undefined) && performance.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 100));
        found = find();
      }
      world.dispose();
      return found;
    };
    return { enabled: await inspect(true), fallback: await inspect(false) };
  });
  expect(result.enabled).toEqual({ tree: true, grass: true });
  expect(result.fallback).toEqual({ tree: false, grass: false });
  await page.locator('#newGame').click();
  const state = await page.evaluate(() => (window as Window & { __newDawnState: () => {
    rendering: { foliageAlphaCoverage: boolean }
  } }).__newDawnState());
  const supported = await page.locator('#game').evaluate((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext('webgl2');
    if (!gl) throw new Error('Game WebGL2 context unavailable');
    return gl.getContextAttributes()?.antialias === true && Number(gl.getParameter(gl.SAMPLES)) > 1;
  });
  console.log(`Multisampled foliage coverage in this Edge context: ${supported}`);
  expect(state.rendering.foliageAlphaCoverage).toBe(supported);
});

test('live quality presets reduce rendered vegetation workload', async ({ page }) => {
  test.setTimeout(180000);
  const state = () => page.evaluate(() => (window as Window & { __newDawnState: () => {
    trees: Array<{ authored: boolean; variant?: string }>; groundArt: { grass: number; shrubs: number; stones: number };
    rendering: { triangles: number; calls: number; geometries: number; textures: number };
  } }).__newDawnState());
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('./');
  await page.locator('#newGame').click();
  await setNoonSave(page);
  await expect.poll(async () => {
    const snapshot = await state();
    return snapshot.trees.some(tree => tree.variant === 'mature') && snapshot.trees.some(tree => tree.variant === 'default') && snapshot.groundArt.grass > 0
      && snapshot.groundArt.shrubs > 0 && snapshot.groundArt.stones > 0;
  }, { timeout: 30000 }).toBe(true);
  const sample = async (quality: 'high' | 'low') => {
    await page.locator('#pauseButton').click();
    await page.locator('#graphicsQuality').selectOption(quality);
    await page.locator('#resumeGame').click();
    await page.waitForTimeout(1500);
    const directory = join(process.cwd(), 'art-review', 'batch-005d-a3-2', 'quality');
    await mkdir(directory, { recursive: true });
    await page.screenshot({ path: join(directory, `desktop-${quality}.png`) });
    return (await state()).rendering;
  };
  const high = await sample('high');
  const low = await sample('low');
  console.log(`Vegetation quality sample at 1280x720: ${JSON.stringify({ high, low })}`);
  expect(low.triangles).toBeLessThan(high.triangles * 0.95);
});

test('touch quality presets retain usable controls in portrait and landscape', async ({ browser }) => {
  test.setTimeout(180000);
  const directory = join(process.cwd(), 'art-review', 'batch-005d-a3-2', 'quality');
  await mkdir(directory, { recursive: true });
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    try {
      await page.goto('./');
      await page.locator('#newGame').tap();
      await setNoonSave(page);
      await expect.poll(async () => page.evaluate(() => (window as Window & { __newDawnState: () => {
        trees: Array<{ variant?: string }>; terrainReady: boolean
      } }).__newDawnState()).then(state => state.terrainReady && state.trees.some(tree => tree.variant === 'mature')),
      { timeout: 30000 }).toBe(true);
      for (const quality of ['low', 'medium'] as const) {
        await page.locator('#pauseButton').tap();
        await page.locator('#graphicsQuality').selectOption(quality);
        await page.locator('#resumeGame').tap();
        await page.waitForTimeout(1500);
        for (const selector of ['#joystick', '#actionA', '#actionB', '#jumpButton', '#weaponButton']) {
          const box = await page.locator(selector).boundingBox();
          expect(box).not.toBeNull();
          expect(box!.x).toBeGreaterThanOrEqual(0);
          expect(box!.y).toBeGreaterThanOrEqual(0);
          expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
          expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
        }
        await page.screenshot({ path: join(directory, `${viewport.width}x${viewport.height}-${quality}.png`) });
      }
    } finally {
      await context.close();
    }
  }
});

test('distinct fir and pine prototypes load with shared foliage detail', async ({ page }) => {
  test.setTimeout(180000);
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const { World } = await import('/NewDawn/src/world.ts');
    const { geographicToPlanetPosition } = await import('/NewDawn/src/planet.ts');
    const point = geographicToPlanetPosition(60, 0);
    const world = new World(1847, 1);
    world.updateChunks(point.x, point.z, true);
    const found = () => world.group.children.filter(object => object.userData.natureAuthored
      && object.userData.vegetationFamily === 'conifer');
    const deadline = performance.now() + 30000;
    while ((!found().some(tree => tree.userData.treeSpecies === 'pine')
      || !found().some(tree => tree.userData.treeSpecies === 'spruce' && tree.userData.natureVariant === 'default')
      || !found().some(tree => tree.userData.treeSpecies === 'spruce' && tree.userData.natureVariant === 'young-fir'))
      && performance.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    const inspect = (species: string, variant?: string) => {
      const tree = found().find(object => object.userData.treeSpecies === species
        && (!variant || object.userData.natureVariant === variant));
      if (!tree) throw new Error(`Missing authored ${species} ${variant ?? ''} visual`);
      let foliageMaterial = '';
      let hasDetail = false;
      tree.traverse(object => {
        if (object.type !== 'Mesh' || !object.userData.natureMidGeometry) return;
        const material = (object as Mesh).material;
        foliageMaterial = Array.isArray(material) ? material[0].name : material.name;
        hasDetail = true;
      });
      return { foliageMaterial, hasDetail };
    };
    const pine = inspect('pine');
    const fir = inspect('spruce', 'default');
    const young = inspect('spruce', 'young-fir');
    world.dispose();
    return { pine, fir, young };
  });
  expect(result.pine).toEqual({ foliageMaterial: 'pine_sapling_small_twig', hasDetail: true });
  expect(result.fir).toEqual({ foliageMaterial: 'fir_sapling_twigs', hasDetail: true });
  expect(result.young).toEqual({ foliageMaterial: 'fir_tree_01_twig', hasDetail: true });
});
