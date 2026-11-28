import { expect, test, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { walkTo } from './timber-helpers';

type Animal = { id: string; species: string; x: number; z: number; health: number; heading: number; visualHeading: number | null;
  behavior: string; authored: boolean; animation: string | null };
type State = { player: { x: number; z: number }; health: number; cameraAngle: number; terrainReady: boolean; wildlife: Animal[] };

async function state(page: Page) {
  return page.evaluate(() => (window as Window & { __newDawnState: () => State }).__newDawnState());
}

async function savedAnimalIdentities(page: Page) {
  return page.evaluate(() => new Promise<Pick<Animal, 'id' | 'species' | 'health'>[]>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const get = db.transaction('saves').objectStore('saves').get('primary');
      get.onsuccess = () => {
        const animals = get.result.wildlife.map(({ id, species, health }: Animal) => ({ id, species, health }));
        db.close();
        resolve(animals);
      };
      get.onerror = () => { db.close(); reject(get.error); };
    };
  }));
}

async function prepareAnimalScene(page: Page, species: 'sheep' | 'rabbit' | 'cow' | 'squirrel' | 'wolf' | 'fox' | 'deer' | 'moose' | 'bear' | 'reindeer',
  placement?: { side: number; distance: number }) {
  await page.goto('./');
  await page.locator('#newGame').click();
  await expect.poll(async () => (await state(page)).terrainReady, { timeout: 30000 }).toBe(true);
  const scene = await state(page);
  const selected = scene.wildlife.find(animal => animal.species === species);
  if (!selected) throw new Error(`The seed did not generate a ${species}`);
  await page.locator('#pauseButton').click();
  await page.locator('#cameraFollow').uncheck();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.evaluate(({ id, angle, side, distance }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('saves', 'readwrite');
      const store = tx.objectStore('saves');
      const get = store.get('primary');
      get.onsuccess = () => {
        const save = get.result;
        const animal = save.wildlife.find((candidate: Animal) => candidate.id === id);
        if (!animal) throw new Error('Saved animal is missing');
        animal.x = save.player.x - Math.sin(angle) * distance + Math.cos(angle) * side;
        animal.z = save.player.z - Math.cos(angle) * distance - Math.sin(angle) * side;
        animal.homeX = animal.x;
        animal.homeZ = animal.z;
        animal.heading = angle + Math.PI / 2;
        animal.behavior = 'rest';
        animal.decisionTimer = 60;
        delete animal.geographic;
        save.wildlife = [animal];
        save.calendar.minute = 720;
        save.calendar.speed = 0.5;
        store.put(save, 'primary');
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Wildlife fixture aborted')); };
    };
  }), { id: selected.id, angle: scene.cameraAngle,
    // At side 0 the larger cow starts inside a naturally generated stone and
    // legitimately walks out of it before the idle animation can be observed.
    side: placement?.side ?? (species === 'cow' ? -1.5 : species === 'rabbit' ? 0.8 : species === 'moose' ? -1.2
      : species === 'squirrel' || species === 'wolf' || species === 'fox' || species === 'bear' ? 1.2 : 0),
    distance: placement?.distance ?? (species === 'wolf' || species === 'fox' || species === 'bear' ? 8 : 5) });
  await page.reload();
  await page.locator('#continueGame').click();
  await expect.poll(async () => (await state(page)).terrainReady, { timeout: 30000 }).toBe(true);
  return selected.id;
}

test('observes an existing sheep in the real world and preserves its identity', async ({ page }, testInfo) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const id = await prepareAnimalScene(page, 'sheep');
  await expect.poll(async () => (await state(page)).wildlife.find(animal => animal.id === id), { timeout: 30000 })
    .toMatchObject({ authored: true, animation: 'idle' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: testInfo.outputPath('normal.png') });
  await page.locator('#pauseButton').click();
  await page.locator('#cameraDistance').fill('5');
  await page.locator('#resumeGame').click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: testInfo.outputPath('close.png') });
  const before = (await state(page)).wildlife.find(animal => animal.id === id);
  expect(before).toMatchObject({ species: 'sheep', health: 3 });
  await page.keyboard.down('w');
  await page.waitForTimeout(1400);
  await page.keyboard.up('w');
  await expect.poll(async () => {
    const after = (await state(page)).wildlife.find(animal => animal.id === id);
    return after ? Math.hypot(after.x - before!.x, after.z - before!.z) : 0;
  }).toBeGreaterThan(0.1);
  await expect.poll(async () => (await state(page)).wildlife.find(animal => animal.id === id))
    .toMatchObject({ behavior: 'flee', animation: 'trot' });
  await page.screenshot({ path: testInfo.outputPath('moving.png') });
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.reload();
  await page.locator('#continueGame').click();
  await expect.poll(async () => (await state(page)).wildlife.find(animal => animal.id === id))
    .toMatchObject({ species: 'sheep', health: 3, authored: true });
  expect(errors).toEqual([]);
});

for (const animal of [
  { species: 'rabbit', file: 'mountain-hare.glb' },
  { species: 'cow', file: 'dairy-cow.glb' },
  { species: 'squirrel', file: 'red-squirrel.glb' },
  { species: 'wolf', file: 'gray-wolf.glb' },
  { species: 'fox', file: 'red-fox.glb' },
  { species: 'deer', file: 'roe-deer.glb' },
  { species: 'moose', file: 'moose.glb' },
  { species: 'bear', file: 'grizzly-bear.glb' },
  { species: 'reindeer', file: 'reindeer.glb' },
] as const) test(`keeps the existing ${animal.species} visible when its authored model fails to load`, async ({ page }, testInfo) => {
  let requests = 0;
  await page.route(`**/assets/animals/${animal.file}`, route => {
    requests++;
    return route.abort();
  });
  const id = await prepareAnimalScene(page, animal.species);
  await expect.poll(() => requests).toBeGreaterThan(0);
  await expect.poll(async () => (await state(page)).wildlife.find(item => item.id === id))
    .toMatchObject({ species: animal.species, authored: false });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: testInfo.outputPath('normal.png') });
  await page.locator('#pauseButton').click();
  await page.locator('#cameraDistance').fill('5');
  await page.locator('#resumeGame').click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: testInfo.outputPath('close.png') });
});

