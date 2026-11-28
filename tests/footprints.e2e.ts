import { expect, test, type Page } from '@playwright/test';

type State = { player: { x: number; z: number }; cameraAngle: number; footprints: number; terrainReady: boolean };

async function state(page: Page) {
  return page.evaluate(() => (window as Window & { __newDawnState: () => State }).__newDawnState());
}

async function walk(page: Page, touch: boolean) {
  if (!touch) {
    await page.keyboard.down('w');
    await page.waitForTimeout(2400);
    await page.keyboard.up('w');
    return;
  }
  const cdp = await page.context().newCDPSession(page);
  try {
    const box = await page.locator('#joystick').boundingBox();
    if (!box) throw new Error('Joystick is not visible');
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...center, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x: center.x, y: center.y - 36, id: 1 }],
    });
    await page.waitForTimeout(2400);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await cdp.detach();
  }
}

async function setSavedCalendar(page: Page, day: number) {
  await page.evaluate(day => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('saves', 'readwrite');
      const store = tx.objectStore('saves');
      const get = store.get('primary');
      get.onsuccess = () => {
        const data = get.result;
        data.calendar.day = day;
        data.calendar.minute = 720;
        store.put(data, 'primary');
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Calendar fixture aborted')); };
    };
  }), day);
}

test('footprints darken shaded ground instead of lighting it up', async ({ page }) => {
  await page.goto('./');
  const surfaces = await page.evaluate(async () => {
    const THREE = await import('/NewDawn/node_modules/three/build/three.module.js');
    const { Footprints } = await import('/NewDawn/src/footprints.ts');
    const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.setSize(128, 128);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.set(0, 5, 0);
    camera.up.set(0, 0, -1);
    camera.lookAt(0, 0, 0);
    const pixels = () => {
      const gl = renderer.getContext();
      const result = new Uint8Array(128 * 128 * 4);
      gl.readPixels(0, 0, 128, 128, gl.RGBA, gl.UNSIGNED_BYTE, result);
      return result;
    };
    const result = [];
    for (const surface of ['snow', 'sand', 'mud', 'soil', 'rock'] as const) {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#303329');
      scene.add(new THREE.AmbientLight('#ffffff', 3));
      const prints = new Footprints(scene);
      renderer.render(scene, camera);
      const before = pixels();
      prints.update(0, { x: 0, z: -0.75 }, true, () => surface, () => 0);
      prints.update(0.1, { x: 0, z: 0.01 }, true, () => surface, () => 0);
      renderer.render(scene, camera);
      const after = pixels();
      let lightened = 0;
      let darkened = 0;
      for (let index = 0; index < before.length; index += 4) {
        for (let channel = 0; channel < 3; channel++) {
          lightened = Math.max(lightened, after[index + channel] - before[index + channel]);
          darkened = Math.max(darkened, before[index + channel] - after[index + channel]);
        }
      }
      result.push({ surface, lightened, darkened });
      prints.dispose();
    }
    renderer.dispose();
    renderer.getContext().getExtension('WEBGL_lose_context')?.loseContext();
    return result;
  });
  for (const surface of surfaces) {
    expect(surface.lightened, `${surface.surface} should not brighten the ground`).toBeLessThanOrEqual(1);
    expect(surface.darkened, `${surface.surface} should leave a visible mark`).toBeGreaterThan(1);
  }
});

