import { expect, test, type Browser, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { collectTree, sawTree, walkTo } from './timber-helpers';

type Piece = { id: string; kind: string; x: number; y: number; z: number; open: boolean;
  roofShape?: { style: string; axis: number } };
type Save = { resources: { wood: number }; structures: Piece[]; depleted: string[]; roofStyle?: string;
  player: { x: number; z: number } };
type Tree = { id: string; x: number; z: number; harvest: unknown };
type State = { player: { x: number; z: number }; cameraAngle: number; terrainReady: boolean;
  animationActionTime: number; attackCooldown: number;
  wildlife: Array<{ species: string; x: number; z: number; health: number }>;
  trees: Tree[]; deposits: Array<{ x: number; z: number }> };

async function state(page: Page) {
  return page.evaluate(() => (window as Window & { __newDawnState: () => State }).__newDawnState());
}

async function readSave(page: Page) {
  return page.evaluate(() => new Promise<Save>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      try {
        const get = db.transaction('saves').objectStore('saves').get('primary');
        get.onerror = () => { db.close(); reject(get.error); };
        get.onsuccess = () => { db.close(); resolve(get.result); };
      } catch (error) {
        db.close();
        reject(error);
      }
    };
  }));
}

async function walkPrecisely(page: Page, target: { x: number; z: number }, touch: boolean) {
  const cdp = touch ? await page.context().newCDPSession(page) : undefined;
  try {
    for (let attempt = 0; attempt < 75; attempt++) {
      const current = await state(page);
      const dx = target.x - current.player.x, dz = target.z - current.player.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.3) return;
      const x = dx * Math.cos(current.cameraAngle) - dz * Math.sin(current.cameraAngle);
      const z = dx * Math.sin(current.cameraAngle) + dz * Math.cos(current.cameraAngle);
      const duration = Math.min(250, Math.max(50, (distance - 0.3) * 150));
      if (cdp) {
        const box = await page.locator('#joystick').boundingBox();
        if (!box) throw new Error('Joystick is not visible');
        const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        const length = Math.hypot(x, z);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...center, id: 1 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove',
          touchPoints: [{ x: center.x + x / length * 37, y: center.y + z / length * 37, id: 1 }] });
        await page.waitForTimeout(duration);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        const largest = Math.max(Math.abs(x), Math.abs(z));
        const keys = [...(Math.abs(x) > largest * 0.4 ? [x > 0 ? 'd' : 'a'] : []),
          ...(Math.abs(z) > largest * 0.4 ? [z > 0 ? 's' : 'w'] : [])];
        for (const key of keys) await page.keyboard.down(key);
        await page.waitForTimeout(duration);
        for (const key of keys) await page.keyboard.up(key);
      }
      await page.waitForTimeout(70);
    }
    throw new Error(`Could not walk to ${JSON.stringify(target)} from ${JSON.stringify((await state(page)).player)}`);
  } finally {
    await cdp?.detach();
  }
}

async function defendNearby(page: Page) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const snapshot = await state(page);
    const threats = snapshot.wildlife.filter(animal => animal.health > 0
      && ['wolf', 'fox', 'bear'].includes(animal.species)
      && Math.hypot(animal.x - snapshot.player.x, animal.z - snapshot.player.z) < 6);
    if (!threats.length) return;
    if (threats.some(animal => Math.hypot(animal.x - snapshot.player.x, animal.z - snapshot.player.z) < 1.9)
      && snapshot.attackCooldown === 0) {
      await page.locator('#weaponButton').tap();
    }
    await page.waitForTimeout(200);
  }
  throw new Error('Could not defend against nearby predators');
}