test('observes an existing rabbit in the real world and preserves its identity', async ({ page }, testInfo) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const id = await prepareAnimalScene(page, 'rabbit');
  await expect.poll(async () => (await state(page)).wildlife.find(animal => animal.id === id), { timeout: 30000 })
    .toMatchObject({ authored: true, animation: 'idle' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: testInfo.outputPath('normal.png') });
  await page.locator('#pauseButton').click();
  await page.locator('#cameraDistance').fill('5');
  await page.locator('#resumeGame').click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: testInfo.outputPath('close.png') });
  const before = (await state(page)).wildlife.find(animal => animal.id === id);
  expect(before).toMatchObject({ species: 'rabbit', health: 1 });
  await page.keyboard.down('w');
  await page.waitForTimeout(1400);
  await page.keyboard.up('w');
  await expect.poll(async () => {
    const after = (await state(page)).wildlife.find(animal => animal.id === id);
    return after ? Math.hypot(after.x - before!.x, after.z - before!.z) : 0;
  }).toBeGreaterThan(0.1);
  await expect.poll(async () => (await state(page)).wildlife.find(animal => animal.id === id))
    .toMatchObject({ behavior: 'flee', animation: 'hop' });
  await page.screenshot({ path: testInfo.outputPath('moving.png') });
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.reload();
  await page.locator('#continueGame').click();
  await expect.poll(async () => (await state(page)).wildlife.find(animal => animal.id === id))
    .toMatchObject({ species: 'rabbit', health: 1, authored: true });
  expect(errors).toEqual([]);
});

test('observes an existing cow in the real world and preserves its identity', async ({ page }, testInfo) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const id = await prepareAnimalScene(page, 'cow');
  await expect.poll(async () => (await state(page)).wildlife.find(animal => animal.id === id), { timeout: 30000 })
    .toMatchObject({ authored: true, animation: 'idle' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: testInfo.outputPath('normal.png') });
  await page.locator('#pauseButton').click();
  await page.locator('#cameraDistance').fill('5');
  await page.locator('#resumeGame').click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: testInfo.outputPath('close.png') });
  const before = (await state(page)).wildlife.find(animal => animal.id === id);
  expect(before).toMatchObject({ species: 'cow', health: 4 });
  await page.keyboard.down('w');
  await page.waitForTimeout(1400);
  await page.keyboard.up('w');
  await expect.poll(async () => {
    const after = (await state(page)).wildlife.find(animal => animal.id === id);
    return after ? Math.hypot(after.x - before!.x, after.z - before!.z) : 0;
  }).toBeGreaterThan(0.1);
  await expect.poll(async () => (await state(page)).wildlife.find(animal => animal.id === id))
    .toMatchObject({ behavior: 'flee', animation: 'trot' });
  await page.screenshot({ path: testInfo.outputPath('moving.png') });
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.reload();
  await page.locator('#continueGame').click();
  await expect.poll(async () => (await state(page)).wildlife.find(animal => animal.id === id))
    .toMatchObject({ species: 'cow', health: 4, authored: true });
  expect(errors).toEqual([]);
});

for (const animal of [
  { species: 'deer', health: 3, settleMs: 3000 },
  { species: 'moose', health: 5, settleMs: 1000 },
  { species: 'reindeer', health: 3, settleMs: 1000 },
] as const) test(`observes an existing ${animal.species}, approaches and preserves its identity`, async ({ page }, testInfo) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const id = await prepareAnimalScene(page, animal.species);
  await expect.poll(async () => (await state(page)).wildlife.find(animal => animal.id === id), { timeout: 30000 })
    .toMatchObject({ species: animal.species, health: animal.health, authored: true, animation: 'idle' });
  await page.waitForTimeout(animal.settleMs);
  await page.screenshot({ path: testInfo.outputPath('normal.png') });
  await page.locator('#pauseButton').click();
  await page.locator('#cameraDistance').fill('5');
  await page.locator('#resumeGame').click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: testInfo.outputPath('close.png') });
  const before = (await state(page)).wildlife.find(animal => animal.id === id)!;
  await page.keyboard.down('w');
  try {
    await expect.poll(async () => (await state(page)).wildlife.find(animal => animal.id === id),
      { timeout: 10000, intervals: [50] }).toMatchObject({ behavior: 'flee', animation: 'trot' });
  } finally {
    await page.keyboard.up('w');
  }
  await expect.poll(async () => {
    const after = (await state(page)).wildlife.find(animal => animal.id === id)!;
    return Math.hypot(after.x - before.x, after.z - before.z);
  }).toBeGreaterThan(0.1);
  await page.screenshot({ path: testInfo.outputPath('moving.png') });
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.reload();
  await page.locator('#continueGame').click();
  await expect.poll(async () => (await state(page)).wildlife.find(animal => animal.id === id), { timeout: 30000 })
    .toMatchObject({ species: animal.species, health: animal.health, authored: true });
  expect(errors).toEqual([]);
});

test('observes an existing squirrel, approaches and preserves its identity', async ({ page }, testInfo) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const id = await prepareAnimalScene(page, 'squirrel');
  await expect.poll(async () => (await state(page)).wildlife.find(animal => animal.id === id), { timeout: 30000 })
    .toMatchObject({ authored: true, animation: 'idle' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: testInfo.outputPath('normal.png') });
  await page.locator('#pauseButton').click();
  await page.locator('#cameraDistance').fill('5');
  await page.locator('#resumeGame').click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: testInfo.outputPath('close.png') });
  const before = (await state(page)).wildlife.find(animal => animal.id === id);
  expect(before).toMatchObject({ species: 'squirrel', health: 1 });
  await page.keyboard.down('w');
  await page.waitForTimeout(1400);
  await page.keyboard.up('w');
  await expect.poll(async () => (await state(page)).wildlife.find(animal => animal.id === id))
    .toMatchObject({ behavior: 'flee', animation: 'run' });
  const after = (await state(page)).wildlife.find(animal => animal.id === id)!;
  expect(Math.hypot(after.x - before!.x, after.z - before!.z)).toBeGreaterThan(0.1);
  await page.screenshot({ path: testInfo.outputPath('moving.png') });
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.reload();
  await page.locator('#continueGame').click();
  await expect.poll(async () => (await state(page)).wildlife.find(animal => animal.id === id), { timeout: 30000 })
    .toMatchObject({ species: 'squirrel', health: 1, authored: true });
  expect(errors).toEqual([]);
});

