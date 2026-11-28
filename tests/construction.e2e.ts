import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { sawTree, timberAction } from './timber-helpers';

type Piece = { id: string; kind: string; x: number; z: number; y: number; level: number; rotation: number; open: boolean; automatic?: boolean; roofShape?: { style: string; axis: number; heights: number[] } };
type World = { version: number; resources: { wood: number }; ingots: { glass: number }; structures: Piece[]; roofStyle?: string; pendingRoofs?: Array<{ y: number; level: number }>; player: { x: number; y: number; z: number }; npc: { x: number; z: number }; vehicle: { x: number; z: number } };

async function readRecord(page: Page, key = 'primary') {
  return page.evaluate(key => new Promise<World>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const get = db.transaction('saves').objectStore('saves').get(key);
      get.onerror = () => reject(get.error);
      get.onsuccess = () => { resolve(get.result); db.close(); };
    };
  }), key);
}

async function setFixture(page: Page, scenario: 'legacy' | 'door') {
  await page.evaluate(scenario => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('saves', 'readwrite');
      const store = tx.objectStore('saves');
      const get = store.get('primary');
      get.onsuccess = () => {
        const data = get.result;
        data.version = 11;
        delete data.planetPositions;
        if (scenario === 'legacy') {
          data.version = 6;
          delete data.structures;
          delete data.autoRoof;
          delete data.roofStyle;
          delete data.roofAxis;
          data.resources.wood = 50;
        } else {
          const door = data.structures.find((piece: Piece) => piece.kind === 'door');
          data.player = { x: door.x, y: door.y, z: door.z + 1.2 };
          data.npc = { x: door.x + 15, z: door.z + 15 };
          data.vehicle = { x: door.x - 15, z: door.z - 15 };
        }
        store.put(data, 'primary');
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    };
  }), scenario);
}

async function save(page: Page) {
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.locator('#resumeGame').click();
}

test('opaque gable roof covers walls behind it in WebGL', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /shader|webglprogram/i.test(message.text())) errors.push(message.text());
  });
  await page.goto('./');
  const samples = await page.evaluate(async () => {
    const THREE = await import('/NewDawn/node_modules/three/build/three.module.js');
    const { ConstructionRenderer } = await import('/NewDawn/src/construction-render.ts');
    const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true });
    renderer.setSize(320, 200);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#a8c9d0');
    scene.add(new THREE.AmbientLight('white', 1));
    const camera = new THREE.PerspectiveCamera(42, 320 / 200, 0.1, 160);
    camera.position.set(7.7, 11.17, 7.42);
    camera.lookAt(0.215, 5.63, -0.143);
    const construction = new ConstructionRenderer();
    const piece = (id: string, kind: Piece['kind'], x: number, z: number, rotation = 0): Piece =>
      ({ id, kind, x, z, y: 3.25, level: 0, rotation, open: false });
    const pieces: Piece[] = [
      piece('floor-a', 'floor', 2, -4), piece('floor-b', 'floor', 4, -4),
      piece('frame', 'doorframe', 2, -3), piece('wall-a', 'wall', 1, -4, 1),
      piece('wall-b', 'wall', 4, -3), piece('wall-c', 'wall', 2, -5),
      piece('wall-d', 'wall', 5, -4, 1), piece('wall-e', 'wall', 4, -5),
      { ...piece('roof-a', 'roof', 2, -4), roofShape: { style: 'gable', axis: 1, heights: [0, 0.9, 0] } },
      { ...piece('roof-b', 'roof', 4, -4), roofShape: { style: 'gable', axis: 1, heights: [0, 0.9, 0] } },
    ];
    construction.refresh(pieces);
    scene.add(construction.group);
    const meshes = construction.group.children.filter((mesh: any) => mesh.visible && mesh.userData.constructionKind);
    for (const mesh of meshes) {
      const material = (mesh as InstanceType<typeof THREE.InstancedMesh>).material as InstanceType<typeof THREE.MeshStandardMaterial>;
      material.map = null;
      material.normalMap = null;
      material.needsUpdate = true;
    }
    renderer.render(scene, camera);
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 200;
    const context = canvas.getContext('2d')!;
    context.drawImage(renderer.domElement, 0, 0);
    const full = context.getImageData(0, 0, 320, 200).data;
    const raycaster = new THREE.Raycaster();
    let roofPixels = 0;
    const roofPixelCoordinates: Array<[number, number]> = [];
    for (let y = 0; y < 200; y += 2) for (let x = 0; x < 320; x += 2) {
      raycaster.setFromCamera(new THREE.Vector2((x + 0.5) / 160 - 1, 1 - (y + 0.5) / 100), camera);
      if (raycaster.intersectObjects(meshes, false)[0]?.object.userData.constructionKind === 'roof') {
        roofPixels++;
        roofPixelCoordinates.push([x, y]);
      }
    }
    for (const mesh of meshes) if (mesh.userData.constructionKind !== 'roof') mesh.visible = false;
    renderer.render(scene, camera);
    context.drawImage(renderer.domElement, 0, 0);
    const roofOnly = context.getImageData(0, 0, 320, 200).data;
    let wrong = 0;
    for (const [x, y] of roofPixelCoordinates) {
      const index = (y * 320 + x) * 4;
      if (Math.max(...[0, 1, 2].map(channel => Math.abs(full[index + channel] - roofOnly[index + channel]))) > 3) wrong++;
    }
    renderer.dispose();
    return { roofPixels, wrong };
  });
  expect(samples.roofPixels).toBeGreaterThan(40);
  expect(samples.wrong).toBeLessThan(samples.roofPixels * 0.01);
  expect(errors).toEqual([]);
});

