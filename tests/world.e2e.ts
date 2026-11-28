import { expect, test, type Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { geographicDistanceMeters, moveGeographic } from '../src/geography';
import { geographicToPlanetPosition, PLANET_WIDTH, planetCoordinates, planetPositionToGeographic } from '../src/planet';
import { seededNoise, terrainHeight, vegetationFamilyAt } from '../src/world';

async function save(page: Page) {
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.locator('#resumeGame').click();
}

async function waitForNature(page: Page) {
  await expect.poll(async () => page.evaluate(() => {
    const state = (window as Window & { __newDawnState: () => {
      trees: Array<{ authored: boolean }>; groundArt: { stones: number; grass: number };
    } }).__newDawnState();
    return state.trees.some(tree => tree.authored) && state.groundArt.stones > 0 && state.groundArt.grass > 0;
  }), { timeout: 30000 }).toBe(true);
}

type SavedWorld = { version: number; seed: number; player: { x: number; z: number }; resources: { wood: number };
  terrain: Record<string, number>; npcState: { recruited: boolean }; buildings: Array<{ kind: string; x: number; z: number }>;
  structures: Array<{ id: string; kind: string; roofShape?: unknown }>;
  minerals: { ironOre: number; sand: number; coal: number }; ingots: { iron: number; copper: number; glass?: number };
  mining: Record<string, number>; planetPositions?: { player: { latitude: number; longitude: number };
    vehicle: { latitude: number; longitude: number }; npc?: { latitude: number; longitude: number } } };

async function readRecord(page: Page, key: string) {
  return page.evaluate(key => new Promise<SavedWorld>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const get = db.transaction('saves').objectStore('saves').get(key);
      get.onsuccess = () => { resolve(get.result); db.close(); };
      get.onerror = () => reject(get.error);
    };
  }), key);
}

test('migrates version 8 economy without granting glass and preserves a backup', async ({ page }) => {
  await page.goto('./');
  await page.locator('#newGame').click();
  await save(page);
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('saves', 'readwrite');
      const store = tx.objectStore('saves');
      const get = store.get('primary');
      get.onsuccess = () => {
        const data = get.result;
        data.version = 8;
        delete data.roofStyle;
        delete data.roofAxis;
        data.structures = [
          { id: 'legacy-floor', kind: 'floor', x: 20, z: 20, y: 0, level: 0, rotation: 0, open: false },
          { id: 'legacy-roof', kind: 'roof', x: 20, z: 20, y: 0, level: 0, rotation: 0, open: false, automatic: true },
        ];
        data.minerals.ironOre = 5;
        data.minerals.sand = 3;
        data.minerals.coal = 2;
        data.ingots = { iron: 4, copper: 2 };
        data.mining = { '4,6': 2 };
        store.put(data, 'primary');
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }));
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  await expect(page.locator('#roofStyle')).toHaveValue('flat');
  const backup = await readRecord(page, 'pre-glass-backup');
  expect(backup).toMatchObject({ version: 8, ingots: { iron: 4, copper: 2 },
    minerals: { ironOre: 5, sand: 3, coal: 2 }, mining: { '4,6': 2 } });
  expect(backup.ingots.glass).toBeUndefined();
  expect(backup.structures.find(piece => piece.id === 'legacy-roof')?.roofShape).toBeUndefined();
  await save(page);
  const migrated = await readRecord(page, 'primary');
  expect(migrated).toMatchObject({ version: 13, ingots: { iron: 4, copper: 2, glass: 0 },
    minerals: { ironOre: 5, sand: 3, coal: 2 }, mining: { '4,6': 2 } });
  expect(migrated.structures).toEqual(backup.structures);
});

