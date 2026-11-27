import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { PLANET_HEIGHT, PLANET_WIDTH, planetDistanceMeters } from '../src/planet';
import { celestialState } from '../src/sky';

type PlayerSnapshot = {
  player: { x: number; y: number; z: number };
  cameraAngle: number;
  roads: Array<{ id: string; x: number; z: number; modelX: number; modelZ: number }>;
  paintMarkers: Array<{ pieceId: string; x: number; z: number }>;
  powerLines: Array<{ x: number; y: number; z: number;
    first: { x: number; y: number; z: number }; second: { x: number; y: number; z: number } }>;
  lighting: {
    minute: number; day: number; latitude: number;
    sun: { x: number; y: number; z: number; targetX: number; targetY: number; targetZ: number; targetInScene: boolean };
    moon: { x: number; y: number; z: number; targetX: number; targetY: number; targetZ: number; targetInScene: boolean };
  };
};
type Fixture = {
  seed: number;
  version: number;
  planetPositions?: unknown;
  player: { x: number; y: number; z: number };
  npc: { x: number; z: number };
  vehicle: { x: number; z: number };
  torch?: { crafted: boolean; equipped: boolean; lit: boolean };
  wildlife: unknown[];
  depleted: string[];
  mining: Record<string, number>;
  calendar: { minute: number };
  buildings: Array<{ kind: string; x: number; z: number; y: number; rotation: number; charge: number }>;
  roads?: Array<{ id: string; kind: string; x: number; z: number; height: number; rotation: number; width: number }>;
  paint?: Array<{ pieceId: string; surface: string; color: string;
    strokes: Array<{ x: number; y: number; color: string; size: number }> }>;
  structures: Array<{ id: string; kind: string; x: number; y: number; z: number; level: number; rotation: number; open: boolean }>;
};

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('roads and painted structures across the longitude seam survive travel and reload', async ({ page }) => {
  await page.goto('./');
  await page.locator('#newGame').click();
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  const expected = await page.evaluate(async () => {
    const { PLANET_WIDTH, geographicToPlanetPosition } = await import('/NewDawn/src/planet.ts');
    const { terrainHeight, World } = await import('/NewDawn/src/world.ts');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('new-dawn', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const record = await new Promise<Fixture>((resolve, reject) => {
      const request = db.transaction('saves').objectStore('saves').get('primary');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const x = -PLANET_WIDTH / 2 + 4;
    let z: number | undefined;
    for (let latitude = -40; latitude <= 40; latitude += 2) {
      const candidate = Math.round(geographicToPlanetPosition(latitude, 0).z / 2) * 2;
      if (terrainHeight(x, candidate, record.seed) > 1
        && terrainHeight(PLANET_WIDTH / 2 - 4, candidate, record.seed) > 1) {
        z = candidate;
        break;
      }
    }
    if (z === undefined) throw new Error('No dry longitude-seam location');
    record.version = 11;
    delete record.planetPositions;
    record.player = { x, y: terrainHeight(x, z, record.seed), z };
    record.npc = { x: x - 40, z: z + 40 };
    record.vehicle = { x: x - 50, z: z + 50 };
    record.wildlife = [];
    record.calendar.minute = 720;
    const world = new World(record.seed);
    world.updateChunks(x, z, true);
    record.depleted = world.group.children.filter(object => object.userData.resourceId
      && Math.hypot(object.position.x - x, object.position.z - z) < 30).map(object => object.userData.resourceId as string);
    for (const object of world.group.children) {
      if (object.userData.depositId && Math.hypot(object.position.x - x, object.position.z - z) < 30) {
        record.mining[object.userData.depositId as string] = 3;
      }
    }
    world.dispose();
    record.roads = [2, 4].map(offset => ({
      id: `seam-road-${offset}`, kind: 'dirt', x: PLANET_WIDTH / 2 - offset, z: z - 4,
      height: terrainHeight(PLANET_WIDTH / 2 - offset, z - 4, record.seed), rotation: 0, width: 2,
    }));
    record.structures = [{ id: 'seam-wall', kind: 'wall', x: PLANET_WIDTH / 2 - 2, z: z - 7,
      y: terrainHeight(PLANET_WIDTH / 2 - 2, z - 7, record.seed), level: 0, rotation: 0, open: false }];
    record.paint = [{ pieceId: 'seam-wall', surface: 'front', color: '#a94f43',
      strokes: [{ x: 0.5, y: 0.5, color: '#a94f43', size: 0.3 }] }];
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('saves', 'readwrite');
      tx.objectStore('saves').put(record, 'primary');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return { roads: record.roads, wall: record.structures[0], width: PLANET_WIDTH };
  });
  await page.reload();
  await page.locator('#continueGame').click();
  const snapshot = () => page.evaluate(() => (window as Window & { __newDawnState: () => PlayerSnapshot }).__newDawnState());
  await expect.poll(async () => (await snapshot()).roads[0]?.x).toBe(expected.roads[0].x - expected.width);
  const before = await snapshot();
  for (const [index, road] of before.roads.entries()) {
    expect(road.x).toBe(expected.roads[index].x - expected.width);
    expect(road.z).toBe(expected.roads[index].z);
    expect(road.modelX).toBe(road.x);
    expect(road.modelZ).toBe(road.z);
    expect(planetDistanceMeters(road, expected.roads[index])).toBeLessThan(0.01);
  }
  expect(before.paintMarkers).toHaveLength(1);
  expect(before.paintMarkers[0].pieceId).toBe(expected.wall.id);
  expect(before.paintMarkers[0].x).toBe(expected.wall.x - expected.width);
  expect(before.paintMarkers[0].z).toBeCloseTo(expected.wall.z + 0.09, 6);
  const review = join(process.cwd(), 'art-review', 'batch-005c');
  await mkdir(review, { recursive: true });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: join(review, 'seam-roads.png') });
  await page.locator('#pauseButton').click();
  await page.locator('#cameraFollow').uncheck();
  await page.locator('#resumeGame').click();
  const joystick = (await page.locator('#joystick').boundingBox())!;
  const stick = {
    id: 1,
    x: joystick.x + joystick.width / 2 - Math.cos(before.cameraAngle) * 32,
    y: joystick.y + joystick.height / 2 - Math.sin(before.cameraAngle) * 32,
  };
  const touch = await page.context().newCDPSession(page);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [stick] });
  await expect.poll(async () => (await snapshot()).player.x, { timeout: 8000 }).toBeLessThan(-expected.width / 2 - 1);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [stick] });
  await touch.detach();
  const acrossSeam = await snapshot();
  for (const light of [acrossSeam.lighting.sun, acrossSeam.lighting.moon]) {
    expect(light.targetInScene).toBe(true);
    expect(light.targetX).toBeCloseTo(acrossSeam.player.x, 5);
    expect(light.targetY).toBeCloseTo(acrossSeam.player.y, 5);
    expect(light.targetZ).toBeCloseTo(acrossSeam.player.z, 5);
  }
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.reload();
  await page.locator('#continueGame').click();
  await expect.poll(async () => (await snapshot()).roads).toEqual(before.roads);
  expect((await snapshot()).paintMarkers).toEqual(before.paintMarkers);
  await page.locator('#toolHubButton').tap();
  await page.locator('[data-hub="road"]').tap();
  for (const point of [{ x: 25, y: 380 }, { x: 25, y: 480 }, { x: 25, y: 570 }]) {
    await page.touchscreen.tap(point.x, point.y);
    if ((await page.locator('#roadStatus').innerText()).includes('road placed')) break;
  }
  await expect(page.locator('#roadStatus')).toContainText('road placed');
  await page.locator('#roadExit').tap();
  const afterPlacement = await snapshot();
  expect(afterPlacement.roads).toHaveLength(3);
  await page.locator('#pauseButton').tap();
  await page.locator('#saveGame').tap();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.reload();
  await page.locator('#continueGame').tap();
  await expect.poll(async () => (await snapshot()).roads).toEqual(afterPlacement.roads);
});

