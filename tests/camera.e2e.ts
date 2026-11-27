import { expect, test, type Page } from '@playwright/test';

function state(page: Page) {
  return page.evaluate(() => (window as Window & {
    __newDawnState: () => {
      terrainReady: boolean;
      player: { x: number; z: number };
      cameraView: { pitch: number; directionY: number; groundClearance: number };
    };
  }).__newDawnState());
}

for (const mode of ['mouse', 'legacy', 'portrait', 'landscape']) {
  for (const lighting of ['day', 'moon']) {
    test(`looks above the canopy and returns to follow view: ${mode}, ${lighting}`, async ({ browser }, testInfo) => {
      const touch = mode === 'portrait' || mode === 'landscape';
      const viewport = mode === 'portrait' ? { width: 390, height: 844 }
        : mode === 'landscape' ? { width: 844, height: 390 } : { width: 1280, height: 720 };
      const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        await page.goto('./');
        await page.locator('#worldSeed').fill('1847');
        await page.locator('#newGame').click();
        await page.locator('#pauseButton').click();
        await page.locator('#saveGame').click();
        await expect(page.locator('#toast')).toHaveText('World saved');
        await page.evaluate(async lighting => {
          const { terrainHeight } = await import('/NewDawn/src/world.ts');
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open('new-dawn', 1);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          const save = await new Promise<Record<string, unknown>>((resolve, reject) => {
            const request = db.transaction('saves').objectStore('saves').get('primary');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          save.version = 11;
          delete save.planetPositions;
          save.player = { x: 0, y: terrainHeight(0, 0, 1847), z: 0 };
          save.npc = { x: 50, z: 50 };
          save.vehicle = { x: 40, z: 40 };
          save.wildlife = [];
          save.calendar = { minute: lighting === 'day' ? 720 : 0, day: 15, speed: 0.5 };
          await new Promise<void>((resolve, reject) => {
            const transaction = db.transaction('saves', 'readwrite');
            transaction.objectStore('saves').put(save, 'primary');
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
          });
          db.close();
        }, lighting);
        await page.reload();
        await page.locator('#continueGame').click();
        await expect(page.locator('#menu')).not.toHaveClass(/active/);
        await expect.poll(async () => (await state(page)).terrainReady).toBe(true);
        if (mode === 'legacy') {
          await page.locator('#pauseButton').click();
          await page.locator('#legacyCamera').check();
          await page.locator('#resumeGame').click();
        }
        await page.waitForTimeout(1500);
        const before = await state(page);
        expect(before.cameraView.directionY).toBeLessThan(-0.3);
        await page.screenshot({ path: testInfo.outputPath('follow.png') });
        const x = viewport.width * 0.65;
        const cdp = touch ? await context.newCDPSession(page) : undefined;
        const drag = async (startY: number, dy: number) => {
          if (cdp) {
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x, y: startY }] });
            for (let step = 1; step <= 8; step++) {
              await cdp.send('Input.dispatchTouchEvent', {
                type: 'touchMove', touchPoints: [{ id: 1, x, y: startY + dy * step / 8 }],
              });
            }
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          } else {
            await page.mouse.move(x, startY);
            await page.mouse.down({ button: 'right' });
            await page.mouse.move(x, startY + dy, { steps: 8 });
            await page.mouse.up({ button: 'right' });
          }
        };
        let mouseY = viewport.height * 0.75;
        if (mode === 'mouse') {
          await page.mouse.click(x, mouseY);
          await expect.poll(() => page.evaluate(() => document.pointerLockElement?.id)).toBe('game');
          mouseY = viewport.height * 0.05;
          await page.mouse.move(x, mouseY, { steps: 12 });
        } else {
          for (let attempt = 0; attempt < 8 && (await state(page)).cameraView.pitch > -1.1; attempt++) {
            await drag(viewport.height * 0.45, -viewport.height * 0.33);
          }
        }

        await expect.poll(async () => (await state(page)).cameraView.directionY).toBeGreaterThan(0.9);
        const upward = await state(page);
        expect(upward.cameraView.groundClearance).toBeGreaterThanOrEqual(0.49);
        expect(upward.player.x).toBeCloseTo(before.player.x, 3);
        expect(upward.player.z).toBeCloseTo(before.player.z, 3);
        await page.screenshot({ path: testInfo.outputPath('upward.png') });
        if (mode === 'mouse') {
          mouseY += (0.48 - upward.cameraView.pitch) / 0.004;
          await page.mouse.move(x, mouseY, { steps: 12 });
        } else {
          for (let attempt = 0; attempt < 8; attempt++) {
            const remaining = 0.48 - (await state(page)).cameraView.pitch;
            if (Math.abs(remaining) < 0.005) break;
            await drag(viewport.height * 0.4, Math.min(viewport.height * 0.35, remaining / 0.004));
          }
        }
        await expect.poll(async () => (await state(page)).cameraView.pitch).toBeCloseTo(0.48, 2);
        await expect.poll(async () => (await state(page)).cameraView.directionY).toBeLessThan(-0.3);
        await page.screenshot({ path: testInfo.outputPath('restored.png') });
        await page.evaluate(() => document.exitPointerLock());
        await page.locator('#pauseButton').click();
        await page.locator('#saveGame').click();
        await expect(page.locator('#toast')).toHaveText('World saved');
        await page.reload();
        await page.locator('#continueGame').click();
        await expect(page.locator('#menu')).not.toHaveClass(/active/);
        await expect.poll(async () => (await state(page)).terrainReady).toBe(true);
        const reloaded = await state(page);
        expect(reloaded.player.x).toBeCloseTo(before.player.x, 3);
        expect(reloaded.player.z).toBeCloseTo(before.player.z, 3);
        expect(reloaded.cameraView.directionY).toBeLessThan(-0.3);
        expect(errors).toEqual([]);
        await testInfo.attach('camera-views', {
          body: JSON.stringify({ before, upward, reloaded }), contentType: 'application/json',
        });
      } finally {
        await context.close();
      }
    });
  }
}