test('preserves a legacy settlement and walks beyond the old island', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('./');
  await page.locator('#newGame').click();
  await save(page);
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('saves', 'readwrite');
      const store = tx.objectStore('saves');
      const get = store.get('primary');
      get.onsuccess = () => {
        const data = get.result;
        data.version = 5;
        delete data.structures;
        delete data.roofStyle;
        delete data.roofAxis;
        data.resources.wood = 17;
        data.terrain = { '-6,-6': -0.35 };
        data.buildings = [{ kind: 'storage', x: -10, z: -10, y: 1, rotation: 0, charge: 0 }];
        data.npcState = { recruited: true, job: 'idle', carrying: null };
        store.put(data, 'primary');
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }));
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  const backup = await readRecord(page, 'pre-planet-backup');
  expect(backup).toMatchObject({ version: 5, resources: { wood: 17 }, terrain: { '-6,-6': -0.35 },
    npcState: { recruited: true }, buildings: [{ kind: 'storage', x: -10, z: -10 }] });
  await page.locator('#pauseButton').click();
  await page.locator('#cameraFollow').uncheck();
  await page.locator('#resumeGame').click();
  await page.keyboard.down('Shift');
  await page.keyboard.down('s');
  let x = 0;
  for (let attempt = 0; attempt < 15 && x <= 54; attempt++) {
    await page.waitForTimeout(2000);
    await page.keyboard.press('m');
    const text = await page.locator('#atlasCoordinates').innerText();
    const match = /LON (-?\d+(?:\.\d+)?)°/.exec(text);
    if (match) x = Number(match[1]) / 360 * PLANET_WIDTH;
    await page.keyboard.press('Escape');
  }
  await page.keyboard.up('s');
  await page.keyboard.up('Shift');
  expect(x).toBeGreaterThan(54);
  await save(page);
  const traveled = await readRecord(page, 'primary');
  expect(traveled).toMatchObject({ version: 13, resources: { wood: 17 }, terrain: { '-6,-6': -0.35 },
    npcState: { recruited: true }, buildings: [{ kind: 'storage', x: -10, z: -10 }] });
  expect(traveled.player.x).toBeGreaterThan(48);
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  await save(page);
  expect((await readRecord(page, 'primary')).player.x).toBeCloseTo(traveled.player.x, 3);
  expect((await readRecord(page, 'pre-planet-backup')).version).toBe(5);
});

test('crosses the longitude seam and retains a nearby settlement', async ({ page }) => {
  await page.goto('./');
  await page.locator('#newGame').click();
  await save(page);
  const playerGeographic = planetPositionToGeographic(PLANET_WIDTH / 2 - 4, -9_417_544);
  await page.evaluate(({ width, playerGeographic }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('saves', 'readwrite');
      const store = tx.objectStore('saves');
      const get = store.get('primary');
      get.onsuccess = () => {
        const data = get.result;
        data.player.x = width / 2 - 4;
        data.player.z = -9_417_544;
        data.planetPositions.player = playerGeographic;
        data.buildings = [{ kind: 'storage', x: -width / 2 + 5, z: -9_417_544, y: 1, rotation: 0, charge: 0 }];
        data.wildlife = [];
        data.calendar.minute = 720;
        store.put(data, 'primary');
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }), { width: PLANET_WIDTH, playerGeographic });
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  await page.waitForTimeout(500);
  const review = join('art-review', 'batch-005c');
  await mkdir(review, { recursive: true });
  await page.screenshot({ path: join(review, 'antimeridian-gameplay.png') });
  await page.keyboard.down('Shift');
  await page.keyboard.down('d');
  let longitude = PLANET_WIDTH / 2 - 4;
  for (let attempt = 0; attempt < 8 && longitude >= 0; attempt++) {
    await page.waitForTimeout(1000);
    await page.keyboard.press('m');
    const text = await page.locator('#atlasCoordinates').innerText();
    const match = /LON (-?\d+(?:\.\d+)?)°/.exec(text);
    if (match) longitude = Number(match[1]) / 360 * PLANET_WIDTH;
    await page.keyboard.press('Escape');
  }
  await page.keyboard.up('d');
  await page.keyboard.up('Shift');
  expect(longitude).toBeLessThan(0);
  await save(page);
  const saved = await readRecord(page, 'primary');
  expect(saved.player.x).toBeGreaterThan(PLANET_WIDTH / 2);
  expect(Math.abs(saved.buildings[0].x - saved.player.x)).toBeLessThan(20);
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  await save(page);
  expect(Math.abs((await readRecord(page, 'primary')).buildings[0].x - saved.player.x)).toBeLessThan(20);
});