for (const species of ['sheep', 'rabbit', 'cow', 'squirrel', 'wolf', 'fox', 'deer', 'moose', 'bear', 'reindeer'] as const) {
  test(`encounters an authored ${species} spawned naturally in a new game`, async ({ page }, testInfo) => {
    test.setTimeout(120000);
    await page.goto('./');
    await page.locator('#newGame').click();
    await expect.poll(async () => (await state(page)).terrainReady, { timeout: 30000 }).toBe(true);
    const initial = await state(page);
    const target = initial.wildlife.filter(animal => animal.species === species)
      .sort((a, b) => Math.hypot(a.x - initial.player.x, a.z - initial.player.z)
        - Math.hypot(b.x - initial.player.x, b.z - initial.player.z))[0];
    if (!target) throw new Error(`No naturally spawned ${species}`);
    let distance = Infinity;
    for (let attempt = 0; attempt < 150; attempt++) {
      const snapshot = await state(page);
      const animal = snapshot.wildlife.find(item => item.id === target.id);
      if (!animal) throw new Error(`The target ${species} was killed before the encounter`);
      const dx = animal.x - snapshot.player.x;
      const dz = animal.z - snapshot.player.z;
      distance = Math.hypot(dx, dz);
      if (distance < 5.5) break;
      const x = dx * Math.cos(snapshot.cameraAngle) - dz * Math.sin(snapshot.cameraAngle);
      const y = dx * Math.sin(snapshot.cameraAngle) + dz * Math.cos(snapshot.cameraAngle);
      const largest = Math.max(Math.abs(x), Math.abs(y));
      const keys = [
        ...(Math.abs(x) > largest * 0.4 ? [x > 0 ? 'd' : 'a'] : []),
        ...(Math.abs(y) > largest * 0.4 ? [y > 0 ? 's' : 'w'] : []),
      ];
      for (const key of keys) await page.keyboard.down(key);
      await page.waitForTimeout(180);
      for (const key of keys) await page.keyboard.up(key);
    }
    expect(distance).toBeLessThan(5.5);
    await expect.poll(async () => (await state(page)).wildlife.find(animal => animal.id === target.id)?.authored).toBe(true);
    await page.waitForTimeout(500);
    await page.screenshot({ path: testInfo.outputPath('natural-encounter.png') });
  });
}