test('preserves a selected flat roof across reload and uses gable for a new world', async ({ page }) => {
  await page.goto('./');
  await page.locator('#newGame').click();
  await expect(page.locator('#roofStyle')).toHaveValue('gable');
  await page.locator('[data-tool="build"]').click();
  await page.locator('[data-building="floor"]').click();
  await page.locator('#roofControls summary').click();
  await page.locator('#roofStyle').selectOption('flat');
  await page.keyboard.press('Escape');
  await save(page);
  expect((await readRecord(page)).roofStyle).toBeUndefined();
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  await expect(page.locator('#roofStyle')).toHaveValue('flat');
  await page.locator('#pauseButton').click();
  await page.locator('#returnMenu').click();
  await page.locator('#newGame').click();
  await expect(page.locator('#roofStyle')).toHaveValue('gable');
});

test('floor cover clears on placement, persists on reload and returns on removal', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await page.locator('#newGame').click();
  await save(page);
  await setFixture(page, 'legacy');
  await page.reload();
  await page.locator('#continueGame').click();
  const hidden = () => page.evaluate(() => (window as Window & { __newDawnState: () => {
    groundArt: { hiddenByFloors: number };
  } }).__newDawnState().groundArt.hiddenByFloors);
  expect(await hidden()).toBe(0);
  await page.locator('[data-tool="build"]').click();
  await page.locator('[data-building="floor"]').click();
  const scan = (excluded: string[], target?: string) => page.evaluate(({ excluded, target }) => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
    const status = document.querySelector('#placementStatus')!;
    const coordinates = document.querySelector('#placementCoordinates')!;
    for (let y = 220; y <= 820; y += 12) for (let x = 140; x <= 1390; x += 12) {
      if (document.elementFromPoint(x, y) !== canvas) continue;
      canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse', clientX: x, clientY: y }));
      const grid = /Grid (-?\d+), (-?\d+)/.exec(coordinates.textContent ?? '');
      if (!grid) continue;
      const key = `${grid[1]},${grid[2]}`;
      if (target ? key === target : status.textContent === 'Ready to place' && !excluded.includes(key)) return { x, y, key };
    }
    return null;
  }, { excluded, target });
  const excluded: string[] = [];
  let built: { x: number; y: number; key: string } | null = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    const point = await scan(excluded);
    if (!point) break;
    excluded.push(point.key);
    await page.mouse.move(point.x, point.y);
    await page.locator('#confirmBuild').click();
    await expect.poll(async () => (await readRecord(page)).structures.length).toBe(1);
    if (await hidden() > 0) { built = point; break; }
    await page.locator('#removePiece').click();
    await expect.poll(async () => (await readRecord(page)).structures.length).toBe(0);
  }
  expect(built, 'No valid floor covering decorative vegetation').not.toBeNull();
  const count = await hidden();
  await page.keyboard.press('Escape');
  await save(page);
  await page.reload();
  await page.locator('#continueGame').click();
  await expect.poll(hidden).toBe(count);
  await page.locator('[data-tool="build"]').click();
  await page.locator('[data-building="floor"]').click();
  const point = await scan([], built!.key);
  expect(point).not.toBeNull();
  await page.mouse.move(point!.x, point!.y);
  await page.locator('#removePiece').click();
  await expect.poll(hidden).toBe(0);
  await expect.poll(async () => (await readRecord(page)).structures.length).toBe(0);
});