for (const latitude of [60, 85, -85]) {
test(`moves and saves at real meter scale at ${latitude} degrees latitude`, async ({ page }) => {
  await page.goto('./');
  await page.locator('#newGame').click();
  await save(page);
  const original = await readRecord(page, 'primary');
  let start: ReturnType<typeof planetPositionToGeographic> | undefined;
  for (let longitude = -180; longitude < 180; longitude += 5) {
    const projected = geographicToPlanetPosition(latitude, longitude);
    const elevation = terrainHeight(projected.x, projected.z, original.seed);
    if (elevation > 1) {
      start = { ...planetPositionToGeographic(projected.x, projected.z, elevation), latitude, longitude };
      break;
    }
  }
  expect(start).toBeDefined();
  const projected = geographicToPlanetPosition(start!.latitude, start!.longitude);
  const elevation = terrainHeight(projected.x, projected.z, original.seed);
  await page.evaluate(({ x, z, start, elevation }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('saves', 'readwrite');
      const store = tx.objectStore('saves');
      const get = store.get('primary');
      get.onsuccess = () => {
        const data = get.result;
        data.player = { x, y: elevation, z };
        data.planetPositions.player = { ...start, altitude: elevation };
        data.vehicle = { x, z };
        data.planetPositions.vehicle = { ...start, altitude: elevation };
        data.calendar.minute = 720;
        store.put(data, 'primary');
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }), { x: projected.x, z: projected.z, start, elevation });
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  await waitForNature(page);
  await page.keyboard.press('e');
  await page.keyboard.down('w');
  await page.waitForTimeout(1400);
  await page.keyboard.up('w');
  await save(page);
  const driven = await readRecord(page, 'primary');
  expect(geographicDistanceMeters(start!, driven.planetPositions!.vehicle)).toBeGreaterThan(1.5);
  expect(geographicDistanceMeters(start!, driven.planetPositions!.vehicle)).toBeLessThan(9);
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  await waitForNature(page);
  const footStart = driven.planetPositions!.player;
  await page.keyboard.down('w');
  await page.waitForTimeout(1400);
  await page.keyboard.up('w');
  await save(page);
  const moved = await readRecord(page, 'primary');
  expect(moved.version).toBe(13);
  expect(moved.planetPositions).toBeDefined();
  const distance = geographicDistanceMeters(footStart, moved.planetPositions!.player);
  expect(distance).toBeGreaterThan(2);
  expect(distance).toBeLessThan(9);
  const review = join('art-review', 'batch-005c-p3');
  await mkdir(review, { recursive: true });
  await page.screenshot({ path: join(review, `frame-movement-${latitude}.png`) });
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  await save(page);
  const restored = await readRecord(page, 'primary');
  expect(restored.planetPositions!.player.latitude).toBeCloseTo(moved.planetPositions!.player.latitude, 7);
  expect(restored.planetPositions!.player.longitude).toBeCloseTo(moved.planetPositions!.player.longitude, 7);
});
}

test('Mira moves and reloads in canonical meters at high latitude', async ({ page }) => {
  await page.goto('./');
  await page.locator('#newGame').click();
  await save(page);
  const original = await readRecord(page, 'primary');
  let start: ReturnType<typeof planetPositionToGeographic> | undefined;
  for (let longitude = -180; longitude < 180; longitude += 5) {
    const projected = geographicToPlanetPosition(60, longitude);
    const elevation = terrainHeight(projected.x, projected.z, original.seed);
    if (elevation > 1) {
      start = { ...planetPositionToGeographic(projected.x, projected.z, elevation), latitude: 60, longitude };
      break;
    }
  }
  expect(start).toBeDefined();
  const actor = geographicToPlanetPosition(start!.latitude, start!.longitude);
  const targetGeo = moveGeographic(start!, 90, 15);
  const target = geographicToPlanetPosition(targetGeo.latitude, targetGeo.longitude);
  const vehicleGeo = moveGeographic(start!, 180, 30);
  const vehicle = geographicToPlanetPosition(vehicleGeo.latitude, vehicleGeo.longitude);
  const elevation = terrainHeight(actor.x, actor.z, original.seed);
  await page.evaluate(({ actor, elevation, start, target, vehicle, vehicleGeo }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('saves', 'readwrite');
      const store = tx.objectStore('saves');
      const get = store.get('primary');
      get.onsuccess = () => {
        const data = get.result;
        data.player = { x: actor.x, y: elevation, z: actor.z };
        data.planetPositions.player = { ...start, altitude: elevation };
        data.npc = { x: actor.x, z: actor.z };
        data.planetPositions.npc = { ...start, altitude: elevation };
        data.vehicle = vehicle;
        data.planetPositions.vehicle = vehicleGeo;
        data.buildings = [{ kind: 'storage', x: target.x, z: target.z, y: 1, rotation: 0, charge: 0 }];
        data.npcState = { recruited: true, job: 'wood', carrying: 'wood', carryingAmount: 3 };
        store.put(data, 'primary');
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }), { actor, elevation, start, target, vehicle, vehicleGeo });
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  await page.waitForTimeout(1000);
  await save(page);
  const moved = await readRecord(page, 'primary');
  expect(moved.planetPositions?.npc).toBeDefined();
  const distance = geographicDistanceMeters(start!, moved.planetPositions!.npc!);
  expect(distance).toBeGreaterThan(0.5);
  expect(distance).toBeLessThan(3.2);
  expect(geographicDistanceMeters(moved.planetPositions!.npc!,
    planetPositionToGeographic(moved.npc.x, moved.npc.z))).toBeLessThan(1);
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  await save(page);
  const restored = await readRecord(page, 'primary');
  expect(geographicDistanceMeters(restored.planetPositions!.npc!, moved.planetPositions!.npc!)).toBeLessThan(1);
});