for (const animal of [
  { species: 'sheep', speed: 0.42, moving: 'walk', resting: 'graze', fleeing: 'trot' },
  { species: 'rabbit', speed: 3, moving: 'hop', resting: 'idle', fleeing: 'hop' },
  { species: 'cow', speed: 0.42, moving: 'walk', resting: 'graze', fleeing: 'trot' },
  { species: 'squirrel', speed: 1.19, moving: 'walk', resting: 'sniff', fleeing: 'run' },
  { species: 'wolf', speed: 0.98, moving: 'walk', resting: 'idle', fleeing: 'trot' },
  { species: 'fox', speed: 0.98, moving: 'walk', resting: 'idle', fleeing: 'trot' },
  { species: 'deer', speed: 0.84, moving: 'walk', resting: 'graze', fleeing: 'trot' },
  { species: 'moose', speed: 0.735, moving: 'walk', resting: 'graze', fleeing: 'trot' },
  { species: 'bear', speed: 0.63, moving: 'walk', resting: 'idle', fleeing: 'trot' },
  { species: 'reindeer', speed: 0.945, moving: 'walk', resting: 'graze', fleeing: 'trot' },
] as const) test(`animates ${animal.species} independently and preserves shared geometry during disposal`, async ({ page }) => {
  await page.goto('./');
  const result = await page.evaluate(async ({ species, speed }) => {
    const { createAnimal, disposeAnimal } = await import('/NewDawn/src/animal-assets.ts');
    const { attachAuthoredAnimal, updateAuthoredAnimal } = await import('/NewDawn/src/authored-animal.ts');
    const roots = [createAnimal(species, 0), createAnimal(species, 1)];
    const errors: string[] = [];
    roots.forEach((root, variant) => attachAuthoredAnimal(root, species, variant, error => errors.push(String(error))));
    const deadline = performance.now() + 30000;
    while (roots.some(root => !root.getObjectByName('authored-animal')) && performance.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (errors.length || roots.some(root => !root.getObjectByName('authored-animal'))) {
      throw new Error(`Could not load ${species}: ${errors.join(', ')}`);
    }
    const meshes = roots.map(root => {
      let found: import('three').SkinnedMesh | undefined;
      root.getObjectByName('authored-animal')!.traverse(object => {
        if ((object as import('three').SkinnedMesh).isSkinnedMesh) found = object as import('three').SkinnedMesh;
      });
      if (!found) throw new Error('Animal has no skinned mesh');
      return found;
    });
    const skeletonCounts = roots.map(root => {
      const skeletons = new Set<import('three').Skeleton>();
      root.getObjectByName('authored-animal')!.traverse(object => {
        if ((object as import('three').SkinnedMesh).isSkinnedMesh) {
          skeletons.add((object as import('three').SkinnedMesh).skeleton);
        }
      });
      return skeletons.size;
    });
    const hoof = roots[0].getObjectByName('authored-animal')!
      .getObjectByName(species === 'squirrel' || species === 'wolf' || species === 'bear' ? 'Front_Paw_L' : 'front_hoof_L');
    if (!hoof) throw new Error('Animal has no front joint');
    roots[0].updateMatrixWorld(true);
    const start = hoof.getWorldPosition(roots[0].position.clone());
    for (let i = 0; i < 30; i++) {
      updateAuthoredAnimal(roots[0], 1 / 30, speed, 'wander', true);
      updateAuthoredAnimal(roots[1], 1 / 30, 0, 'rest', true);
    }
    roots[0].updateMatrixWorld(true);
    const moved = start.distanceTo(hoof.getWorldPosition(roots[0].position.clone()));
    const movingAction = species === 'rabbit' ? 'hop' : 'walk';
    const playback = (roots[0].userData.authoredAnimal.actions as Map<string, import('three').AnimationAction>)
      .get(movingAction)!.getEffectiveTimeScale();
    const beforeFarUpdate = hoof.getWorldPosition(roots[0].position.clone());
    const farUpdateUsesAuthored = updateAuthoredAnimal(roots[0], 1, speed, 'wander', false);
    roots[0].updateMatrixWorld(true);
    const farJointMovement = beforeFarUpdate.distanceTo(hoof.getWorldPosition(roots[0].position.clone()));
    let disposed = 0;
    meshes[0].geometry.addEventListener('dispose', () => { disposed++; });
    const values = {
      sharedGeometry: meshes[0].geometry === meshes[1].geometry,
      independentSkeletons: meshes[0].skeleton !== meshes[1].skeleton,
      movingAnimation: roots[0].getObjectByName('authored-animal')!.userData.animation,
      restingAnimation: roots[1].getObjectByName('authored-animal')!.userData.animation,
      moved,
    };
    disposeAnimal(roots[0]);
    const secondStillAnimated = updateAuthoredAnimal(roots[1], 0.1,
      species === 'squirrel' ? 3.4 : species === 'wolf' ? 2.8 : species === 'fox' ? 3.1 : species === 'bear' ? 1.8
        : species === 'deer' ? 2.4 : species === 'moose' ? 2.1 : species === 'reindeer' ? 2.7 : 1.2,
      species === 'wolf' || species === 'fox' || species === 'bear' ? 'chase' : 'flee', true);
    const afterDisposal = roots[1].getObjectByName('authored-animal')!.userData.animation;
    const fleeingPlayback = (roots[1].userData.authoredAnimal.actions as Map<string, import('three').AnimationAction>)
      .get(afterDisposal)!.getEffectiveTimeScale();
    disposeAnimal(roots[1]);
    return { ...values, disposed, secondStillAnimated, afterDisposal, playback, fleeingPlayback, farUpdateUsesAuthored, farJointMovement, skeletonCounts };
  }, { species: animal.species, speed: animal.speed });
  expect(result).toMatchObject({
    sharedGeometry: true, independentSkeletons: true, movingAnimation: animal.moving, restingAnimation: animal.resting,
    disposed: 0, secondStillAnimated: true, afterDisposal: animal.fleeing,
  });
  expect(result.moved).toBeGreaterThan(animal.species === 'squirrel' ? 0.003 : 0.01);
  expect(result.playback).toBeCloseTo(animal.speed / (animal.species === 'rabbit' ? 4 : animal.species === 'cow' ? 1.1
    : animal.species === 'moose' ? 1.5
      : animal.species === 'squirrel' || animal.species === 'deer' || animal.species === 'reindeer' ? 1.2 : 1));
  if (animal.species === 'deer') expect(result.fleeingPlayback).toBeCloseTo(2.4 / 3);
  if (animal.species === 'moose') expect(result.fleeingPlayback).toBeCloseTo(2.1 / 4);
  if (animal.species === 'reindeer') expect(result.fleeingPlayback).toBeCloseTo(2.7 / 3.2);
  expect(result.farUpdateUsesAuthored).toBe(true);
  expect(result.farJointMovement).toBe(0);
  if (animal.species === 'squirrel' || animal.species === 'wolf' || animal.species === 'bear') expect(result.skeletonCounts).toEqual([1, 1]);
});

for (const animal of [
  { species: 'sheep', file: 'sheep.glb' },
  { species: 'squirrel', file: 'red-squirrel.glb' },
  { species: 'wolf', file: 'gray-wolf.glb' },
  { species: 'fox', file: 'red-fox.glb' },
  { species: 'deer', file: 'roe-deer.glb' },
  { species: 'moose', file: 'moose.glb' },
  { species: 'bear', file: 'grizzly-bear.glb' },
  { species: 'reindeer', file: 'reindeer.glb' },
] as const) test(`falls back after a ${animal.species} asset failure and retries for a later instance`, async ({ page }) => {
  let requests = 0;
  await page.route(`**/assets/animals/${animal.file}`, async route => {
    requests++;
    if (requests === 1) await route.abort();
    else await route.continue();
  });
  await page.goto('./');
  const result = await page.evaluate(async species => {
    const { createAnimal, disposeAnimal } = await import('/NewDawn/src/animal-assets.ts');
    const { attachAuthoredAnimal } = await import('/NewDawn/src/authored-animal.ts');
    const errors: string[] = [];
    const first = createAnimal(species, 0);
    attachAuthoredAnimal(first, species, 0, error => errors.push(String(error)));
    const deadline = performance.now() + 30000;
    while (!errors.length && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    const fallbackVisible = first.children.some(child => child.visible);
    const second = createAnimal(species, 1);
    attachAuthoredAnimal(second, species, 1, error => errors.push(String(error)));
    while (!second.getObjectByName('authored-animal') && performance.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const retried = !!second.getObjectByName('authored-animal');
    const disposedEarly = createAnimal(species, 2);
    attachAuthoredAnimal(disposedEarly, species, 2, error => errors.push(String(error)));
    disposeAnimal(disposedEarly);
    await new Promise(resolve => setTimeout(resolve, 200));
    const addedAfterDisposal = !!disposedEarly.getObjectByName('authored-animal');
    disposeAnimal(first);
    disposeAnimal(second);
    return { errors, fallbackVisible, retried, addedAfterDisposal };
  }, animal.species);
  expect(result.errors).toHaveLength(1);
  expect(result.fallbackVisible).toBe(true);
  expect(result.retried).toBe(true);
  expect(result.addedAfterDisposal).toBe(false);
  expect(requests).toBe(2);
});

test('preserves animal identities and health when loading a version 12 save', async ({ page }) => {
  await page.goto('./');
  await page.locator('#newGame').click();
  await expect.poll(async () => (await state(page)).terrainReady, { timeout: 30000 }).toBe(true);
  const scene = await state(page);
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  const identities = await page.evaluate(angle => new Promise<{ id: string; species: string; health: number }[]>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('saves', 'readwrite');
      const store = tx.objectStore('saves');
      const get = store.get('primary');
      let identities: { id: string; species: string; health: number }[] = [];
      get.onsuccess = () => {
        const save = get.result;
        const sheep = save.wildlife.find((animal: Animal) => animal.species === 'sheep');
        const rabbit = save.wildlife.find((animal: Animal) => animal.species === 'rabbit');
        const cow = save.wildlife.find((animal: Animal) => animal.species === 'cow');
        const squirrel = save.wildlife.find((animal: Animal) => animal.species === 'squirrel');
        const wolf = save.wildlife.find((animal: Animal) => animal.species === 'wolf');
        const fox = save.wildlife.find((animal: Animal) => animal.species === 'fox');
        const deer = save.wildlife.find((animal: Animal) => animal.species === 'deer');
        const moose = save.wildlife.find((animal: Animal) => animal.species === 'moose');
        const bear = save.wildlife.find((animal: Animal) => animal.species === 'bear');
        const reindeer = save.wildlife.find((animal: Animal) => animal.species === 'reindeer');
        if (!sheep || !rabbit || !cow || !squirrel || !wolf || !fox || !deer || !moose || !bear || !reindeer) { tx.abort(); return; }
        sheep.health = 2;
        cow.health = 3;
        wolf.health = 2;
        fox.health = 1;
        deer.health = 2;
        moose.health = 4;
        reindeer.health = 2;
        for (const [index, animal] of [sheep, rabbit, cow, squirrel, deer, moose, reindeer].entries()) {
          const side = (index - 1) * 2;
          animal.x = save.player.x - Math.sin(angle) * 5 + Math.cos(angle) * side;
          animal.z = save.player.z - Math.cos(angle) * 5 - Math.sin(angle) * side;
          animal.homeX = animal.x;
          animal.homeZ = animal.z;
          animal.behavior = 'rest';
          animal.decisionTimer = 60;
          delete animal.geographic;
        }
        wolf.x = save.player.x + Math.sin(angle) * 20;
        wolf.z = save.player.z + Math.cos(angle) * 20;
        wolf.homeX = wolf.x;
        wolf.homeZ = wolf.z;
        wolf.behavior = 'rest';
        wolf.decisionTimer = 60;
        delete wolf.geographic;
        fox.x = save.player.x + Math.sin(angle) * 25;
        fox.z = save.player.z + Math.cos(angle) * 25;
        fox.homeX = fox.x;
        fox.homeZ = fox.z;
        fox.behavior = 'rest';
        fox.decisionTimer = 60;
        delete fox.geographic;
        bear.health = 5;
        bear.x = save.player.x + Math.sin(angle) * 30;
        bear.z = save.player.z + Math.cos(angle) * 30;
        bear.homeX = bear.x;
        bear.homeZ = bear.z;
        bear.behavior = 'rest';
        bear.decisionTimer = 60;
        delete bear.geographic;
        save.wildlife = [sheep, rabbit, cow, squirrel, deer, moose, reindeer, wolf, fox, bear];
        identities = save.wildlife.map(({ id, species, health }: Animal) => ({ id, species, health }));
        save.version = 12;
        save.selectedWeapon = 'fists';
        delete save.treeHarvest;
        store.put(save, 'primary');
      };
      tx.oncomplete = () => { db.close(); resolve(identities); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Legacy wildlife fixture aborted')); };
    };
  }), scene.cameraAngle);
  await page.reload();
  await page.locator('#continueGame').click();
  await expect.poll(async () => (await state(page)).wildlife.map(({ id, species, health, authored }) =>
    ({ id, species, health, authored })), { timeout: 30000 }).toEqual(identities.map(animal => ({ ...animal, authored: true })));
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  const saved = await page.evaluate(() => new Promise<{ version: number; backup: number; wildlife: Animal[] }>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const store = db.transaction('saves').objectStore('saves');
      const primary = store.get('primary');
      const backup = store.get('pre-timber-backup');
      primary.onsuccess = () => {
        backup.onsuccess = () => {
          db.close();
          resolve({ version: primary.result.version, backup: backup.result.version, wildlife: primary.result.wildlife });
        };
        backup.onerror = () => { db.close(); reject(backup.error); };
      };
      primary.onerror = () => { db.close(); reject(primary.error); };
    };
  }));
  expect(saved.version).toBe(13);
  expect(saved.backup).toBe(12);
  expect(saved.wildlife.map(({ id, species, health }) => ({ id, species, health }))).toEqual(identities);
});