for (const pole of [{ name: 'north', sign: 1 }, { name: 'south', sign: -1 }]) {
  test(`road projection survives a reflected ${pole.name}-pole save and reload`, async ({ page }) => {
    await page.goto('./');
    await page.locator('#newGame').click();
    await page.locator('#pauseButton').click();
    await page.locator('#saveGame').click();
    await expect(page.locator('#toast')).toHaveText('World saved');
    const originalRoad = await page.evaluate(async ({ height, width, sign }) => {
      const { terrainHeight } = await import('/NewDawn/src/world.ts');
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('new-dawn', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const record = await new Promise<Fixture>((resolve, reject) => {
        const request = db.transaction('saves').objectStore('saves').get('primary');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      record.seed = 500;
      record.calendar.minute = 720;
      const z = sign * (height / 2 + 4);
      const road = { id: 'polar-road', kind: 'dirt', x: -width / 2, z: sign * (height / 2 - 6),
        height: terrainHeight(0, sign * (height / 2 + 6), record.seed), rotation: 0, width: 2 };
      record.version = 11;
      delete record.planetPositions;
      record.player = { x: 0, y: terrainHeight(0, z, record.seed), z };
      record.npc = { x: 30, z: z + 30 };
      record.vehicle = { x: 40, z: z + 40 };
      record.wildlife = [];
      record.roads = [road];
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('saves', 'readwrite');
        tx.objectStore('saves').put(record, 'primary');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      return road;
    }, { height: PLANET_HEIGHT, width: PLANET_WIDTH, sign: pole.sign });
    await page.reload();
    await page.locator('#continueGame').click();
    const snapshot = () => page.evaluate(() => (window as Window & { __newDawnState: () => PlayerSnapshot }).__newDawnState());
    await expect.poll(async () => (await snapshot()).roads[0]?.x).toBe(0);
    const road = (await snapshot()).roads[0];
    expect(road.z).toBe(pole.sign * (PLANET_HEIGHT / 2 + 6));
    expect(road.modelX).toBe(road.x);
    expect(road.modelZ).toBe(road.z);
    expect(planetDistanceMeters(road, originalRoad)).toBeLessThan(0.01);
    const review = join(process.cwd(), 'art-review', 'batch-005c');
    await mkdir(review, { recursive: true });
    await page.screenshot({ path: join(review, `reflected-${pole.name}-pole.png`) });
    await page.locator('#toolHubButton').tap();
    await page.locator('[data-hub="terrain"]').tap();
    await page.locator('[data-terrain="raise"]').tap();
    for (const point of [{ x: 25, y: 380 }, { x: 25, y: 480 }, { x: 25, y: 570 }]) {
      await page.touchscreen.tap(point.x, point.y);
      if ((await page.locator('#terrainStatus').innerText()).startsWith('RAISE')) break;
    }
    await expect(page.locator('#terrainStatus')).toContainText('RAISE');
    await page.screenshot({ path: join(review, `reflected-${pole.name}-pole-edit.png`) });
    await page.locator('#terrainExit').tap();
    await page.screenshot({ path: join(review, `reflected-${pole.name}-pole-edited.png`) });
    await page.locator('#pauseButton').click();
    await page.locator('#saveGame').click();
    await expect(page.locator('#toast')).toHaveText('World saved');
    const savedTerrain = () => page.evaluate(() => new Promise<Record<string, number>>((resolve, reject) => {
      const request = indexedDB.open('new-dawn', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const get = db.transaction('saves').objectStore('saves').get('primary');
        get.onsuccess = () => { resolve(get.result.terrain); db.close(); };
        get.onerror = () => reject(get.error);
      };
    }));
    const terrain = await savedTerrain();
    expect(Object.values(terrain).some(value => value > 0)).toBe(true);
    await page.reload();
    await page.locator('#continueGame').click();
    await expect.poll(async () => (await snapshot()).roads).toEqual([road]);
    await page.locator('#pauseButton').click();
    await page.locator('#saveGame').click();
    await expect(page.locator('#toast')).toHaveText('World saved');
    expect(await savedTerrain()).toEqual(terrain);
  });
}

test('a structure and terrain edit at high latitude and distant longitude survive save and reload', async ({ page }) => {
  await page.goto('./');
  await page.locator('#newGame').click();
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.locator('#resumeGame').click();
  const wall = await page.evaluate(async () => {
    const { geographicToPlanetPosition } = await import('/NewDawn/src/planet.ts');
    const { terrainHeight } = await import('/NewDawn/src/world.ts');
    const { snapPiece } = await import('/NewDawn/src/construction.ts');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('new-dawn', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const record = await new Promise<Fixture>((resolve, reject) => {
      const request = db.transaction('saves').objectStore('saves').get('primary');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    let location: { x: number; z: number } | undefined;
    for (let longitude = -175; longitude <= -100; longitude += 5) {
      const candidate = geographicToPlanetPosition(75, longitude);
      if (terrainHeight(candidate.x, candidate.z, record.seed) > 1) { location = candidate; break; }
    }
    if (!location) throw new Error('No dry high-latitude test location');
    const edge = snapPiece('wall', location.x, location.z, 1);
    const x = edge.x + 3;
    const z = edge.z + 2;
    const y = terrainHeight(x, z, record.seed);
    record.version = 11;
    delete record.planetPositions;
    record.player = { x, y, z };
    record.npc = { x: x + 40, z: z + 40 };
    record.vehicle = { x: x + 50, z: z + 50 };
    record.wildlife = [];
    record.torch = { crafted: true, equipped: true, lit: true };
    record.structures = [{ id: 'latitude-wall', kind: 'wall', ...edge, y, level: 0, rotation: 1, open: false }];
    record.buildings = [0, 1].map(index => ({ kind: 'cable', x: edge.x + 5.25 + 1.25 * index,
      z: edge.z + 3.5 + 0.75 * index, y: terrainHeight(edge.x + 5.25 + 1.25 * index, edge.z + 3.5 + 0.75 * index, record.seed),
      rotation: 0, charge: 0 }));
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('saves', 'readwrite');
      tx.objectStore('saves').put(record, 'primary');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return { edge, cables: record.buildings };
  });
  expect(Math.abs(wall.edge.x)).toBeGreaterThan(10_000_000);
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#joystick')).toBeVisible();
  await page.waitForTimeout(1000);
  const review = join(process.cwd(), 'art-review', 'batch-005c');
  await mkdir(review, { recursive: true });
  await page.screenshot({ path: join(review, 'distant-terrain-precision.png') });
  const snapshot = () => page.evaluate(() => (window as Window & { __newDawnState: () => PlayerSnapshot }).__newDawnState());
  const before = await snapshot();
  for (const light of [before.lighting.sun, before.lighting.moon]) {
    expect(light.targetInScene).toBe(true);
    expect(light.targetX).toBeCloseTo(before.player.x, 5);
    expect(light.targetY).toBeCloseTo(before.player.y, 5);
    expect(light.targetZ).toBeCloseTo(before.player.z, 5);
  }
  const celestial = celestialState(before.lighting.minute, before.lighting.day, before.lighting.latitude);
  for (const [light, direction] of [[before.lighting.sun, celestial.sun], [before.lighting.moon, celestial.moon]] as const) {
    expect(light.x - light.targetX).toBeCloseTo(direction.x * 50, 4);
    expect(light.y - light.targetY).toBeCloseTo(direction.y * 50, 4);
    expect(light.z - light.targetZ).toBeCloseTo(direction.z * 50, 4);
  }
  expect(before.powerLines).toHaveLength(1);
  expect(before.powerLines[0].x).toBeCloseTo(wall.cables[0].x, 5);
  expect(before.powerLines[0].y).toBeCloseTo(wall.cables[0].y + 0.95, 5);
  expect(before.powerLines[0].z).toBeCloseTo(wall.cables[0].z, 5);
  expect(before.powerLines[0].first.x).toBe(0);
  expect(before.powerLines[0].first.y).toBe(0);
  expect(before.powerLines[0].first.z).toBe(0);
  expect(before.powerLines[0].second.x).toBeCloseTo(1.25, 4);
  expect(before.powerLines[0].second.y).toBeCloseTo(wall.cables[1].y - wall.cables[0].y, 4);
  expect(before.powerLines[0].second.z).toBeCloseTo(0.75, 4);
  await page.locator('#toolHubButton').tap();
  await page.locator('[data-hub="terrain"]').tap();
  await page.locator('[data-terrain="raise"]').tap();
  for (const point of [{ x: 25, y: 380 }, { x: 25, y: 480 }, { x: 25, y: 570 }]) {
    await page.touchscreen.tap(point.x, point.y);
    if ((await page.locator('#terrainStatus').innerText()).startsWith('RAISE')) break;
    await page.waitForTimeout(200);
  }
  await expect(page.locator('#terrainStatus')).toContainText('RAISE');
  await page.screenshot({ path: join(review, 'distant-terrain-after-edit.png') });
  await page.locator('#terrainExit').tap();
  await page.locator('#pauseButton').tap();
  await page.locator('#saveGame').tap();
  await expect(page.locator('#toast')).toHaveText('World saved');
  const terrainBefore = await page.evaluate(() => new Promise<Record<string, number>>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const get = db.transaction('saves').objectStore('saves').get('primary');
      get.onsuccess = () => { resolve(get.result.terrain); db.close(); };
      get.onerror = () => reject(get.error);
    };
  }));
  expect(Object.values(terrainBefore).some(value => value > 0)).toBe(true);
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#joystick')).toBeVisible();
  const restored = await snapshot();
  expect(planetDistanceMeters(restored.player, before.player)).toBeLessThan(0.05);
  expect(restored.powerLines).toEqual(before.powerLines);
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  const saved = await page.evaluate(() => new Promise<{ structures: Fixture['structures']; terrain: Record<string, number> }>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const get = db.transaction('saves').objectStore('saves').get('primary');
      get.onsuccess = () => { resolve({ structures: get.result.structures, terrain: get.result.terrain }); db.close(); };
      get.onerror = () => reject(get.error);
    };
  }));
  expect(saved.structures).toHaveLength(1);
  expect(saved.structures[0]).toMatchObject({ id: 'latitude-wall', ...wall.edge });
  expect(saved.terrain).toEqual(terrainBefore);
});