async function verifyOfflineHouse(browser: Browser, saved: Save, screenshot: string) {
  const portServer = createServer();
  await new Promise<void>(resolve => portServer.listen(0, '127.0.0.1', resolve));
  const port = (portServer.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => portServer.close(error => error ? reject(error) : resolve()));
  const preview = spawn(process.execPath, [
    resolve('node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort',
  ], { stdio: 'ignore' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const production = await context.newPage();
  try {
    await expect.poll(async () => {
      if (preview.exitCode !== null) throw new Error(`Preview exited: ${preview.exitCode}`);
      try { return (await fetch(`http://127.0.0.1:${port}/NewDawn/`)).status; } catch { return 0; }
    }, { timeout: 30000 }).toBe(200);
    await production.goto(`http://127.0.0.1:${port}/NewDawn/`);
    await production.locator('#importSaveFile').setInputFiles({
      name: 'player-built-house.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(saved)),
    });
    await expect(production.locator('#toast')).toHaveText('Save imported. Select Continue.');
    await production.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
      }
    });
    await context.setOffline(true);
    await production.reload();
    await production.locator('#continueGame').tap();
    await expect(production.locator('#shelterStatus')).toHaveText('SHELTERED');
    await expect(production.locator('#weaponButton')).toHaveAttribute('aria-label', 'Attack with saw; use primary action to saw');
    expect(await readSave(production)).toMatchObject({ structures: saved.structures, resources: saved.resources, roofStyle: 'gable' });
    const textures = await production.evaluate(async () => Promise.all([
      'weathered-wood-color.jpg', 'weathered-wood-normal.jpg',
    ].map(async name => {
      const response = await fetch(`./assets/environment/construction/${name}`);
      return response.ok && (await response.blob()).size > 0;
    })));
    expect(textures).toEqual([true, true]);
    await production.screenshot({ path: screenshot });
    await production.locator('#actionB').tap();
    await expect(production.locator('#toast')).toHaveText('Door closed');
    await expect.poll(async () => (await readSave(production)).structures.find(piece => piece.kind === 'door')?.open).toBe(false);
    await production.locator('#actionB').tap();
    await expect(production.locator('#toast')).toHaveText('Door opened');
    await expect.poll(async () => (await readSave(production)).structures.find(piece => piece.kind === 'door')?.open).toBe(true);
    await production.locator('#pauseButton').tap();
    await production.locator('#saveGame').tap();
    await expect(production.locator('#toast')).toHaveText('World saved');
    await production.reload();
    await production.locator('#continueGame').tap();
    await expect(production.locator('#shelterStatus')).toHaveText('SHELTERED');
    expect((await readSave(production)).structures).toEqual(saved.structures);
  } finally {
    await context.setOffline(false);
    await context.close();
    if (preview.exitCode === null) {
      const exited = new Promise<void>(resolve => preview.once('exit', () => resolve()));
      preview.kill('SIGTERM');
      await exited;
    }
  }
}

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900, touch: false },
  { name: 'mobile portrait', width: 390, height: 844, touch: true },
  { name: 'mobile landscape', width: 844, height: 390, touch: true },
]) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.touch, isMobile: viewport.touch });