for (const scenario of [
  { species: 'fox', name: 'desktop', width: 1280, height: 720, touch: false },
  { species: 'fox', name: 'portrait', width: 390, height: 844, touch: true },
  { species: 'fox', name: 'landscape', width: 844, height: 390, touch: true },
  { species: 'bear', name: 'desktop', width: 1280, height: 720, touch: false },
] as const) {
  test.describe(`${scenario.species} prey ${scenario.name}`, () => {
    test.use({ viewport: { width: scenario.width, height: scenario.height },
      hasTouch: scenario.touch, isMobile: scenario.touch });

    test('prey reacts to an existing predator and both identities survive reload', async ({ page }, testInfo) => {
      test.setTimeout(120000);
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('./');
      await page.locator('#newGame').click();
      await expect.poll(async () => (await state(page)).terrainReady, { timeout: 30000 }).toBe(true);
      const initial = await state(page);
      const angle = initial.cameraAngle;
      await page.locator('#pauseButton').click();
      await page.locator('#cameraFollow').uncheck();
      await page.locator('#cameraDistance').fill('5');
      await page.locator('#resumeGame').click();
      await walkTo(page, { x: initial.player.x - Math.cos(angle) * 9, z: initial.player.z + Math.sin(angle) * 9 }, scenario.touch);
      await page.locator('#pauseButton').click();
      await page.locator('#saveGame').click();
      await expect(page.locator('#toast')).toHaveText('World saved');
      const identities = await page.evaluate(({ species, angle }) => new Promise<{
        deer: { id: string; x: number; z: number }; predator: string;
      }>((resolve, reject) => {
        const request = indexedDB.open('new-dawn', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('saves', 'readwrite');
          const store = tx.objectStore('saves');
          const get = store.get('primary');
          let identities: { deer: { id: string; x: number; z: number }; predator: string };
          get.onsuccess = () => {
            const save = get.result;
            const deer = save.wildlife.find((animal: Animal) => animal.species === 'deer');
            const predator = save.wildlife.find((animal: Animal) => animal.species === species);
            if (!deer || !predator) { tx.abort(); return; }
            for (const [animal, distance, side] of [[deer, 9.5, 1.6], [predator, 8, -1.6]] as const) {
              animal.x = save.player.x - Math.sin(angle) * distance + Math.cos(angle) * side;
              animal.z = save.player.z - Math.cos(angle) * distance - Math.sin(angle) * side;
              animal.homeX = animal.x;
              animal.homeZ = animal.z;
              animal.behavior = 'rest';
              animal.decisionTimer = 60;
              delete animal.geographic;
            }
            save.wildlife = [deer, predator];
            save.calendar.minute = 720;
            save.calendar.speed = 0.5;
            identities = { deer: { id: deer.id, x: deer.x, z: deer.z }, predator: predator.id };
            store.put(save, 'primary');
          };
          tx.oncomplete = () => { db.close(); resolve(identities); };
          tx.onerror = () => { db.close(); reject(tx.error); };
          tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Predator fixture aborted')); };
        };
      }), { species: scenario.species, angle });
      await page.reload();
      await page.locator('#continueGame').click();
      await expect.poll(async () => {
        const current = await state(page);
        const deer = current.wildlife.find(animal => animal.id === identities.deer.id);
        const predator = current.wildlife.find(animal => animal.id === identities.predator);
        return deer && predator && deer.behavior === 'flee' && predator.behavior === 'chase'
          && Math.hypot(deer.x - current.player.x, deer.z - current.player.z) > 4
          && Math.hypot(predator.x - current.player.x, predator.z - current.player.z) > 7
          && Math.hypot(deer.x - predator.x, deer.z - predator.z) < 5;
      }, { timeout: 10000, intervals: [50] }).toBe(true);
      await expect.poll(async () => {
        const deer = (await state(page)).wildlife.find(animal => animal.id === identities.deer.id);
        return deer ? Math.hypot(deer.x - identities.deer.x, deer.z - identities.deer.z) : 0;
      }).toBeGreaterThan(0.2);
      await expect.poll(async () => (await state(page)).wildlife.find(animal => animal.id === identities.deer.id)?.authored,
        { timeout: 30000 }).toBe(true);
      await expect.poll(async () => (await state(page)).wildlife.find(animal => animal.id === identities.predator)?.authored,
        { timeout: 30000 }).toBe(true);
      await page.waitForTimeout(500);
      await page.screenshot({ path: testInfo.outputPath('predator-prey.png') });
      await page.locator('#pauseButton').click();
      const saved = (await state(page)).wildlife.map(({ id, species, health }) => ({ id, species, health }));
      expect(saved.map(animal => animal.id)).toEqual([identities.deer.id, identities.predator]);
      await page.locator('#saveGame').click();
      await expect(page.locator('#toast')).toHaveText('World saved');
      expect(await savedAnimalIdentities(page)).toEqual(saved);
      await page.reload();
      await page.locator('#continueGame').click();
      await expect.poll(async () => (await state(page)).wildlife.map(({ id, species }) => ({ id, species })),
        { timeout: 30000 }).toEqual(saved.map(({ id, species }) => ({ id, species })));
      const reloaded = (await state(page)).wildlife;
      expect(reloaded.every(animal => animal.health <= saved.find(item => item.id === animal.id)!.health)).toBe(true);
      expect(errors).toEqual([]);
    });
  });
}