test('renders biome-selected arid vegetation in a streamed planetary region', async ({ page }) => {
  await page.goto('./');
  await page.locator('#newGame').click();
  await save(page);
  const original = await readRecord(page, 'primary');
  let cactus: { x: number; z: number } | undefined;
  for (let latitude = 5; latitude <= 40 && !cactus; latitude++) {
    for (let longitude = -180; longitude < 180 && !cactus; longitude++) {
      const center = geographicToPlanetPosition(latitude, longitude);
      for (let dz = -1; dz <= 1 && !cactus; dz++) {
        for (let dx = -1; dx <= 1 && !cactus; dx++) {
          const x = Math.round(center.x / 3) * 3 + dx * 3;
          const z = Math.round(center.z / 3) * 3 + dz * 3;
          const point = planetCoordinates(x, z);
          const px = x + seededNoise(point.x, point.z, original.seed) - 0.5;
          const pz = z + (seededNoise(point.z, point.x, original.seed + 3) - 0.5) * (point.reflected ? -1 : 1);
          if (terrainHeight(px, pz, original.seed) > 0.45 && vegetationFamilyAt(px, pz, original.seed) === 'cactus'
            && seededNoise(point.x, point.z, original.seed + 8) > 0.91) cactus = { x, z };
        }
      }
    }
  }
  expect(cactus).toBeDefined();
  const playerGeo = planetPositionToGeographic(cactus!.x, cactus!.z + 7);
  const player = geographicToPlanetPosition(playerGeo.latitude, playerGeo.longitude);
  const elevation = terrainHeight(player.x, player.z, original.seed);
  await page.evaluate(({ player, playerGeo, elevation }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('saves', 'readwrite');
      const store = tx.objectStore('saves');
      const get = store.get('primary');
      get.onsuccess = () => {
        const data = get.result;
        data.player = { x: player.x, y: elevation, z: player.z };
        data.planetPositions.player = { ...playerGeo, altitude: elevation };
        data.calendar.minute = 720;
        store.put(data, 'primary');
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }), { player, playerGeo, elevation });
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  await page.waitForTimeout(1000);
  const review = join('art-review', 'batch-005c');
  await mkdir(review, { recursive: true });
  await page.screenshot({ path: join(review, 'arid-vegetation-gameplay.png') });
});

test('exports a save and validates imports before replacing the current world', async ({ page }) => {
  await page.goto('./');
  await page.locator('#newGame').click();
  await save(page);
  const original = await readRecord(page, 'primary');
  await page.reload();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportSave').click();
  const download = await downloadPromise;
  expect(JSON.parse(await readFile(await download.path(), 'utf8'))).toEqual(JSON.parse(JSON.stringify(original)));
  await page.locator('#importSaveFile').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
  await expect(page.locator('#toast')).toHaveText('Save is invalid or from an unsupported version');
  expect(await readRecord(page, 'primary')).toEqual(original);
  page.once('dialog', dialog => dialog.accept());
  const replacement = { ...original, resources: { ...original.resources, wood: 23 } };
  await page.locator('#importSaveFile').setInputFiles({ name: 'save.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(replacement)) });
  await expect(page.locator('#toast')).toHaveText('Save imported. Select Continue.');
  expect((await readRecord(page, 'pre-import-backup')).resources).toEqual(original.resources);
  expect((await readRecord(page, 'primary')).resources.wood).toBe(23);
  await page.locator('#continueGame').click();
  await expect(page.locator('#resources')).toContainText('23');
});