test('saws timber and builds, enters and reloads a paid gable house', async ({ browser, page }, testInfo) => {
  test.setTimeout(600000);
  const press = async (selector: string) => {
    const control = page.locator(selector);
    if (viewport.touch) await control.tap();
    else await control.click();
  };
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /shader|webglprogram|construction texture/i.test(message.text())) errors.push(message.text());
  });
  await page.goto('./');
  await page.locator('#worldSeed').fill('1847');
  await press('#newGame');
  await expect.poll(async () => (await state(page)).terrainReady, { timeout: 30000 }).toBe(true);
  await press('#pauseButton');
  if (await page.locator('#cameraFollow').isChecked()) await press('#cameraFollow');
  if (!await page.locator('#legacyCamera').isChecked()) await press('#legacyCamera');
  await press('#saveGame');
  await expect(page.locator('#toast')).toHaveText('World saved');
  expect((await readSave(page)).roofStyle).toBe('gable');
  await press('#resumeGame');
  const spawn = (await state(page)).player;
  const harvested: string[] = [];
  const harvestTree = async (tree: Tree) => {
    await walkTo(page, tree, viewport.touch);
    const prepareWork = viewport.touch ? async () => {
      await defendNearby(page);
      await walkTo(page, tree, true);
      await defendNearby(page);
    } : undefined;
    await sawTree(page, tree.id, viewport.touch, prepareWork);
    await collectTree(page, tree.id, viewport.touch, prepareWork);
    await expect.poll(async () => (await readSave(page)).depleted).toContain(tree.id);
    harvested.push(tree.id);
  };
  for (let attempts = 0; attempts < 12; attempts++) {
    const saved = await readSave(page);
    if (saved.resources.wood >= 24) break;
    const snapshot = await state(page);
    const tree = snapshot.trees.filter(item => !item.harvest
      && snapshot.deposits.every(deposit => Math.hypot(deposit.x - item.x, deposit.z - item.z) > 2))
      .sort((a, b) => Math.hypot(a.x - snapshot.player.x, a.z - snapshot.player.z)
        - Math.hypot(b.x - snapshot.player.x, b.z - snapshot.player.z))[0];
    expect(tree, 'No accessible tree while gathering building timber').toBeDefined();
    await harvestTree(tree);
  }
  if (viewport.touch) {
    const siteEdge = { x: Math.round(spawn.x / 2) * 2 - 4, z: Math.round(spawn.z / 2) * 2 - 1 };
    const siteTree = (await state(page)).trees.find(tree => !tree.harvest
      && Math.hypot(tree.x - siteEdge.x, tree.z - siteEdge.z) < 1);
    if (siteTree) await harvestTree(siteTree);
  }
  const wood = (await readSave(page)).resources.wood;
  expect(wood).toBeGreaterThanOrEqual(24);
  expect(harvested.length).toBeGreaterThan(0);
  await walkPrecisely(page, spawn, viewport.touch);
  await press('#pauseButton');
  await press('#saveGame');
  await expect(page.locator('#toast')).toHaveText('World saved');
  await writeFile(testInfo.outputPath('harvested-save.json'), JSON.stringify(await readSave(page)));
  await press('#resumeGame');
  const start = (await state(page)).player;
  await press('[data-tool="build"]');
  await press('[data-building="floor"]');
  await expect(page.locator('#roofStyle')).toHaveValue('gable');
  const scan = (target?: { x: number; z: number }, onlyReady = true, excluded: string[] = []) =>
    page.evaluate(({ target, onlyReady, player, excluded, touch }) => {
      const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
      const status = document.querySelector('#placementStatus')!;
      const coordinates = document.querySelector('#placementCoordinates')!;
      const minY = touch ? 60 : 220, maxY = touch ? innerHeight - 8 : innerHeight - 80;
      const minX = touch ? 8 : 140, maxX = touch ? innerWidth - 8 : innerWidth - 50;
      const step = touch ? 12 : 20;
      for (let y = minY; y <= maxY; y += step) for (let x = minX; x <= maxX; x += step) {
        if (document.elementFromPoint(x, y) !== canvas) continue;
        canvas.dispatchEvent(new PointerEvent('pointermove', {
          bubbles: true, pointerType: 'mouse', clientX: x, clientY: y - (touch ? 55 : 0),
        }));
        const match = /Grid (-?\d+), (-?\d+)/.exec(coordinates.textContent ?? '');
        if (!match || (onlyReady && status.textContent !== 'Ready to place' && !status.textContent?.startsWith('Replace wall'))) continue;
        const grid = { x: Number(match[1]), z: Number(match[2]) };
        if (target ? grid.x === target.x && grid.z === target.z : !excluded.includes(`${grid.x},${grid.z}`)
          && Math.hypot(grid.x - player.x, grid.z - player.z) >= 3.5
          && Math.hypot(grid.x - player.x, grid.z - player.z) <= 6) return { x, y, grid };
      }
      return null;
    }, { target, onlyReady, player: start, excluded, touch: viewport.touch });
  const choose = async (kind: string) => {
    await press('#changeBuild');
    await press(`[data-building="${kind}"]`);
  };
  const excluded: string[] = [];
  const rejected: string[] = [];
  let floorPoint: Awaited<ReturnType<typeof scan>> = null;
  for (let attempt = 0; attempt < 30; attempt++) {
    const candidate = await scan(undefined, true, excluded);
    if (!candidate) break;
    excluded.push(`${candidate.grid.x},${candidate.grid.z}`);
    const { x, z } = candidate.grid;
    if (!await scan({ x: x + 2, z })) {
      rejected.push(`${x},${z}: second floor`);
      continue;
    }
    await choose('wall');
    const north = await scan({ x, z: z - 1 });
    const south = await scan({ x, z: z + 1 });
    const north2 = await scan({ x: x + 2, z: z - 1 });
    const south2 = await scan({ x: x + 2, z: z + 1 });
    await press('#rotateBuild');
    const west = await scan({ x: x - 1, z });
    const east = await scan({ x: x + 3, z });
    await press('#rotateBuild');
    await choose('floor');
    if (north && south && north2 && south2 && west && east) { floorPoint = await scan(candidate.grid); break; }
    rejected.push(`${x},${z}: ${[north, south, north2, south2, west, east].map(Boolean).join(',')}`);
  }
  expect(floorPoint, `No clear site for a two-cell house: ${rejected.join('; ')}`).not.toBeNull();
  const aim = async (target: { x: number; z: number }, onlyReady = true) => {
    const point = await scan(target, onlyReady);
    expect(point, `No target for ${target.x},${target.z}`).not.toBeNull();
    if (viewport.touch) await page.touchscreen.tap(point!.x, point!.y);
    else await page.mouse.move(point!.x, point!.y);
    await expect(page.locator('#placementCoordinates')).toContainText(`Grid ${target.x}, ${target.z}`);
    if (onlyReady) await expect(page.locator('#placementStatus')).toHaveText(/Ready to place|Replace wall/);
  };
  const place = async () => press(viewport.touch ? '#actionA' : '#confirmBuild');
  await aim(floorPoint!.grid);
  await place();
  await expect.poll(async () => (await readSave(page)).structures.length).toBe(1);
  const floor = (await readSave(page)).structures[0];
  const secondFloor = { x: floor.x + 2, z: floor.z };
  const edges = [
    { x: floor.x, z: floor.z - 1 }, { x: floor.x, z: floor.z + 1 },
    { x: secondFloor.x, z: secondFloor.z - 1 }, { x: secondFloor.x, z: secondFloor.z + 1 },
    { x: floor.x - 1, z: floor.z }, { x: secondFloor.x + 1, z: secondFloor.z },
  ].sort((a, b) => Math.hypot(a.x - start.x, a.z - start.z) - Math.hypot(b.x - start.x, b.z - start.z));
  await aim(secondFloor);
  await place();
  await expect.poll(async () => (await readSave(page)).structures.length).toBe(2);
  for (const [index, edge] of edges.entries()) {
    await choose('wall');
    await aim(edge);
    await place();
    await expect.poll(async () => (await readSave(page)).structures.filter(piece => piece.kind !== 'roof').length).toBe(index + 3);
  }
  await choose('doorframe');
  await aim(edges[0]);
  await expect(page.locator('#placementStatus')).toContainText('Replace wall');
  await place();
  await expect.poll(async () => (await readSave(page)).structures.some(piece => piece.kind === 'doorframe')).toBe(true);
  await choose('door');
  await aim(edges[0]);
  await place();
  await expect.poll(async () => (await readSave(page)).structures.some(piece => piece.kind === 'door')).toBe(true);
  await expect.poll(async () => (await readSave(page)).structures.filter(piece =>
    piece.kind === 'roof' && piece.roofShape?.style === 'gable').length).toBe(2);
  await choose('floor');
  await aim(floor, false);
  await press('#roofControls summary');
  await page.locator('#roofStyle').selectOption('gable');
  await press('#applyRoof');
  await expect(page.locator('#toast')).toHaveText('Roof reshaped · 0 wood');
  await expect.poll(async () => (await readSave(page)).structures.filter(piece =>
    piece.kind === 'roof' && piece.roofShape?.style === 'gable').length).toBe(2);
  if (!viewport.touch) {
    await page.locator('#roofAxis').selectOption('x');
    await press('#applyRoof');
    await expect.poll(async () => (await readSave(page)).structures.filter(piece =>
      piece.kind === 'roof' && piece.roofShape?.axis === 0).length).toBe(2);
    await page.screenshot({ path: testInfo.outputPath('gable-other-axis.png') });
    await page.locator('#roofAxis').selectOption('auto');
    await press('#applyRoof');
    await expect(page.locator('#toast')).toHaveText('Roof reshaped · 0 wood');
    await expect.poll(async () => (await readSave(page)).structures.filter(piece =>
      piece.kind === 'roof' && piece.roofShape?.axis === 1).length).toBe(2);
  }
  const built = await readSave(page);
  expect(built.resources.wood).toBe(wood - 23);
  expect(built.depleted).toEqual(expect.arrayContaining(harvested));
  if (viewport.touch) await press('#actionB');
  else await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: testInfo.outputPath('built.png') });

  const doorwayFloor = [floor, secondFloor].sort((a, b) => Math.hypot(a.x - edges[0].x, a.z - edges[0].z)
    - Math.hypot(b.x - edges[0].x, b.z - edges[0].z))[0];
  const outside = { x: doorwayFloor.x + (edges[0].x - doorwayFloor.x) * 1.6,
    z: doorwayFloor.z + (edges[0].z - doorwayFloor.z) * 1.6 };
  await walkPrecisely(page, outside, viewport.touch);
  if (viewport.touch) await press('#actionB');
  else await page.keyboard.press('e');
  await expect(page.locator('#toast')).toHaveText('Door opened');
  await walkPrecisely(page, doorwayFloor, viewport.touch);
  await expect(page.locator('#shelterStatus')).toHaveText('SHELTERED');
  await page.waitForTimeout(800);
  await page.screenshot({ path: testInfo.outputPath('inside.png') });
  const beforeOrbit = (await state(page)).cameraAngle;
  if (viewport.touch) {
    const point = await page.evaluate(() => {
      const canvas = document.querySelector('#game');
      for (let y = Math.round(innerHeight * 0.25); y < innerHeight * 0.7; y += 12) {
        for (let x = Math.round(innerWidth * 0.55); x < innerWidth - 70; x += 12) {
          if (document.elementFromPoint(x, y) === canvas) return { x, y };
        }
      }
      return null;
    });
    expect(point, 'No touch-accessible camera area').not.toBeNull();
    const cdp = await page.context().newCDPSession(page);
    try {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point!, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point!.x + 60, y: point!.y, id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally {
      await cdp.detach();
    }
  } else {
    await page.mouse.move(viewport.width * 0.7, viewport.height * 0.5);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(viewport.width * 0.7 + 60, viewport.height * 0.5, { steps: 4 });
    await page.mouse.up({ button: 'right' });
  }
  await expect.poll(async () => Math.abs((await state(page)).cameraAngle - beforeOrbit)).toBeGreaterThan(0.1);
  await page.waitForTimeout(500);
  await page.screenshot({ path: testInfo.outputPath('inside-orbit.png') });
  await press('#pauseButton');
  await press('#saveGame');
  await expect(page.locator('#toast')).toHaveText('World saved');
  const entered = await readSave(page);
  expect(entered.structures.find(piece => piece.kind === 'door')?.open).toBe(true);
  await writeFile(testInfo.outputPath('player-built-save.json'), JSON.stringify(entered));
  await page.reload();
  await press('#continueGame');
  await expect(page.locator('#menu')).not.toHaveClass(/active/);
  await expect(page.locator('#shelterStatus')).toHaveText('SHELTERED');
  expect((await readSave(page)).structures).toEqual(entered.structures);
  expect((await readSave(page)).roofStyle).toBe('gable');
  await page.screenshot({ path: testInfo.outputPath('reloaded-inside.png') });
  await walkPrecisely(page, outside, viewport.touch);
  await expect(page.locator('#shelterStatus')).not.toHaveText('SHELTERED');
  await page.screenshot({ path: testInfo.outputPath('outside.png') });
  if (!viewport.touch) {
    await press('[data-tool="build"]');
    await press('[data-building="floor"]');
    await press('#floorUp');
    await aim(floor, false);
    await expect(page.locator('#placementStatus')).toHaveText('Remove the pitched roof before building above it');
    await press('#floorDown');
    await choose('roof');
    await aim(floor, false);
    const beforeExtension = await readSave(page);
    await press('#removePiece');
    await expect(page.locator('#toast')).toHaveText('Piece removed; half its materials returned');
    await expect.poll(async () => (await readSave(page)).structures.filter(piece => piece.kind === 'roof').length).toBe(1);
    expect((await readSave(page)).resources.wood).toBe(beforeExtension.resources.wood + 1);
    await choose('floor');
    await press('#floorUp');
    await aim(floor);
    await place();
    await expect.poll(async () => (await readSave(page)).structures.some(piece =>
      piece.kind === 'floor' && piece.x === floor.x && piece.z === floor.z && piece.y > floor.y)).toBe(true);
    expect((await readSave(page)).resources.wood).toBe(beforeExtension.resources.wood - 1);
    await page.keyboard.press('Escape');
    await press('#pauseButton');
    await press('#saveGame');
    await expect(page.locator('#toast')).toHaveText('World saved');
    const extended = await readSave(page);
    await page.reload();
    await press('#continueGame');
    expect((await readSave(page)).structures).toEqual(extended.structures);
    expect((await readSave(page)).resources.wood).toBe(extended.resources.wood);
    await verifyOfflineHouse(browser, entered, testInfo.outputPath('offline-inside.png'));
  }
  expect(errors).toEqual([]);
});
  });
}
