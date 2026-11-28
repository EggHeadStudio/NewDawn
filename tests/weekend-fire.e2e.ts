import { expect, test, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';

type State = { player: { x: number; z: number }; terrainReady: boolean;
  rendering: { calls: number; triangles: number; geometries: number; textures: number } };

async function state(page: Page) {
  return page.evaluate(() => (window as Window & { __newDawnState: () => State }).__newDawnState());
}

async function brightness(page: Page, image: Buffer) {
  return page.evaluate(async data => {
    const picture = new Image();
    picture.src = `data:image/png;base64,${data}`;
    await picture.decode();
    const canvas = document.createElement('canvas');
    canvas.width = picture.width;
    canvas.height = picture.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(picture, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let total = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      total += 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
    }
    return total / (pixels.length / 4);
  }, image.toString('base64'));
}

async function fixture(page: Page, minute: number, url = './', debug = true) {
  await page.goto(url);
  await page.locator('#newGame').click();
  if (debug) await expect.poll(async () => (await state(page)).terrainReady, { timeout: 30000 }).toBe(true);
  else await expect(page.locator('#pauseButton')).toBeVisible();
  await page.locator('#pauseButton').click();
  await page.locator('#cameraFollow').uncheck();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.evaluate(minute => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('saves', 'readwrite');
      const store = tx.objectStore('saves');
      const get = store.get('primary');
      get.onsuccess = () => {
        const save = get.result;
        save.resources.wood = 20;
        save.minerals.coal = 1;
        save.calendar.minute = minute;
        save.calendar.speed = 0.5;
        save.wildlife = [];
        store.put(save, 'primary');
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Fire fixture aborted')); };
    };
  }), minute);
  await page.reload();
  await page.locator('#continueGame').click();
  if (debug) await expect.poll(async () => (await state(page)).terrainReady, { timeout: 30000 }).toBe(true);
  else await expect(page.locator('#pauseButton')).toBeVisible();
}

async function craftAndLight(page: Page, touch: boolean) {
  const activate = async (selector: string) => touch ? page.locator(selector).tap() : page.locator(selector).click();
  await activate('#toolHubButton');
  await activate('#inventoryButton');
  await activate('#craftTorch');
  await activate('#equipTorch');
  await activate('#igniteTorch');
  await expect(page.locator('#torchStatus')).toHaveText('Torch: equipped and burning');
  await activate('#closeCraft');
}

test('renders softly rounded sparks instead of square particles', async ({ page }) => {
  await page.goto('./');
  const pixels = await page.evaluate(async () => {
    const THREE = await import('/NewDawn/node_modules/three/build/three.module.js');
    const { FireSparks } = await import('/NewDawn/src/fire-render.ts');
    const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.setSize(128, 128);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#000000');
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 5;
    const sparks = new FireSparks(scene);
    sparks.update([new THREE.Vector3()], 0.5);
    const points = scene.children[0] as THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
    points.material.size = 32;
    points.geometry.setDrawRange(0, 1);
    const position = points.geometry.getAttribute('position');
    position.setXYZ(0, 0, 0, 0);
    position.needsUpdate = true;
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    const read = (x: number, y: number) => {
      const rgba = new Uint8Array(4);
      gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
      return rgba[0];
    };
    const result = { center: read(64, 64), edge: read(64, 49), corner: read(49, 49) };
    renderer.dispose();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return result;
  });
  expect(pixels.center).toBeGreaterThan(80);
  expect(pixels.edge).toBeLessThan(pixels.center / 2);
  expect(pixels.corner).toBeLessThan(3);
});