test('upper-floor clearance is rendered and opaque floors retain depth', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error' && /shader|webglprogram/i.test(message.text())) errors.push(message.text());
  });
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const THREE = await import('/NewDawn/node_modules/three/build/three.module.js');
    const { ConstructionRenderer } = await import('/NewDawn/src/construction-render.ts');
    const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.setSize(128, 128);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('white');
    scene.add(new THREE.AmbientLight('white', 2));
    const construction = new ConstructionRenderer();
    construction.refresh([
      { id: 'upper', kind: 'floor', x: 0, z: 0, y: 2.4, level: 1, rotation: 0, open: false },
      { id: 'ground', kind: 'floor', x: 0, z: 0, y: 0, level: 0, rotation: 0, open: false },
    ]);
    scene.add(construction.group);
    const player = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.6, 0.8), new THREE.MeshBasicMaterial({ color: 'red' }));
    player.position.y = 1;
    scene.add(player);
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 5, 0.01);
    camera.lookAt(0, 1, 0);
    const pixel = () => {
      renderer.render(scene, camera);
      const rgba = new Uint8Array(4);
      renderer.getContext().readPixels(64, 64, 1, 1, renderer.getContext().RGBA, renderer.getContext().UNSIGNED_BYTE, rgba);
      return [...rgba];
    };
    const covered = pixel();
    construction.update(1, new THREE.Vector3(0, 0.18, 0), camera.position);
    const cleared = pixel();
    player.position.y = -1;
    camera.position.set(0, 1.8, 0.01);
    camera.lookAt(player.position);
    const groundCovered = pixel();
    construction.group.visible = false;
    const groundRemoved = pixel();
    renderer.dispose();
    return { covered, cleared, groundCovered, groundRemoved };
  });
  expect(result.cleared[0] - result.cleared[1]).toBeGreaterThan(result.covered[0] - result.covered[1] + 50);
  expect(result.groundRemoved[0] - result.groundRemoved[1]).toBeGreaterThan(result.groundCovered[0] - result.groundCovered[1] + 50);
  expect(errors).toEqual([]);
});

for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
  test(`upper-floor interior remains usable after reload at ${viewport.width}`, async ({ browser }, testInfo) => {
    const touch = viewport.width < 500;
    const context = await browser.newContext({ viewport, hasTouch: touch, isMobile: touch });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && /shader|webglprogram/i.test(message.text())) errors.push(message.text());
    });
    try {
      await page.goto('./');
      await page.locator('#worldSeed').fill('1847');
      await page.locator('#newGame').click();
      await page.locator('#pauseButton').click();
      await page.locator('#saveGame').click();
      await expect(page.locator('#toast')).toHaveText('World saved');
      const start = await page.evaluate(async () => {
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
        const { terrainHeight } = await import('/NewDawn/src/world.ts');
        const player = data.player as { x: number; z: number };
        const x = Math.round(player.x / 2) * 2;
        const z = Math.round(player.z / 2) * 2;
        const y = terrainHeight(x, z, 1847);
        data.version = 11;
        delete data.planetPositions;
        data.player = { x, y, z };
        data.npc = { x: x + 40, z: z + 40 };
        data.vehicle = { x: x + 40, z: z - 40 };
        data.wildlife = [];
        data.calendar = { minute: 720, day: 1, speed: 0.5 };
        const base = { y, level: 0, open: false };
        data.structures = [
          { ...base, id: 'ground', kind: 'floor', x, z, rotation: 0 },
          { ...base, id: 'north', kind: 'wall', x, z: z - 1, rotation: 0 },
          { ...base, id: 'south', kind: 'wall', x, z: z + 1, rotation: 0 },
          { ...base, id: 'east', kind: 'wall', x: x + 1, z, rotation: 1 },
          { ...base, id: 'west', kind: 'wall', x: x - 1, z, rotation: 1 },
          ...[-2, 0, 2].flatMap(dx => [-2, 0, 2].map(dz => ({
            ...base, id: `upper-${dx}-${dz}`, kind: 'floor', x: x + dx, z: z + dz,
            y: y + 2.4, level: 1, rotation: 0,
          }))),
        ];
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('saves', 'readwrite');
          tx.objectStore('saves').put(data, 'primary');
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        });
        db.close();
        return { x, z };
      });
      await page.reload();
      await page.locator('#continueGame').click();
      await expect(page.locator('#menu')).not.toHaveClass(/active/);
      await expect(page.locator('#shelterStatus')).toHaveText('SHELTERED');
      await expect.poll(async () => (await state(page)).terrainReady).toBe(true);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: testInfo.outputPath('upper-floor.png') });
      await page.locator('#pauseButton').click();
      await page.locator('#saveGame').click();
      await expect(page.locator('#toast')).toHaveText('World saved');
      await page.reload();
      await page.locator('#continueGame').click();
      await expect(page.locator('#menu')).not.toHaveClass(/active/);
      await expect(page.locator('#shelterStatus')).toHaveText('SHELTERED');
      const reloaded = await state(page);
      expect(reloaded.player.x).toBeCloseTo(start.x, 2);
      expect(reloaded.player.z).toBeCloseTo(start.z, 2);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