test('turns an approaching wolf smoothly without changing its chase behavior', async ({ page }, testInfo) => {
  test.setTimeout(120000);
  const id = await prepareAnimalScene(page, 'wolf', { side: -4, distance: 7 });
  await expect.poll(async () => (await state(page)).wildlife.find(animal => animal.id === id), { timeout: 30000 })
    .toMatchObject({ species: 'wolf', authored: true, animation: 'idle' });
  const idle = (await state(page)).wildlife.find(animal => animal.id === id)!;
  expect(Math.abs(Math.atan2(Math.sin(idle.heading - idle.visualHeading!),
    Math.cos(idle.heading - idle.visualHeading!)))).toBeLessThan(0.001);
  await page.locator('#pauseButton').click();
  await page.locator('#cameraFollow').uncheck();
  await page.locator('#resumeGame').click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: testInfo.outputPath('idle.png') });
  const scene = await state(page);
  const animal = scene.wildlife.find(candidate => candidate.id === id)!;
  const dx = animal.x - scene.player.x;
  const dz = animal.z - scene.player.z;
  const x = dx * Math.cos(scene.cameraAngle) - dz * Math.sin(scene.cameraAngle);
  const y = dx * Math.sin(scene.cameraAngle) + dz * Math.cos(scene.cameraAngle);
  const largest = Math.max(Math.abs(x), Math.abs(y));
  const keys = [
    ...(Math.abs(x) > largest * 0.4 ? [x > 0 ? 'd' : 'a'] : []),
    ...(Math.abs(y) > largest * 0.4 ? [y > 0 ? 's' : 'w'] : []),
  ];
  const observations = page.evaluate(id => new Promise<Array<{ behavior: string; heading: number; visualHeading: number | null }>>(resolve => {
    const samples: Array<{ behavior: string; heading: number; visualHeading: number | null }> = [];
    let start = 0;
    const sample = (now: number) => {
      if (!start) start = now;
      const state = (window as Window & { __newDawnState: () => State }).__newDawnState();
      const animal = state.wildlife.find(candidate => candidate.id === id);
      if (animal) samples.push({ behavior: animal.behavior, heading: animal.heading, visualHeading: animal.visualHeading });
      if (now - start < 2500) requestAnimationFrame(sample);
      else resolve(samples);
    };
    requestAnimationFrame(sample);
  }), id);
  for (const key of keys) await page.keyboard.down(key);
  try {
    await expect.poll(async () => (await state(page)).wildlife.find(animal => animal.id === id)?.behavior,
      { timeout: 10000, intervals: [50] }).toBe('chase');
  } finally {
    for (const key of keys) await page.keyboard.up(key);
  }
  await page.screenshot({ path: testInfo.outputPath('turn-start.png') });
  await page.waitForTimeout(100);
  await page.screenshot({ path: testInfo.outputPath('turn-middle.png') });
  await page.waitForTimeout(200);
  await page.screenshot({ path: testInfo.outputPath('turn-end.png') });
  const chase = (await observations).filter(sample => sample.behavior === 'chase' && sample.visualHeading !== null);
  expect(chase.length).toBeGreaterThan(5);
  const errors = chase.map(sample => Math.abs(Math.atan2(
    Math.sin(sample.heading - sample.visualHeading!), Math.cos(sample.heading - sample.visualHeading!))));
  expect(Math.max(...errors)).toBeGreaterThan(0.2);
  expect(errors[errors.length - 1]).toBeLessThan(0.15);
});