test('builds a room through the interface and reshapes its paid roof', async ({ page }, testInfo) => {
  test.setTimeout(300000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /shader|webglprogram/i.test(message.text())) errors.push(message.text());
  });
  await page.setViewportSize({ width: 1440, height: 900 });
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
        data.resources.wood = 100;
        data.ingots.glass = 1;
        data.calendar.minute = 720;
        data.wildlife = [];
        store.put(data, 'primary');
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }));
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  await page.waitForTimeout(500);
  const start = await readRecord(page);
  await page.locator('[data-tool="build"]').click();
  await page.locator('[data-building="floor"]').click();
  const scan = async (target?: { x: number; z: number }, onlyReady = true, excluded: string[] = []) => page.evaluate(({ target, onlyReady, player, excluded }) => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
    const status = document.querySelector('#placementStatus')!;
    const coordinates = document.querySelector('#placementCoordinates')!;
    for (let y = 220; y <= 820; y += 10) {
      for (let x = 140; x <= 1390; x += 10) {
        if (document.elementFromPoint(x, y) !== canvas) continue;
        canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse', clientX: x, clientY: y }));
        const match = /Grid (-?\d+), (-?\d+)/.exec(coordinates.textContent ?? '');
        if (!match || (onlyReady && status.textContent !== 'Ready to place' && !status.textContent?.startsWith('Replace wall'))) continue;
        const grid = { x: Number(match[1]), z: Number(match[2]) };
        if (target ? grid.x === target.x && grid.z === target.z : !excluded.includes(`${grid.x},${grid.z}`) && Math.hypot(grid.x - player.x, grid.z - player.z) >= 3.5
          && Math.hypot(grid.x - player.x, grid.z - player.z) <= 6) return { x, y, grid };
      }
    }
    return null;
  }, { target, onlyReady, player: start.player, excluded });
  const choose = async (kind: string) => {
    await page.locator('#changeBuild').click();
    await page.locator(`[data-building="${kind}"]`).click();
  };
  const excluded: string[] = [];
  let floorPoint: Awaited<ReturnType<typeof scan>> = null;
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = await scan(undefined, true, excluded);
    if (!candidate) break;
    excluded.push(`${candidate.grid.x},${candidate.grid.z}`);
    const { x, z } = candidate.grid;
    if (!await scan({ x: x + 2, z })) continue;
    await choose('wall');
    const north = await scan({ x, z: z - 1 });
    const south = await scan({ x, z: z + 1 });
    const north2 = await scan({ x: x + 2, z: z - 1 });
    const south2 = await scan({ x: x + 2, z: z + 1 });
    await page.locator('#rotateBuild').click();
    const west = await scan({ x: x - 1, z });
    const east = await scan({ x: x + 3, z });
    await page.locator('#rotateBuild').click();
    await choose('floor');
    if (north && south && north2 && south2 && west && east) { floorPoint = await scan(candidate.grid); break; }
  }
  expect(floorPoint, 'No clear site for a two-cell house').not.toBeNull();
  await page.mouse.move(floorPoint!.x, floorPoint!.y);
  await page.locator('#confirmBuild').click();
  await expect.poll(async () => (await readRecord(page)).structures.length).toBe(1);
  const floor = (await readRecord(page)).structures[0];
  const secondFloor = { x: floor.x + 2, z: floor.z };
  const edges = [
    { x: floor.x, z: floor.z - 1 }, { x: floor.x, z: floor.z + 1 },
    { x: secondFloor.x, z: floor.z - 1 }, { x: secondFloor.x, z: floor.z + 1 },
    { x: floor.x - 1, z: floor.z }, { x: secondFloor.x + 1, z: floor.z },
  ].sort((a, b) => Math.hypot(a.x - start.player.x, a.z - start.player.z) - Math.hypot(b.x - start.player.x, b.z - start.player.z));
  const aim = async (target: { x: number; z: number }, ready = true) => {
    const point = await scan(target, ready);
    if (!point) {
      const blocked = await scan(target, false);
      throw new Error(`No valid target for ${target.x},${target.z}; ${blocked ? await page.locator('#placementStatus').innerText() : 'outside visible terrain'}`);
    }
    await page.mouse.move(point!.x, point!.y);
  };
  await aim(secondFloor);
  await page.locator('#confirmBuild').click();
  await expect.poll(async () => (await readRecord(page)).structures.length).toBe(2);
  for (const index of [0, 1, 2, 3, 4, 5]) {
    await choose('wall');
    await aim(edges[index]);
    await page.locator('#confirmBuild').click();
    await expect.poll(async () => (await readRecord(page)).structures.filter(piece => piece.kind !== 'roof').length).toBe(index + 3);
  }
  for (const [index, kind] of ['doorframe', 'windowframe'].entries()) {
    await choose(kind);
    await aim(edges[index]);
    await expect(page.locator('#placementStatus')).toContainText('Replace wall');
    await page.locator('#confirmBuild').click();
    await expect.poll(async () => (await readRecord(page)).structures.some(piece => piece.kind === kind)).toBe(true);
  }
  await choose('door');
  await aim(edges[0]);
  await page.locator('#confirmBuild').click();
  await expect.poll(async () => (await readRecord(page)).structures.some(piece => piece.kind === 'door')).toBe(true);
  await choose('window');
  await aim(edges[1]);
  await page.locator('#confirmBuild').click();
  await expect.poll(async () => (await readRecord(page)).structures.some(piece => piece.kind === 'window')).toBe(true);
  await choose('floor');
  await aim({ x: floor.x, z: floor.z }, false);
  await page.locator('#roofControls summary').click();
  await page.locator('#roofStyle').selectOption('gable');
  await page.locator('#applyRoof').click();
  await expect(page.locator('#toast')).toHaveText('Roof reshaped · 0 wood');
  await expect.poll(async () => (await readRecord(page)).structures.find(piece => piece.kind === 'roof')?.roofShape?.style).toBe('gable');
  const built = await readRecord(page);
  expect(built.resources.wood).toBe(75);
  expect(built.ingots.glass).toBe(0);
  expect(built.structures).toHaveLength(12);
  expect(built.structures.filter(piece => piece.kind === 'roof' && piece.roofShape?.style === 'gable')).toHaveLength(2);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.screenshot({ path: testInfo.outputPath('player-built-gable.png') });
  await page.locator('#pauseButton').click();
  await page.locator('#cameraFollow').uncheck();
  await page.locator('#resumeGame').click();
  let position = start.player;
  const walkTo = async (target: { x: number; z: number }) => {
    for (let attempt = 0; attempt < 30; attempt++) {
      const dx = target.x - position.x, dz = target.z - position.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.25) return;
      const cameraX = dx * Math.cos(0.78) - dz * Math.sin(0.78);
      const cameraZ = dx * Math.sin(0.78) + dz * Math.cos(0.78);
      const largest = Math.max(Math.abs(cameraX), Math.abs(cameraZ));
      const keys = [
        ...(Math.abs(cameraX) > largest * 0.4 ? [cameraX > 0 ? 'd' : 'a'] : []),
        ...(Math.abs(cameraZ) > largest * 0.4 ? [cameraZ > 0 ? 's' : 'w'] : []),
      ];
      for (const key of keys) await page.keyboard.down(key);
      await page.waitForTimeout(Math.min(300, Math.max(60, distance * 180)));
      for (const key of keys) await page.keyboard.up(key);
      await save(page);
      position = (await readRecord(page)).player;
    }
    expect(Math.hypot(target.x - position.x, target.z - position.z), 'Could not walk to target').toBeLessThan(0.25);
  };
  const doorwayFloor = [floor, secondFloor].sort((a, b) => Math.hypot(a.x - edges[0].x, a.z - edges[0].z)
    - Math.hypot(b.x - edges[0].x, b.z - edges[0].z))[0];
  await walkTo({ x: doorwayFloor.x + (edges[0].x - doorwayFloor.x) * 1.6, z: doorwayFloor.z + (edges[0].z - doorwayFloor.z) * 1.6 });
  await page.keyboard.press('e');
  await expect(page.locator('#toast')).toHaveText('Door opened');
  await walkTo(doorwayFloor);
  await expect(page.locator('#shelterStatus')).toHaveText('SHELTERED');
  await page.waitForTimeout(500);
  await page.screenshot({ path: testInfo.outputPath('player-inside-gable.png') });
  await save(page);
  const entered = await readRecord(page);
  expect(entered.structures.find(piece => piece.kind === 'door')?.open).toBe(true);
  await page.reload();
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#exportSave').click();
  const downloaded = JSON.parse(await readFile(await (await downloadPromise).path(), 'utf8')) as World;
  expect(downloaded.structures).toEqual(JSON.parse(JSON.stringify(entered.structures)));
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#importSaveFile').setInputFiles({ name: 'roof-save.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(downloaded)) });
  await expect(page.locator('#toast')).toHaveText('Save imported. Select Continue.');
  await page.locator('#continueGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  await expect(page.locator('#shelterStatus')).toHaveText('SHELTERED');
  expect((await readRecord(page)).structures).toEqual(JSON.parse(JSON.stringify(entered.structures)));
  expect(errors).toEqual([]);
});

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900, touch: false },
  { name: 'mobile portrait', width: 390, height: 844, touch: true },
  { name: 'mobile landscape', width: 844, height: 390, touch: true },
]) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: viewport.touch, isMobile: viewport.touch });

    test('places and restores structural pieces and operates a persistent door', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      if (!viewport.touch) await page.addInitScript(() => Object.defineProperty(crypto, 'randomUUID', { value: undefined }));
      await page.goto('./');
      await page.locator('#newGame').click();
      await save(page);
      await setFixture(page, 'legacy');
      await page.reload();
      await page.locator('#continueGame').click();
      await expect(page.locator('#pauseButton')).toBeVisible();
      await expect(page.locator('#roofStyle')).toHaveValue('flat');
      expect((await readRecord(page, 'pre-construction-backup')).version).toBe(6);
      await page.locator('[data-tool="build"]').click();

      const aim = async (x: number, y: number) => {
        if (viewport.touch) await page.touchscreen.tap(x, y);
        else await page.mouse.move(x, y);
      };
      const findTarget = async () => {
        for (const y of [0.55, 0.65, 0.75, 0.45, 0.8]) {
          for (const x of [0.5, 0.35, 0.65, 0.25, 0.75]) {
            const point = { x: Math.round(viewport.width * x), y: Math.round(viewport.height * y) };
            await aim(point.x, point.y);
            if (await page.locator('#placementStatus').innerText() === 'Ready to place') return point;
          }

        }
        throw new Error('No valid visible construction target');
      };
      const place = async () => {
        if (viewport.touch) await page.locator('#actionA').tap();
        else await page.locator('#confirmBuild').click();
      };
      const choose = async (kind: string) => {
        await page.locator(`[data-building="${kind}"]`).click();
        await expect(page.locator('#buildPanel')).toBeHidden();
        await expect(page.locator('#floorControls')).toBeVisible();
      };
      await choose('floor');
      await findTarget();
      await place();
      await expect.poll(async () => (await readRecord(page)).structures?.length).toBe(1);
      await page.locator('#floorUp').click();
      await expect(page.locator('#floorLevel')).toHaveText('LEVEL 1');
      await expect(page.locator('#placementStatus')).toHaveText('Ready to place');
      await place();
      await expect.poll(async () => (await readRecord(page)).structures?.length).toBe(2);
      await page.locator('#floorDown').click();
      await page.locator('#changeBuild').click();
      await choose('doorframe');
      const framePoint = await findTarget();
      await place();
      await expect.poll(async () => (await readRecord(page)).structures?.length).toBe(3);
      await page.locator('#changeBuild').click();
      await choose('door');
      await aim(framePoint.x, framePoint.y);
      await expect(page.locator('#placementStatus')).toHaveText('Ready to place');
      await place();
      await expect.poll(async () => (await readRecord(page)).structures?.length).toBe(4);
      const built = await readRecord(page);
      expect(built.resources.wood).toBe(42);
      expect(built.structures.filter(piece => piece.kind === 'floor').map(piece => piece.level)).toEqual([0, 1]);
      if (viewport.touch) await page.locator('#actionB').tap();
      else await page.keyboard.press('Escape');
      await save(page);
      await setFixture(page, 'door');
      await page.reload();
      await page.locator('#continueGame').click();
      await expect(page.locator('#pauseButton')).toBeVisible();
      if (viewport.touch) await page.locator('#actionB').tap();
      else await page.keyboard.press('e');
      await expect(page.locator('#toast')).toHaveText('Door opened');
      await expect.poll(async () => (await readRecord(page)).structures.find(piece => piece.kind === 'door')?.open).toBe(true);
      await page.reload();
      await page.locator('#continueGame').click();
      await expect(page.locator('#pauseButton')).toBeVisible();
      if (viewport.touch) await page.locator('#actionB').tap();
      else await page.keyboard.press('e');
      await expect(page.locator('#toast')).toHaveText('Door closed');
      await expect.poll(async () => (await readRecord(page)).structures.find(piece => piece.kind === 'door')?.open).toBe(false);
      expect(errors).toEqual([]);
    });

    if (viewport.touch) test('installs glass with touch and restores the window', async ({ page }) => {
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
            data.resources.wood = 10;
            data.ingots.glass = 1;
            data.wildlife = [];
            store.put(data, 'primary');
          };
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => reject(tx.error);
        };
      }));
      await page.reload();
      await page.locator('#continueGame').click();
      await page.locator('[data-tool="build"]').click();
      await page.locator('[data-building="windowframe"]').click();
      let point: { x: number; y: number } | undefined;
      for (const y of [0.55, 0.65, 0.75, 0.45, 0.8]) {
        for (const x of [0.5, 0.35, 0.65, 0.25, 0.75]) {
          const candidate = { x: Math.round(viewport.width * x), y: Math.round(viewport.height * y) };
          await page.touchscreen.tap(candidate.x, candidate.y);
          if (await page.locator('#placementStatus').innerText() === 'Ready to place') { point = candidate; break; }
        }
        if (point) break;
      }
      expect(point).toBeDefined();
      await page.locator('#actionA').tap();
      await expect.poll(async () => (await readRecord(page)).structures.length).toBe(1);
      const frame = (await readRecord(page)).structures[0];
      await page.locator('#changeBuild').click();
      await page.locator('[data-building="window"]').click();
      let aimed = false;
      for (const dy of [0, -8, 8, -16, 16, -32, 32, -48, 48]) {
        for (const dx of [0, -8, 8, -16, 16, -32, 32, -48, 48]) {
          const x = point!.x + dx;
          const y = point!.y + dy;
          if (!await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id === 'game', { x, y })) continue;
          await page.touchscreen.tap(x, y);
          const coordinates = await page.locator('#placementCoordinates').innerText();
          if (coordinates.startsWith(`Grid ${frame.x}, ${frame.z} ·`) && await page.locator('#placementStatus').innerText() === 'Ready to place') {
            aimed = true;
            break;
          }
        }
        if (aimed) break;
      }
      expect(aimed, 'Could not aim at the placed window frame with touch').toBe(true);
      await page.locator('#actionA').tap();
      await expect.poll(async () => (await readRecord(page)).structures.length).toBe(2);
      const built = await readRecord(page);
      expect(built.resources.wood).toBe(7);
      expect(built.ingots.glass).toBe(0);
      await page.locator('#actionB').tap();
      await save(page);
      await page.reload();
      await page.locator('#continueGame').click();
      await expect(page.locator('#pauseButton')).toBeVisible();
      expect((await readRecord(page)).structures).toEqual(built.structures);
    });
  });
}