for (const viewport of [
  { name: 'desktop', width: 1280, height: 720, touch: false },
  { name: 'portrait', width: 390, height: 844, touch: true },
  { name: 'landscape', width: 844, height: 390, touch: true },
]) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.touch, isMobile: viewport.touch });

    test('crafts a torch, lights the world and reloads it', async ({ page }, testInfo) => {
      test.setTimeout(120000);
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => {
        if (message.type() === 'error' && /shader|webgl|program/i.test(message.text())) errors.push(message.text());
      });
      await fixture(page, 0);
      await craftAndLight(page, viewport.touch);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: testInfo.outputPath('night-normal.png') });
      await page.locator('#pauseButton').click();
      await page.locator('#cameraDistance').fill('5');
      await page.locator('#resumeGame').click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: testInfo.outputPath('night-close.png') });
      if (!viewport.touch) for (let frame = 0; frame < 4; frame++) {
        await page.waitForTimeout(150);
        await page.screenshot({ path: testInfo.outputPath(`flame-${frame}.png`),
          clip: { x: 540, y: 330, width: 100, height: 120 } });
      }
      if (process.env.FIRE_PERF) {
        const performance = await page.evaluate(() => new Promise<{
          fps: number; p95: number; spikes: number; rendering: State['rendering'];
        }>(resolve => {
          const frames: number[] = [];
          let start = 0;
          let previous = 0;
          function sample(now: number) {
            if (!start) start = now;
            if (previous) frames.push(now - previous);
            previous = now;
            if (now - start < 10000) { requestAnimationFrame(sample); return; }
            frames.sort((a, b) => a - b);
            resolve({ fps: frames.length * 1000 / (now - start),
              p95: frames[Math.floor(frames.length * 0.95)],
              spikes: frames.filter(frame => frame > 50).length,
              rendering: (window as Window & { __newDawnState: () => State }).__newDawnState().rendering });
          }
          requestAnimationFrame(sample);
        }));
        await writeFile(testInfo.outputPath('performance.json'), JSON.stringify(performance));
      }
      const burning = await page.locator('#game').screenshot();
      await page.locator('#pauseButton').click();
      await page.locator('#saveGame').click();
      await expect(page.locator('#toast')).toHaveText('World saved');
      const saved = await page.evaluate(() => new Promise<{ torch: unknown; wood: number; coal: number }>((resolve, reject) => {
        const request = indexedDB.open('new-dawn', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const get = db.transaction('saves').objectStore('saves').get('primary');
          get.onsuccess = () => {
            const save = get.result;
            db.close();
            resolve({ torch: save.torch, wood: save.resources.wood, coal: save.minerals.coal });
          };
          get.onerror = () => { db.close(); reject(get.error); };
        };
      }));
      expect(saved).toEqual({ torch: { crafted: true, equipped: true, lit: true }, wood: 18, coal: 0 });
      await page.reload();
      await page.locator('#continueGame').click();
      await page.locator('#toolHubButton').click();
      await page.locator('#inventoryButton').click();
      await expect(page.locator('#torchStatus')).toHaveText('Torch: equipped and burning');
      await page.locator('#igniteTorch').click();
      await expect(page.locator('#torchStatus')).toHaveText('Torch: equipped and extinguished');
      await page.locator('#closeCraft').click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: testInfo.outputPath('extinguished.png') });
      const extinguished = await page.locator('#game').screenshot();
      expect(await brightness(page, burning)).toBeGreaterThan(await brightness(page, extinguished) + 1);
      expect(errors).toEqual([]);
    });
  });
}

test('shows a lit torch in daytime gameplay', async ({ page }, testInfo) => {
  test.setTimeout(120000);
  await fixture(page, 720);
  await craftAndLight(page, false);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: testInfo.outputPath('day.png') });
  await expect(page.locator('#toast')).toHaveText('Torch lit');
});

test('places and lights a real torch post, then restores it', async ({ page }, testInfo) => {
  test.setTimeout(120000);
  await fixture(page, 0);
  await craftAndLight(page, false);
  const player = (await state(page)).player;
  await page.locator('[data-tool="build"]').click();
  await page.locator('[data-building="torchpost"]').click();
  const point = await page.evaluate(player => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
    const status = document.querySelector('#placementStatus')!;
    const coordinates = document.querySelector('#placementCoordinates')!;
    for (let y = 100; y < innerHeight - 80; y += 8) for (let x = 100; x < innerWidth - 80; x += 8) {
      if (document.elementFromPoint(x, y) !== canvas) continue;
      canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse', clientX: x, clientY: y }));
      const match = /Grid (-?\d+), (-?\d+)/.exec(coordinates.textContent ?? '');
      if (!match || status.textContent !== 'Ready to place') continue;
      const distance = Math.hypot(Number(match[1]) - player.x, Number(match[2]) - player.z);
      if (distance > 1.1 && distance < 2.3) return { x, y };
    }
    return null;
  }, player);
  expect(point, 'No accessible post placement near the survivor').not.toBeNull();
  await page.mouse.move(point!.x, point!.y);
  await page.locator('#confirmBuild').click();
  await page.locator('#cancelBuild').click();
  await expect(page.locator('#controlsHint')).toContainText('Light torch');
  await page.keyboard.press('e');
  await expect(page.locator('#toast')).toHaveText('Torch post lit');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: testInfo.outputPath('post.png') });
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#controlsHint')).toContainText('Extinguish torch');
  await page.keyboard.press('e');
  await expect(page.locator('#toast')).toHaveText('Torch post extinguished');
});

test('continues a burning torch in the offline production build', async ({ browser }, testInfo) => {
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
    if (message.type() === 'error' && /shader|webgl|program/i.test(message.text())) errors.push(message.text());
  });
  try {
    const url = `http://127.0.0.1:${port}/NewDawn/`;
    await expect.poll(async () => {
      if (preview.exitCode !== null) throw new Error(`Preview exited: ${preview.exitCode}`);
      try { return (await fetch(url)).status; } catch { return 0; }
    }, { timeout: 30000 }).toBe(200);
    await page.goto(url);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller) {
        await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
      }
    });
    await fixture(page, 0, url, false);
    await craftAndLight(page, false);
    await page.locator('#pauseButton').click();
    await page.locator('#saveGame').click();
    await expect(page.locator('#toast')).toHaveText('World saved');
    await context.setOffline(true);
    const bundle = page.waitForResponse(response => /\/assets\/index-[^/]+\.js$/.test(response.url()));
    await page.reload();
    expect((await bundle).fromServiceWorker()).toBe(true);
    await page.locator('#continueGame').click();
    await expect(page.locator('#pauseButton')).toBeVisible();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: testInfo.outputPath('offline-torch.png') });
    await page.locator('#toolHubButton').click();
    await page.locator('#inventoryButton').click();
    await expect(page.locator('#torchStatus')).toHaveText('Torch: equipped and burning');
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