for (const predator of [
  { species: 'wolf', health: 3 },
  { species: 'fox', health: 2 },
  { species: 'bear', health: 6 },
] as const) for (const viewport of [
  { name: 'desktop', width: 1280, height: 720, touch: false },
  { name: 'portrait', width: 390, height: 844, touch: true },
  { name: 'landscape', width: 844, height: 390, touch: true },
]) {
  test.describe(`${predator.species} ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.touch, isMobile: viewport.touch });

    test(`approaches a ${predator.species}, experiences its chase and attack, and reloads`, async ({ page }, testInfo) => {
      test.setTimeout(120000);
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      const id = await prepareAnimalScene(page, predator.species);
      await expect.poll(async () => (await state(page)).wildlife.find(animal => animal.id === id), { timeout: 30000 })
        .toMatchObject({ species: predator.species, health: predator.health, authored: true, animation: 'idle' });
      await page.screenshot({ path: testInfo.outputPath('normal.png') });
      const activate = async (selector: string) => {
        if (viewport.touch) await page.locator(selector).tap();
        else await page.locator(selector).click();
      };
      await activate('#pauseButton');
      await page.locator('#cameraDistance').fill('5');
      await activate('#resumeGame');
      await page.waitForTimeout(500);
      await page.screenshot({ path: testInfo.outputPath('close.png') });
      const before = await state(page);
      let stop: () => Promise<void>;
      if (viewport.touch) {
        const cdp = await page.context().newCDPSession(page);
        const box = await page.locator('#joystick').boundingBox();
        if (!box) throw new Error('Joystick is not visible');
        const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...center, id: 1 }] });
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove', touchPoints: [{ x: center.x, y: center.y - 36, id: 1 }],
        });
        stop = async () => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach(); };
      } else {
        await page.keyboard.down('w');
        stop = () => page.keyboard.up('w');
      }
      try {
        await expect.poll(async () => (await state(page)).wildlife.find(animal => animal.id === id),
          { timeout: 10000, intervals: [50] }).toMatchObject({ behavior: 'chase', animation: 'trot' });
      } finally {
        await stop();
      }
      await page.screenshot({ path: testInfo.outputPath('chase.png') });
      await expect.poll(async () => (await state(page)).health, { timeout: 10000 }).toBeLessThan(before.health);
      await expect(page.locator('#toast')).toHaveText(`A ${predator.species} attacked!`);
      await page.screenshot({ path: testInfo.outputPath('attack.png') });
      await page.waitForTimeout(1000);
      const after = await state(page);
      expect(Math.hypot(after.player.x - before.player.x, after.player.z - before.player.z)).toBeGreaterThan(0.5);
      const attacker = after.wildlife.find(animal => animal.id === id)!;
      expect(Math.hypot(after.player.x - attacker.x, after.player.z - attacker.z))
        .toBeGreaterThanOrEqual((predator.species === 'bear' ? 1.3 : 0.9) - 0.02);
      await activate('#pauseButton');
      const savedHealth = (await state(page)).health;
      await activate('#saveGame');
      await expect(page.locator('#toast')).toHaveText('World saved');
      await page.reload();
      await activate('#continueGame');
      await expect.poll(async () => (await state(page)).wildlife.find(animal => animal.id === id), { timeout: 30000 })
        .toMatchObject({ species: predator.species, health: predator.health, authored: true });
      expect((await state(page)).health).toBeLessThanOrEqual(savedHealth);
      expect(errors).toEqual([]);
    });
  });
}

for (const viewport of [
  { name: 'portrait', width: 390, height: 844 },
  { name: 'landscape', width: 844, height: 390 },
]) {
  test.describe(`touch-emulated ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: true, isMobile: true });

    for (const animal of [
      { species: 'sheep', moving: 'trot', health: 3 },
      { species: 'rabbit', moving: 'hop', health: 1 },
      { species: 'cow', moving: 'trot', health: 4 },
      { species: 'squirrel', moving: 'run', health: 1 },
      { species: 'deer', moving: 'trot', health: 3 },
      { species: 'moose', moving: 'trot', health: 5 },
      { species: 'reindeer', moving: 'trot', health: 3 },
    ] as const) test(`observes a ${animal.species}, approaches with the joystick and reloads`, async ({ page }, testInfo) => {
      test.setTimeout(120000);
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      const id = await prepareAnimalScene(page, animal.species);
      await expect.poll(async () => (await state(page)).wildlife.find(animal => animal.id === id), { timeout: 30000 })
        .toMatchObject({ authored: true, animation: 'idle' });
      if (animal.species === 'rabbit' || animal.species === 'squirrel') {
        await page.locator('#pauseButton').tap();
        await page.locator('#cameraDistance').fill('5');
        await page.locator('#resumeGame').tap();
      }
      await page.waitForTimeout(1000);
      await page.screenshot({ path: testInfo.outputPath(`${animal.species}.png`) });
      const before = (await state(page)).wildlife.find(animal => animal.id === id)!;
      const cdp = await page.context().newCDPSession(page);
      try {
        const box = await page.locator('#joystick').boundingBox();
        if (!box) throw new Error('Joystick is not visible');
        const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...center, id: 1 }] });
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove', touchPoints: [{ x: center.x, y: center.y - 36, id: 1 }],
        });
        await page.waitForTimeout(1600);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } finally {
        await cdp.detach();
      }
      await expect.poll(async () => (await state(page)).wildlife.find(animal => animal.id === id))
        .toMatchObject({ behavior: 'flee', animation: animal.moving });
      const after = (await state(page)).wildlife.find(animal => animal.id === id)!;
      expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(0.1);
      await page.screenshot({ path: testInfo.outputPath('fleeing.png') });
      await page.locator('#pauseButton').tap();
      await page.locator('#saveGame').tap();
      await expect(page.locator('#toast')).toHaveText('World saved');
      await page.reload();
      await page.locator('#continueGame').tap();
      await expect.poll(async () => (await state(page)).wildlife.find(animal => animal.id === id), { timeout: 30000 })
        .toMatchObject({ species: animal.species, health: animal.health, authored: true });
      expect(errors).toEqual([]);
    });
  });
}