test('climbs fixture-built stairs and renders a roof after reloading', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /shader|webglprogram/i.test(message.text())) errors.push(message.text());
  });
  await page.goto('./');
  await page.locator('#newGame').click();
  await save(page);
  const start = await page.evaluate(() => new Promise<{ x: number; z: number; y: number }>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('saves', 'readwrite');
      const store = tx.objectStore('saves');
      const get = store.get('primary');
      let start: { x: number; z: number; y: number };
      get.onsuccess = () => {
        const data = get.result;
        data.version = 11;
        delete data.planetPositions;
        const x = Math.round(data.player.x / 2) * 2;
        const z = Math.round(data.player.z / 2) * 2;
        const y = data.player.y;
        start = { x, z: z + 0.9, y };
        data.player = start;
        data.npc = { x: x + 15, z: z + 15 };
        data.vehicle = { x: x - 15, z: z - 15 };
        data.structures = [
          { id: 'stairs', kind: 'stairs', x, z, y, level: 0, rotation: 2, open: false },
          { id: 'upper', kind: 'floor', x, z: z - 2, y: y + 2.4, level: 1, rotation: 0, open: false },
          { id: 'roof', kind: 'roof', x, z, y, level: 0, rotation: 0, open: false },
        ];
        store.put(data, 'primary');
      };
      tx.oncomplete = () => { db.close(); resolve(start); };
      tx.onerror = () => reject(tx.error);
    };
  }));
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  await page.locator('#pauseButton').click();
  await page.locator('#cameraFollow').uncheck();
  await page.locator('#resumeGame').click();
  await page.keyboard.down('w');
  await page.keyboard.down('d');
  await page.waitForTimeout(500);
  await page.keyboard.up('w');
  await page.keyboard.up('d');
  await save(page);
  const after = await readRecord(page);
  expect(after.player.z).toBeLessThan(start.z - 1);
  expect(after.player.y).toBeGreaterThan(start.y + 1);
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  await save(page);
  expect((await readRecord(page)).player.y).toBeGreaterThan(start.y + 1);
  expect(errors).toEqual([]);
});

