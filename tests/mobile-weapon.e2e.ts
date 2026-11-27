import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { geographicDistanceMeters } from '../src/geography';
import { planetDistanceMeters, planetPositionToGeographic } from '../src/planet';

type Snapshot = {
  player: { x: number; y: number; z: number; yaw: number };
  runtimeFrame: { latitude: number; longitude: number };
  cameraAngle: number;
  grounded: boolean;
  stones: number;
  selectedWeapon: string;
  animationAction: string;
  animationActionTime: number;
  health: number;
  lastStoneImpact: { x: number; y: number; z: number; kind: string } | null;
  projectiles: Array<{ x: number; y: number; z: number; velocityY: number }>;
  enemyProjectiles: Array<{ x: number; y: number; z: number; remaining: number }>;
  enemies: Array<{ id: number; x: number; y: number; z: number; health: number }>;
};
type Fixture = {
  seed: number;
  version: number;
  planetPositions?: unknown;
  player: { x: number; y: number; z: number };
  npc: { x: number; z: number };
  vehicle: { x: number; z: number };
  wildlife: unknown[];
  depleted: string[];
  mining: Record<string, number>;
  stones: number;
  selectedWeapon: string;
  structures: Array<{ id: string; kind: string; x: number; y: number; z: number; level: number; rotation: number; open: boolean }>;
};

async function state(page: Page) {
  return page.evaluate(() => (window as Window & { __newDawnState: () => Snapshot }).__newDawnState());
}