for (const animal of [
  { species: 'sheep', file: 'sheep.glb', health: 3, side: 0 },
  { species: 'rabbit', file: 'mountain-hare.glb', health: 1, side: 0.8 },
  { species: 'cow', file: 'dairy-cow.glb', health: 4, side: 0 },
  { species: 'squirrel', file: 'red-squirrel.glb', health: 1, side: 1.2 },
  { species: 'wolf', file: 'gray-wolf.glb', health: 3, side: 1.2 },
  { species: 'fox', file: 'red-fox.glb', health: 2, side: 1.2 },
  { species: 'deer', file: 'roe-deer.glb', health: 3, side: 0 },
  { species: 'moose', file: 'moose.glb', health: 5, side: -1.2 },
  { species: 'bear', file: 'grizzly-bear.glb', health: 6, side: 1.2 },
  { species: 'reindeer', file: 'reindeer.glb', health: 3, side: 0 },
] as const) test(`continues offline with the bundled ${animal.species} and its saved identity`, async ({ browser }, testInfo) => {
  test.setTimeout(120000);
  const portServer = createServer();
  await new Promise<void>(resolve => portServer.listen(0, '127.0.0.1', resolve));
  const port = (portServer.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => portServer.close(error => error ? reject(error) : resolve()));
  const preview = spawn(process.execPath, [
    resolve('node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort',
  ], { stdio: 'ignore' });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && message.text().includes(`Could not load authored ${animal.species}`)) {
      errors.push(message.text());
    }
  });
  try {
    await expect.poll(async () => {
      if (preview.exitCode !== null) throw new Error(`Preview exited: ${preview.exitCode}`);
      try { return (await fetch(`http://127.0.0.1:${port}/NewDawn/`)).status; } catch { return 0; }
    }, { timeout: 30000 }).toBe(200);
    await page.goto(`http://127.0.0.1:${port}/NewDawn/`);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
      }
    });
    await page.locator('#newGame').click();
    await page.locator('#pauseButton').click();
    await page.locator('#cameraFollow').uncheck();
    await page.locator('#saveGame').click();
    await expect(page.locator('#toast')).toHaveText('World saved');
    const id = await page.evaluate(({ species, side }) => new Promise<string>((resolve, reject) => {
      const request = indexedDB.open('new-dawn', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('saves', 'readwrite');
        const store = tx.objectStore('saves');
        const get = store.get('primary');
        let animalId = '';
        get.onsuccess = () => {
          const save = get.result;
          const selected = save.wildlife.find((candidate: Animal) => candidate.species === species);
          if (!selected) { tx.abort(); return; }
          animalId = selected.id;
          const distance = species === 'wolf' || species === 'fox' || species === 'bear' ? 8 : 5;
          selected.x = save.player.x - Math.sin(0.78) * distance + Math.cos(0.78) * side;
          selected.z = save.player.z - Math.cos(0.78) * distance - Math.sin(0.78) * side;
          selected.homeX = selected.x;
          selected.homeZ = selected.z;
          selected.heading = 0.78 + Math.PI / 2;
          selected.behavior = 'rest';
          selected.decisionTimer = 60;
          delete selected.geographic;
          save.wildlife = [selected];
          save.calendar.minute = 720;
          store.put(save, 'primary');
        };
        tx.oncomplete = () => { db.close(); resolve(animalId); };
        tx.onerror = () => { db.close(); reject(tx.error); };
        tx.onabort = () => { db.close(); reject(tx.error ?? new Error('No animal in production save')); };
      };
    }), { species: animal.species, side: animal.side });
    await context.setOffline(true);
    await page.reload();
    const assetResponse = page.waitForResponse(response => response.url().endsWith(`/assets/animals/${animal.file}`));
    await page.locator('#continueGame').click();
    const response = await assetResponse;
    expect(response.status()).toBe(200);
    expect(response.fromServiceWorker()).toBe(true);
    expect((await response.body()).subarray(0, 4).toString()).toBe('glTF');
    if (animal.species === 'squirrel' || animal.species === 'wolf' || animal.species === 'bear') {
      const name = animal.species === 'wolf' ? 'Wolf' : animal.species === 'bear' ? 'Bear' : 'Squirrel';
      const file = animal.species === 'wolf' ? 'gray-wolf-LICENSE.txt'
        : animal.species === 'bear' ? 'grizzly-bear-LICENSE.txt' : 'red-squirrel-LICENSE.txt';
      await page.locator('#pauseButton').click();
      const credit = page.getByRole('link', { name: `${name} model: vinish.dev (CC BY 4.0)` });
      await expect(credit).toHaveAttribute('href', `/NewDawn/assets/animals/${file}`);
      const licenseResponse = page.waitForResponse(item => item.url().endsWith(`/assets/animals/${file}`));
      const text = await page.evaluate(async license => (await fetch(`./assets/animals/${license}`)).text(), file);
      expect((await licenseResponse).fromServiceWorker()).toBe(true);
      expect(text).toContain('Creative Commons Attribution 4.0');
      expect(text).toContain('geometry simplified');
      await page.locator('#resumeGame').click();
    }
    await page.waitForTimeout(3500);
    await page.screenshot({ path: testInfo.outputPath(`offline-${animal.species}.png`) });
    await page.locator('#pauseButton').click();
    await page.locator('#saveGame').click();
    await expect(page.locator('#toast')).toHaveText('World saved');
    const saved = await page.evaluate(() => new Promise<Animal[]>((resolve, reject) => {
      const request = indexedDB.open('new-dawn', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const get = db.transaction('saves').objectStore('saves').get('primary');
        get.onsuccess = () => { db.close(); resolve(get.result.wildlife); };
        get.onerror = () => { db.close(); reject(get.error); };
      };
    }));
    expect(saved).toEqual([expect.objectContaining({ id, species: animal.species, health: animal.health })]);
    expect(errors).toEqual([]);
  } finally {
    await context.setOffline(false);
    await context.close();
    if (preview.exitCode === null) {
      const exited = new Promise<void>(resolve => preview.once('exit', () => resolve()));
      preview.kill('SIGTERM');
      await exited;
    }
  }
});