test('completes and demolishes a fixture-assisted room with a paid automatic roof', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await page.locator('#newGame').click();
  await save(page);
  await setFixture(page, 'legacy');
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  await page.waitForTimeout(800);
  await page.locator('[data-tool="build"]').click();
  await page.locator('[data-building="wall"]').click();
  let point: { x: number; y: number } | undefined;
  for (const y of [500, 600, 700, 400]) {
    for (const x of [720, 500, 950, 350, 1100]) {
      await page.mouse.move(x, y);
      if (await page.locator('#placementStatus').innerText() === 'Ready to place') { point = { x, y }; break; }
    }
    if (point) break;
  }
  expect(point).toBeDefined();
  const coordinates = await page.locator('#placementCoordinates').innerText();
  const match = /Grid (-?\d+), (-?\d+) · Level 0 · Elev (-?[\d.]+)/.exec(coordinates);
  expect(match).not.toBeNull();
  const target = { x: Number(match![1]), z: Number(match![2]), y: Number(match![3]) };
  await page.keyboard.press('Escape');
  await save(page);
  await page.evaluate(target => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('saves', 'readwrite');
      const store = tx.objectStore('saves');
      const get = store.get('primary');
      get.onsuccess = () => {
        const data = get.result;
        const common = { y: target.y, level: 0, open: false };
        data.structures = [
          { ...common, id: 'floor', kind: 'floor', x: target.x, z: target.z - 1, rotation: 0 },
          { ...common, id: 'back', kind: 'wall', x: target.x, z: target.z - 2, rotation: 0 },
          { ...common, id: 'left', kind: 'doorframe', x: target.x - 1, z: target.z - 1, rotation: 1 },
          { ...common, id: 'door', kind: 'door', x: target.x - 1, z: target.z - 1, rotation: 1 },
          { ...common, id: 'right', kind: 'wall', x: target.x + 1, z: target.z - 1, rotation: 1 },
        ];
        store.put(data, 'primary');
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }), target);
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  await page.waitForTimeout(800);
  await page.locator('[data-tool="build"]').click();
  await page.locator('[data-building="wall"]').click();
  await page.mouse.move(point!.x, point!.y);
  await expect(page.locator('#placementCoordinates')).toHaveText(coordinates);
  await expect(page.locator('#placementStatus')).toHaveText('Ready to place');
  await page.locator('#confirmBuild').click();
  await expect(page.locator('#toast')).toHaveText('Room roofed · 2 wood');
  await expect.poll(async () => (await readRecord(page)).structures.filter(piece => piece.kind === 'roof').length).toBe(1);
  expect((await readRecord(page)).resources.wood).toBe(46);
  await page.keyboard.press('Escape');
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  expect((await readRecord(page)).structures.filter(piece => piece.kind === 'roof')).toHaveLength(1);
  await page.waitForTimeout(800);
  await page.locator('[data-tool="build"]').click();
  await page.locator('[data-building="wall"]').click();
  await page.mouse.move(point!.x, point!.y);
  await expect(page.locator('#placementCoordinates')).toHaveText(coordinates);
  await page.locator('#removePiece').click();
  await expect.poll(async () => (await readRecord(page)).structures.filter(piece => piece.kind === 'roof').length).toBe(0);
  expect((await readRecord(page)).resources.wood).toBe(48);
  await page.keyboard.press('Escape');
  await save(page);
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  expect((await readRecord(page)).structures).toHaveLength(5);
});