for (const sample of [
  { surface: 'sand', day: 1, weather: 'Clear', target: { x: -19.5, z: 24.5 }, duration: 1050 },
  { surface: 'mud', day: 2, weather: 'Rain', target: { x: 8, z: 8 }, duration: 1400 },
] as const) {
  test(`leaves ${sample.surface} marks during normal walking`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('./');
    await page.locator('#worldSeed').fill('1847');
    await page.locator('#newGame').click();
    await expect.poll(async () => (await state(page)).terrainReady, { timeout: 30000 }).toBe(true);
    await page.locator('#pauseButton').click();
    await page.locator('#cameraFollow').uncheck();
    await page.locator('#saveGame').click();
    await expect(page.locator('#toast')).toHaveText('World saved');
    await setSavedCalendar(page, sample.day);
    await page.reload();
    await page.locator('#continueGame').click();
    await expect.poll(async () => (await state(page)).terrainReady, { timeout: 30000 }).toBe(true);
    await expect(page.locator('#seasonText')).toContainText(sample.weather.toUpperCase());

    let remaining = Infinity;
    for (let attempt = 0; attempt < 150; attempt++) {
      const current = await state(page);
      const dx = sample.target.x - current.player.x, dz = sample.target.z - current.player.z;
      remaining = Math.hypot(dx, dz);
      if (remaining < 0.35) break;
      const x = dx * Math.cos(current.cameraAngle) - dz * Math.sin(current.cameraAngle);
      const z = dx * Math.sin(current.cameraAngle) + dz * Math.cos(current.cameraAngle);
      const largest = Math.max(Math.abs(x), Math.abs(z));
      const keys = [
        ...(Math.abs(x) > largest * 0.4 ? [x > 0 ? 'd' : 'a'] : []),
        ...(Math.abs(z) > largest * 0.4 ? [z > 0 ? 's' : 'w'] : []),
      ];
      for (const key of keys) await page.keyboard.down(key);
      await page.waitForTimeout(Math.min(250, Math.max(50, remaining * 100)));
      for (const key of keys) await page.keyboard.up(key);
    }
    expect(remaining).toBeLessThan(0.35);

    await page.locator('#pauseButton').click();
    await page.locator('#saveGame').click();
    await expect(page.locator('#toast')).toHaveText('World saved');
    await page.reload();
    await page.locator('#continueGame').click();
    await expect.poll(async () => (await state(page)).terrainReady, { timeout: 30000 }).toBe(true);
    await expect.poll(async () => {
      const { x, z } = (await state(page)).player;
      return Math.hypot(x - sample.target.x, z - sample.target.z);
    }, { timeout: 30000 }).toBeLessThan(0.5);
    expect((await state(page)).footprints).toBe(0);
    const surfaceAtPlayer = () => page.evaluate(async ({ weather }) => {
      const { biomeAt, terrainHeight } = await import('/NewDawn/src/world.ts');
      const { footprintSurface } = await import('/NewDawn/src/footprints.ts');
      const { x, z } = (window as Window & { __newDawnState: () => State }).__newDawnState().player;
      return footprintSurface(biomeAt(x, z, 1847), 'Spring', weather, terrainHeight(x, z, 1847));
    }, sample);
    expect(await surfaceAtPlayer()).toBe(sample.surface);
    await page.keyboard.down('w');
    await page.waitForTimeout(sample.duration);
    await page.keyboard.up('w');
    await expect.poll(async () => (await state(page)).footprints).toBeGreaterThan(2);
    expect(await surfaceAtPlayer()).toBe(sample.surface);
    await page.screenshot({ path: testInfo.outputPath(`${sample.surface}-trail.png`) });
    expect(errors).toEqual([]);
  });
}

for (const viewport of [
  { name: 'desktop', width: 1280, height: 720, touch: false },
  { name: 'portrait', width: 390, height: 844, touch: true },
  { name: 'landscape', width: 844, height: 390, touch: true },
]) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.touch, hasTouch: viewport.touch });
    test('leaves temporary tracks in normal play and after a winter reload', async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => {
        if (message.type() === 'error' && /shader|webglprogram/i.test(message.text())) errors.push(message.text());
      });
      await page.goto('./');
      await page.locator('#worldSeed').fill('1847');
      await page.locator('#newGame').click();
      await expect.poll(async () => (await state(page)).terrainReady, { timeout: 30000 }).toBe(true);
      await page.screenshot({ path: testInfo.outputPath('spring-before.png') });
      const start = (await state(page)).player;
      await walk(page, viewport.touch);
      await expect.poll(async () => (await state(page)).footprints).toBeGreaterThan(2);
      const moved = (await state(page)).player;
      expect(Math.hypot(moved.x - start.x, moved.z - start.z)).toBeGreaterThan(1);
      await page.screenshot({ path: testInfo.outputPath('spring-trail.png') });
      await page.locator('#pauseButton').click();
      await page.locator('#saveGame').click();
      await expect(page.locator('#toast')).toHaveText('World saved');
      await setSavedCalendar(page, 22);
      await page.reload();
      await page.locator('#continueGame').click();
      await expect(page.locator('#seasonText')).toContainText('WINTER');
      await expect.poll(async () => (await state(page)).terrainReady, { timeout: 30000 }).toBe(true);
      expect((await state(page)).footprints).toBe(0);
      await page.screenshot({ path: testInfo.outputPath('winter-before.png') });
      await walk(page, viewport.touch);
      await expect.poll(async () => (await state(page)).footprints).toBeGreaterThan(2);
      await page.screenshot({ path: testInfo.outputPath('winter-trail.png') });
      expect(errors).toEqual([]);
    });
  });
}