test('raised terrain survives an actual save and reload', async ({ page }) => {
  await page.goto('./');
  await page.locator('#newGame').click();
  await page.locator('#toolHubButton').tap();
  await page.locator('[data-hub="terrain"]').tap();
  await page.locator('[data-terrain="raise"]').tap();
  for (const point of [{ x: 25, y: 380 }, { x: 25, y: 480 }, { x: 25, y: 570 }]) {
    await page.touchscreen.tap(point.x, point.y);
    if ((await page.locator('#terrainStatus').innerText()).startsWith('RAISE')) break;
    await page.waitForTimeout(200);
  }
  await expect(page.locator('#terrainStatus')).toContainText('RAISE');
  await page.locator('#terrainExit').tap();
  await page.locator('#pauseButton').tap();
  await page.locator('#saveGame').tap();
  await expect(page.locator('#toast')).toHaveText('World saved');
  const savedTerrain = () => page.evaluate(() => new Promise<Record<string, number>>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const get = db.transaction('saves').objectStore('saves').get('primary');
      get.onsuccess = () => { resolve(get.result.terrain); db.close(); };
      get.onerror = () => reject(get.error);
    };
  }));
  const before = await savedTerrain();
  expect(Object.values(before).some(value => value > 0)).toBe(true);
  await page.reload();
  await page.locator('#continueGame').tap();
  await expect(page.locator('#joystick')).toBeVisible();
  await page.locator('#pauseButton').tap();
  await page.locator('#saveGame').tap();
  await expect(page.locator('#toast')).toHaveText('World saved');
  expect(await savedTerrain()).toEqual(before);
});