test.describe('stone obstruction', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a simulated stone stops at a solid wall', async ({ page }) => {
    await page.goto('./');
    await page.locator('#newGame').click();
    await save(page);
    const wall = await page.evaluate(async () => {
      const { World } = await import('/NewDawn/src/world.ts');
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
      const world = new World(record.seed);
      const edge = snapPiece('wall', record.player.x - 3, record.player.z - 3, 0);
      const yaw = Math.PI + 0.78;
      const x = edge.x + 0.65 - Math.sin(yaw) * 2;
      const z = edge.z - Math.cos(yaw) * 2;
      const y = world.heightAt(x, z);
      record.version = 11;
      delete record.planetPositions;
      record.player = { x, y, z };
      record.npc = { x: x + 30, z: z + 30 };
      record.vehicle = { x: x + 35, z: z + 35 };
      record.wildlife = [];
      record.depleted = world.group.children.filter(object => object.userData.resourceId
        && Math.hypot(object.position.x - x, object.position.z - z) < 10).map(object => object.userData.resourceId);
      for (const object of world.group.children) {
        if (object.userData.depositId && Math.hypot(object.position.x - x, object.position.z - z) < 10) {
          record.mining[object.userData.depositId as string] = 3;
        }
      }
      record.structures = [{ id: 'test-wall', kind: 'wall', ...edge, y, level: 0, rotation: 0, open: false }];
      record.stones = 2;
      record.selectedWeapon = 'stones';
      world.dispose();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('saves', 'readwrite');
        tx.objectStore('saves').put(record, 'primary');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      return { ...edge, y };
    });
    await page.reload();
    await page.locator('#continueGame').click();
    await page.evaluate(() => {
      const win = window as Window & { __newDawnState: () => Snapshot; weaponFrames?: Snapshot[] };
      win.weaponFrames = [];
      const sample = () => {
        win.weaponFrames!.push(win.__newDawnState());
        if (win.weaponFrames!.length < 100) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await page.locator('#weaponButton').tap();
    await expect(page.locator('#weaponButton')).toHaveAttribute('aria-label', 'Throw stone, 1 remaining');
    await page.waitForTimeout(800);
    const frames = await page.evaluate(() => (window as Window & { weaponFrames?: Snapshot[] }).weaponFrames!);
    const flight = frames.flatMap(frame => frame.projectiles);
    expect(flight.length).toBeGreaterThan(2);
    const impact = (await state(page)).lastStoneImpact;
    expect(impact?.kind).toBe('structure');
    expect(Math.abs(impact!.z - wall.z)).toBeLessThan(0.2);
    expect(Math.abs(impact!.x - wall.x - 0.65)).toBeLessThan(0.2);
    expect(impact!.y).toBeGreaterThan(wall.y + 0.5);
    expect((await state(page)).projectiles).toHaveLength(0);
    await page.keyboard.press('c');
    await expect(page.locator('#weaponButton')).toHaveAttribute('aria-label', 'Throw stone, 0 remaining');
  });

  test('a stone travels in local meters at high latitude', async ({ page }) => {
    await page.goto('./');
    await page.locator('#newGame').click();
    await save(page);
    await page.evaluate(async () => {
      const { geographicToPlanetPosition } = await import('/NewDawn/src/planet.ts');
      const { World, terrainHeight } = await import('/NewDawn/src/world.ts');
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('new-dawn', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const record = await new Promise<Fixture & { calendar: { minute: number } }>((resolve, reject) => {
        const request = db.transaction('saves').objectStore('saves').get('primary');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      let location: { x: number; z: number } | undefined;
      for (let longitude = -175; longitude <= 175; longitude += 5) {
        const candidate = geographicToPlanetPosition(60, longitude);
        if (terrainHeight(candidate.x, candidate.z, record.seed) > 1) { location = candidate; break; }
      }
      if (!location) throw new Error('No dry high-latitude location');
      const { x, z } = location;
      const world = new World(record.seed);
      world.updateChunks(x, z, true);
      record.version = 11;
      delete record.planetPositions;
      record.player = { x, y: world.heightAt(x, z), z };
      record.npc = { x: x + 40, z: z + 40 };
      record.vehicle = { x: x + 50, z: z + 50 };
      record.wildlife = [];
      record.structures = [];
      record.stones = 2;
      record.selectedWeapon = 'stones';
      record.calendar.minute = 720;
      record.depleted = world.group.children.filter(object => object.userData.resourceId)
        .map(object => object.userData.resourceId as string);
      for (const object of world.group.children) {
        if (object.userData.depositId) record.mining[object.userData.depositId as string] = 3;
      }
      world.dispose();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('saves', 'readwrite');
        tx.objectStore('saves').put(record, 'primary');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    });
    await page.reload();
    await page.locator('#continueGame').click();
    await expect(page.locator('#joystick')).toBeVisible();
    await page.keyboard.down('d');
    await page.waitForTimeout(500);
    await page.keyboard.up('d');
    const yaw = (await state(page)).player.yaw;
    expect(Math.abs(Math.sin(yaw))).toBeGreaterThan(0.3);
    await page.evaluate(() => {
      const win = window as Window & { __newDawnState: () => Snapshot; weaponFrames?: Snapshot[] };
      win.weaponFrames = [];
      const sample = () => {
        win.weaponFrames!.push(win.__newDawnState());
        if (win.weaponFrames!.length < 100) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    await page.locator('#weaponButton').tap();
    await expect(page.locator('#weaponButton')).toHaveAttribute('aria-label', 'Throw stone, 1 remaining');
    await expect.poll(async () => (await state(page)).projectiles.length).toBe(1);
    const review = join(process.cwd(), 'art-review', 'batch-005c-p3');
    await mkdir(review, { recursive: true });
    await page.screenshot({ path: join(review, 'high-latitude-projectile.png') });
    await page.waitForTimeout(800);
    const flight = (await page.evaluate(() => (window as Window & { weaponFrames?: Snapshot[] }).weaponFrames!))
      .flatMap(frame => frame.projectiles);
    expect(flight.length).toBeGreaterThan(2);
    const first = flight[0];
    const last = flight[flight.length - 1];
    const elapsed = (first.velocityY - last.velocityY) / 9.8;
    expect(elapsed).toBeGreaterThan(0.1);
    expect(planetDistanceMeters(first, last) / elapsed).toBeCloseTo(11, 0);
    const dx = last.x - first.x;
    const dz = last.z - first.z;
    expect((dx * Math.sin(yaw) + dz * Math.cos(yaw)) / Math.hypot(dx, dz)).toBeGreaterThan(0.99);

    await page.keyboard.down('d');
    await expect.poll(async () => {
      const current = await state(page);
      return geographicDistanceMeters(current.runtimeFrame, planetPositionToGeographic(current.player.x, current.player.z));
    }, { timeout: 15000, intervals: [50] }).toBeGreaterThan(21.5);
    await page.evaluate(() => {
      const win = window as Window & { __newDawnState: () => Snapshot; weaponFrames?: Snapshot[] };
      win.weaponFrames = [];
      const sample = () => {
        win.weaponFrames!.push(win.__newDawnState());
        if (win.weaponFrames!.length < 120) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    const oldFrame = (await state(page)).runtimeFrame;
    await page.locator('#weaponButton').tap();
    await expect(page.locator('#weaponButton')).toHaveAttribute('aria-label', 'Throw stone, 0 remaining');
    await expect.poll(async () => (await state(page)).runtimeFrame, { timeout: 5000 }).not.toEqual(oldFrame);
    await page.screenshot({ path: join(review, 'frame-relocation-60n.png') });
    await page.keyboard.up('d');
    await page.waitForTimeout(300);
    const frames = await page.evaluate(() => (window as Window & { weaponFrames?: Snapshot[] }).weaponFrames!);
    const transition = frames.findIndex((frame, index) => index > 0 && frame.projectiles.length > 0
      && frames[index - 1].projectiles.length > 0
      && (frame.runtimeFrame.latitude !== frames[index - 1].runtimeFrame.latitude
        || frame.runtimeFrame.longitude !== frames[index - 1].runtimeFrame.longitude));
    expect(transition).toBeGreaterThan(0);
    expect(planetDistanceMeters(frames[transition - 1].projectiles[0], frames[transition].projectiles[0])).toBeLessThan(2);

    await page.evaluate(async () => {
      const { movePlanetPosition } = await import('/NewDawn/src/planet.ts');
      const win = window as Window & {
        __newDawnState: () => Snapshot;
        __newDawnSpawnEnemy: (kind: string, x: number, z: number) => void;
        hostileFrames?: Snapshot[];
      };
      const location = movePlanetPosition(win.__newDawnState().player, 90, 5);
      win.hostileFrames = [];
      const sample = () => {
        win.hostileFrames!.push(win.__newDawnState());
        if (win.hostileFrames!.length < 180) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
      win.__newDawnSpawnEnemy('necromancer', location.x, location.z);
    });
    await expect.poll(async () => (await state(page)).enemyProjectiles.length).toBe(1);
    await page.screenshot({ path: join(review, 'hostile-projectile-60n.png') });
    await expect.poll(async () => (await state(page)).health, { timeout: 5000 }).toBe(92);
    const hostileFrames = await page.evaluate(() => (window as Window & { hostileFrames?: Snapshot[] }).hostileFrames!);
    const hostileFlight = hostileFrames.filter(frame => frame.enemyProjectiles.length > 0);
    expect(hostileFlight.length).toBeGreaterThan(2);
    const firstHostile = hostileFlight[0];
    const lastHostile = hostileFlight[hostileFlight.length - 1];
    const hostileSeconds = firstHostile.enemyProjectiles[0].remaining - lastHostile.enemyProjectiles[0].remaining;
    expect(hostileSeconds).toBeGreaterThan(0.1);
    expect(planetDistanceMeters(firstHostile.enemyProjectiles[0], lastHostile.enemyProjectiles[0]) / hostileSeconds)
      .toBeCloseTo(5, 0);
    expect((await state(page)).enemyProjectiles).toHaveLength(0);
  });
});

async function save(page: Page) {
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.locator('#resumeGame').click();
}

for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test.describe(`${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test('collects and throws stones while moving, then uses fists and jump', async ({ page }) => {
      test.setTimeout(150000);
      await page.goto('./');
      await page.locator('#newGame').click();
      await save(page);
      await page.evaluate(async () => {
        const { World } = await import('/NewDawn/src/world.ts');
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
        const world = new World(record.seed);
        const rock = world.group.children.find(object => object.userData.resource === 'stone'
          && Array.from({ length: 8 }, (_, i) => world.heightAt(
            object.position.x + Math.cos(i * Math.PI / 4) * 12,
            object.position.z + Math.sin(i * Math.PI / 4) * 12,
          )).every(height => height > 0.3));
        if (!rock) throw new Error('No suitable loose stone in the starting chunks');
        const { x, z } = rock.position;
        record.version = 11;
        delete record.planetPositions;
        record.player = { x, y: world.heightAt(x, z), z };
        record.npc = { x: x + 30, z: z + 30 };
        record.vehicle = { x: x + 35, z: z + 35 };
        record.wildlife = [];
        record.depleted = world.group.children.filter(object => object !== rock && object.userData.resourceId
          && Math.hypot(object.position.x - x, object.position.z - z) < 20).map(object => object.userData.resourceId);
        for (const object of world.group.children) {
          if (object.userData.depositId && Math.hypot(object.position.x - x, object.position.z - z) < 20) {
            record.mining[object.userData.depositId as string] = 3;
          }
        }
        world.dispose();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('saves', 'readwrite');
          tx.objectStore('saves').put(record, 'primary');
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        db.close();
      });
      await page.reload();
      await page.locator('#continueGame').click();
      await expect(page.locator('#joystick')).toBeVisible();
      {
        const joystick = (await page.locator('#joystick').boundingBox())!;
        const action = (await page.locator('#actionA').boundingBox())!;
        const stick = { id: 21, x: joystick.x + joystick.width / 2 + 20, y: joystick.y + joystick.height / 2 - 20 };
        const a = { id: 22, x: action.x + action.width / 2, y: action.y + action.height / 2 };
        const touch = await page.context().newCDPSession(page);
        const beforeGather = await state(page);
        await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [stick] });
        await page.waitForTimeout(200);
        await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [stick, a] });
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [a] });
        await expect(page.locator('#toast')).toHaveText('+2 stone');
        const afterGather = await state(page);
        expect(Math.hypot(afterGather.player.x - beforeGather.player.x, afterGather.player.z - beforeGather.player.z)).toBeGreaterThan(0.1);
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [stick] });
        await touch.detach();
      }
      await expect(page.locator('#toast')).toHaveText('+2 stone');
      expect((await state(page)).stones).toBe(2);
      await page.locator('#toolHubButton').tap();
      await page.locator('[data-hub="stones"]').tap();
      await expect(page.locator('#weaponButton')).toHaveAttribute('aria-label', 'Throw stone, 2 remaining');
      const evidence = join('art-review', 'batch-005c-p2c', 'mobile-ui', 'action-pad');
      await mkdir(evidence, { recursive: true });
      await page.screenshot({ path: join(evidence, `stone-equipped-${viewport.width}x${viewport.height}.png`) });
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
            const record = get.result;
            record.calendar.minute = 1320;
            store.put(record, 'primary');
          };
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => reject(tx.error);
        };
      }));
      await page.reload();
      await page.locator('#continueGame').click();
      await expect(page.locator('#weaponButton')).toHaveAttribute('aria-label', 'Throw stone, 2 remaining');
      await page.locator('#pauseButton').click();
      await page.locator('#cameraFollow').uncheck();
      await page.locator('#resumeGame').click();
      await expect.poll(async () => (await state(page)).enemies.length, { timeout: 50000, intervals: [500] }).toBeGreaterThan(0);
      await expect.poll(async () => {
        const current = await state(page);
        return Math.hypot(current.enemies[0].x - current.player.x, current.enemies[0].z - current.player.z);
      }, { timeout: 20000, intervals: [250] }).toBeLessThan(6);

      const current = await state(page);
      const enemy = current.enemies[0];
      const dx = enemy.x - current.player.x;
      const dz = enemy.z - current.player.z;
      const length = Math.hypot(dx, dz);
      const inputX = (dx * Math.cos(current.cameraAngle) - dz * Math.sin(current.cameraAngle)) / length;
      const inputY = (dx * Math.sin(current.cameraAngle) + dz * Math.cos(current.cameraAngle)) / length;
      const joystick = (await page.locator('#joystick').boundingBox())!;
      const weapon = (await page.locator('#weaponButton').boundingBox())!;
      const point = (id: number, x: number, y: number) => ({ id, x, y, radiusX: 6, radiusY: 6, force: 1 });
      const stick = point(1, joystick.x + joystick.width / 2 + inputX * 28, joystick.y + joystick.height / 2 + inputY * 28);
      const attack = point(2, weapon.x + weapon.width / 2, weapon.y + weapon.height / 2);
      const camera = point(6, viewport.width * 0.6, viewport.height * 0.48);
      const movedCamera = point(6, camera.x + 25, camera.y);
      const session = await page.context().newCDPSession(page);
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [stick] });
      await page.waitForTimeout(500);
      const before = await state(page);
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [stick, camera] });
      await page.evaluate(() => {
        const win = window as Window & { __newDawnState: () => Snapshot; weaponFrames?: Snapshot[] };
        win.weaponFrames = [];
        const sample = () => {
          win.weaponFrames!.push(win.__newDawnState());
          if (win.weaponFrames!.length < 100) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      });
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [stick, camera, attack] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [attack] });
      await expect(page.locator('#weaponButton')).toHaveAttribute('aria-label', 'Throw stone, 1 remaining');
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [stick, camera, attack] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [attack] });
      expect((await state(page)).stones).toBe(1);
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [stick, movedCamera] });
      await expect.poll(async () => Math.abs((await state(page)).cameraAngle - before.cameraAngle)).toBeGreaterThan(0.05);
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [movedCamera] });
      await page.waitForTimeout(900);
      const after = await state(page);
      const frames = await page.evaluate(() => (window as Window & { weaponFrames?: Snapshot[] }).weaponFrames!);
      const flight = frames.flatMap(frame => frame.projectiles);
      expect(flight.length).toBeGreaterThan(2);
      expect(Math.hypot(flight.at(-1)!.x - flight[0].x, flight.at(-1)!.z - flight[0].z)).toBeGreaterThan(0.1);
      expect(flight.at(-1)!.velocityY).toBeLessThan(flight[0].velocityY);
      expect(frames.some(frame => frame.enemies.some(item => item.id === enemy.id && item.health < enemy.health)),
        JSON.stringify({ before, enemy, flight: [flight[0], flight.at(-1)], after })).toBe(true);
      expect(Math.hypot(after.player.x - before.player.x, after.player.z - before.player.z)).toBeGreaterThan(0.2);
      expect(after.stones).toBe(1);
      await expect(page.locator('#stick')).not.toHaveAttribute('style', 'transform: translate(0px, 0px);');
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await session.detach();

      await page.locator('#toolHubButton').tap();
      await page.locator('[data-hub="fists"]').tap();
      await expect(page.locator('#weaponButton')).toHaveAttribute('aria-label', 'Attack with fists');
      await page.waitForTimeout(700);
      const beforeMelee = await state(page);
      const target = beforeMelee.enemies.find(item => item.id === enemy.id);
      expect(target).toBeDefined();
      expect(Math.hypot(target!.x - beforeMelee.player.x, target!.z - beforeMelee.player.z)).toBeLessThan(2.8);
      await page.locator('#weaponButton').tap();
      expect((await state(page)).animationAction).toBe('attack');
      await page.waitForTimeout(400);
      const afterMelee = await state(page);
      const hitTarget = afterMelee.enemies.find(item => item.id === enemy.id);
      expect(!hitTarget || hitTarget.health < target!.health).toBe(true);
      expect((await state(page)).stones).toBe(1);

      const jump = (await page.locator('#jumpButton').boundingBox())!;
      const jumpTouch = point(3, jump.x + jump.width / 2, jump.y + jump.height / 2);
      const jumpSession = await page.context().newCDPSession(page);
      await jumpSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [stick] });
      await page.waitForTimeout(200);
      const beforeJump = await state(page);
      await jumpSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [stick, jumpTouch] });
      await jumpSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [jumpTouch] });
      await expect.poll(async () => (await state(page)).grounded).toBe(false);
      await page.screenshot({ path: join(evidence, `simultaneous-jump-${viewport.width}x${viewport.height}.png`) });
      await page.waitForTimeout(250);
      const afterJump = await state(page);
      expect(Math.hypot(afterJump.player.x - beforeJump.player.x, afterJump.player.z - beforeJump.player.z)).toBeGreaterThan(0.1);
      await jumpSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await jumpSession.detach();

      await page.locator('#toolHubButton').tap();
      await page.locator('[data-hub="stones"]').tap();
      await page.waitForTimeout(700);
      await page.locator('#weaponButton').tap();
      await expect(page.locator('#weaponButton')).toHaveAttribute('aria-label', 'Throw stone, 0 remaining');
      await page.waitForTimeout(3500);
      expect((await state(page)).projectiles).toHaveLength(0);
      await page.locator('#weaponButton').tap();
      await expect(page.locator('#toast')).toHaveText('No stones remaining');
      expect((await state(page)).projectiles).toHaveLength(0);
      expect((await state(page)).stones).toBe(0);
      await save(page);
      await page.reload();
      await page.locator('#continueGame').click();
      await expect(page.locator('#weaponButton')).toHaveAttribute('aria-label', 'Throw stone, 0 remaining');

      const a = (await page.locator('#actionA').boundingBox())!;
      const b = (await page.locator('#actionB').boundingBox())!;
      const aTouch = point(4, a.x + a.width / 2, a.y + a.height / 2);
      const bTouch = point(5, b.x + b.width / 2, b.y + b.height / 2);
      const actionSession = await page.context().newCDPSession(page);
      await actionSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [stick] });
      await actionSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [stick, aTouch, bTouch] });
      await page.screenshot({ path: join(evidence, `simultaneous-ab-${viewport.width}x${viewport.height}.png`) });
      await actionSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [aTouch] });
      await expect(page.locator('#toast')).not.toHaveText('No stones remaining');
      const beforeB = await state(page);
      await actionSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [bTouch] });
      await expect(page.locator('#toast')).toHaveText('Excavated terrain');
      await page.waitForTimeout(300);
      const afterB = await state(page);
      expect(Math.hypot(afterB.player.x - beforeB.player.x, afterB.player.z - beforeB.player.z)).toBeGreaterThan(0.1);
      expect((await state(page)).stones).toBe(0);
      expect((await state(page)).projectiles).toHaveLength(0);
      await expect(page.locator('#stick')).not.toHaveAttribute('style', 'transform: translate(0px, 0px);');
      await actionSession.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await actionSession.detach();

      const cancelSession = await page.context().newCDPSession(page);
      await cancelSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [stick] });
      await cancelSession.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [stick, attack] });
      await cancelSession.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      await expect(page.locator('#toast')).toHaveText('Excavated terrain');
      await expect(page.locator('#stick')).toHaveAttribute('style', 'transform: translate(0px, 0px);');
      await cancelSession.detach();

      const icons: string[] = [];
      for (const weaponName of ['stick', 'axe', 'fists']) {
        await page.locator('#toolHubButton').tap();
        await page.locator(`[data-hub="${weaponName}"]`).tap();
        await expect(page.locator('#weaponButton')).toHaveAttribute('aria-label', `Attack with ${weaponName}`);
        await expect(page.locator('#weaponAmmo')).toBeHidden();
        icons.push(await page.locator('#weaponIcon').innerHTML());
      }
      expect(new Set(icons).size).toBe(3);
    });
  });
}