test('retries an unpaid roof after gathering wood and reloads without duplicate charges', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await page.locator('#newGame').click();
  await save(page);
  await setFixture(page, 'legacy');
  await page.reload();
  await page.locator('#continueGame').click();
  await page.locator('[data-tool="build"]').click();
  await page.locator('[data-building="wall"]').click();
  let point: { x: number; y: number } | undefined;
  for (const y of [500, 600, 700, 400]) {
    for (const x of [720, 500, 950, 350, 1100]) {
      await page.mouse.move(x, y);
      if (await page.locator('#placementStatus').innerText() === 'Ready to place') { point = { x, y }; break; }
    }
    if (point) break;
  }
  expect(point).toBeDefined();
  const coordinates = await page.locator('#placementCoordinates').innerText();
  const match = /Grid (-?\d+), (-?\d+) · Level 0 · Elev (-?[\d.]+)/.exec(coordinates);
  expect(match).not.toBeNull();
  const target = { x: Number(match![1]), z: Number(match![2]), y: Number(match![3]) };
  await page.keyboard.press('Escape');
  await save(page);
  await page.evaluate(target => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('saves', 'readwrite');
      const store = tx.objectStore('saves');
      const get = store.get('primary');
      get.onsuccess = () => {
        const data = get.result;
        const common = { y: target.y, level: 0, open: false };
        data.structures = [
          { ...common, id: 'floor', kind: 'floor', x: target.x, z: target.z - 1, rotation: 0 },
          { ...common, id: 'back', kind: 'wall', x: target.x, z: target.z - 2, rotation: 0 },
          { ...common, id: 'left', kind: 'wall', x: target.x - 1, z: target.z - 1, rotation: 1 },
          { ...common, id: 'right', kind: 'wall', x: target.x + 1, z: target.z - 1, rotation: 1 },
        ];
        data.resources.wood = 2;
        data.wildlife = [];
        store.put(data, 'primary');
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }), target);
  await page.reload();
  await page.locator('#continueGame').click();
  await page.locator('[data-tool="build"]').click();
  await page.locator('[data-building="wall"]').click();
  await page.mouse.move(point!.x, point!.y);
  await expect(page.locator('#placementCoordinates')).toHaveText(coordinates);
  await page.locator('#confirmBuild').click();
  await expect(page.locator('#toast')).toHaveText('Room enclosed; need 2 wood for its roof');
  await expect.poll(async () => (await readRecord(page)).pendingRoofs?.length).toBe(1);
  expect((await readRecord(page)).resources.wood).toBe(0);
  await page.keyboard.press('Escape');
  await save(page);
  await page.evaluate(async () => {
    const { World } = await import('/NewDawn/src/world.ts');
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('new-dawn', 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('saves', 'readwrite');
        const store = tx.objectStore('saves');
        const get = store.get('primary');
        get.onsuccess = () => {
          const data = get.result;
          data.version = 11;
          delete data.planetPositions;
          const world = new World(data.seed);
          const tree = world.group.children.find(item => item.userData.resource === 'wood'
            && !world.findNearestDeposit(item.position.x, item.position.z, 1));
          if (!tree) { tx.abort(); world.dispose(); return; }
          data.player = { x: tree.position.x, y: tree.position.y, z: tree.position.z };
          data.npc = { x: tree.position.x + 20, z: tree.position.z + 20 };
          data.vehicle = { x: tree.position.x + 25, z: tree.position.z + 25 };
          world.dispose();
          store.put(data, 'primary');
        };
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onabort = () => { db.close(); reject(tx.error ?? new Error('No suitable tree found')); };
        tx.onerror = () => reject(tx.error);
      };
    });
  });
  await page.reload();
  await page.locator('#continueGame').click();
  expect((await readRecord(page)).pendingRoofs).toHaveLength(1);
  const treeId = await page.evaluate(() => {
    const state = (window as Window & { __newDawnState: () => {
      trees: Array<{ id: string; x: number; z: number }>; player: { x: number; z: number };
    } }).__newDawnState();
    return state.trees.sort((a, b) => Math.hypot(a.x - state.player.x, a.z - state.player.z)
      - Math.hypot(b.x - state.player.x, b.z - state.player.z))[0]?.id;
  });
  expect(treeId).toBeDefined();
  await sawTree(page, treeId!);
  await timberAction(page);
  await expect(page.locator('#toast')).toHaveText('Room roofed · 2 wood');
  await expect.poll(async () => (await readRecord(page)).structures.filter(piece => piece.kind === 'roof').length).toBe(1);
  const finished = await readRecord(page);
  expect(finished.resources.wood).toBe(1);
  expect(finished.pendingRoofs ?? []).toEqual([]);
  await save(page);
  await page.reload();
  await page.locator('#continueGame').click();
  expect((await readRecord(page)).structures.filter(piece => piece.kind === 'roof')).toHaveLength(1);
  expect((await readRecord(page)).resources.wood).toBe(1);
});
