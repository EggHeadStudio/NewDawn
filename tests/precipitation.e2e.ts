import { expect, test } from '@playwright/test';
import type { LineBasicMaterial, LineSegments, Points, PointsMaterial } from 'three';

test('soft snow and wind-tilted rain render and disappear under shelter', async ({ page }) => {
  await page.goto('./');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /shader|webglprogram/i.test(message.text())) errors.push(message.text());
  });
  const samples = await page.evaluate(async () => {
    const THREE = await import('/NewDawn/node_modules/three/build/three.module.js');
    const { Precipitation } = await import('/NewDawn/src/effects.ts');
    const { ShelterIndex } = await import('/NewDawn/src/shelter.ts');
    const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true });
    renderer.setSize(128, 128);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    const precipitation = new Precipitation(scene);
    const points = scene.children[0] as Points;
    const rain = scene.children[1] as LineSegments;
    const positions = points.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) positions.setXYZ(i, 1000, 0, -2);
    positions.setXYZ(0, 0, 0, -2);
    const material = points.material as PointsMaterial;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const context = canvas.getContext('2d')!;
    const sample = (weather: 'Snow' | 'Rain' | 'Storm', shelter?: InstanceType<typeof ShelterIndex>) => {
      precipitation.update(weather, new THREE.Vector3(), 0, shelter, 1.6);
      material.size = 1;
      renderer.render(scene, camera);
      context.drawImage(renderer.domElement, 0, 0);
      const pixels = context.getImageData(0, 0, 128, 128).data;
      const line = (top: number, bottom: number) => {
        const values: number[] = [];
        for (let y = top; y <= bottom; y++) {
          for (let x = 60; x <= 66; x++) values.push(pixels[(y * 128 + x) * 4]);
        }
        return values;
      };
      return {
        center: context.getImageData(64, 64, 1, 1).data[0],
        edge: context.getImageData(76, 64, 1, 1).data[0],
        corner: context.getImageData(76, 76, 1, 1).data[0],
        head: Math.max(...line(61, 64)),
        tail: Math.max(...line(56, 58)),
        linePixels: line(54, 65).filter(value => value > 3).length,
      };
    };
    const shelter = new ShelterIndex();
    shelter.refresh([{ id: 'roof', kind: 'roof', x: 0, z: -2, y: 0, level: 0, rotation: 0, open: false }]);
    const result = [sample('Snow'), sample('Rain'), sample('Snow'), sample('Snow', shelter), sample('Rain', shelter)];
    shelter.refresh([]);
    result.push(sample('Snow', shelter), sample('Rain', shelter), sample('Storm'));
    points.geometry.dispose();
    material.dispose();
    rain.geometry.dispose();
    (rain.material as LineBasicMaterial).dispose();
    renderer.dispose();
    return result;
  });
  for (const snow of [samples[0], samples[2]]) {
    expect(snow.center).toBeGreaterThan(150);
    expect(snow.edge).toBeGreaterThan(0);
    expect(snow.edge).toBeLessThan(snow.center);
    expect(snow.corner).toBeLessThan(3);
  }
  for (const rain of [samples[1], samples[6], samples[7]]) {
    expect(rain.head).toBeGreaterThan(rain.tail);
    expect(rain.tail).toBeGreaterThan(0);
    expect(rain.linePixels).toBeGreaterThan(2);
    expect(rain.linePixels).toBeLessThan(20);
    expect(rain.corner).toBeLessThan(3);
  }
  expect(samples[3].center).toBeLessThan(3);
  expect(samples[4].linePixels).toBe(0);
  expect(samples[5].center).toBeGreaterThan(150);
  expect(errors).toEqual([]);
});

type WeatherState = { terrainReady: boolean; player: { x: number; z: number } };

for (const view of [
  { name: 'desktop', width: 1280, height: 720, touch: false },
  { name: 'portrait', width: 390, height: 844, touch: true },
  { name: 'landscape', width: 844, height: 390, touch: true },
]) {
  test.describe(view.name, () => {
    test.use({ viewport: { width: view.width, height: view.height }, hasTouch: view.touch, isMobile: view.touch });
    for (const sample of [
      { weather: 'Rain', day: 2, minute: 720 },
      { weather: 'Storm', day: 5, minute: 0 },
    ]) {
      test(`plays and reloads in ${sample.weather.toLowerCase()}`, async ({ page }, testInfo) => {
        const errors: string[] = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => {
          if (message.type() === 'error' && /shader|webglprogram/i.test(message.text())) errors.push(message.text());
        });
        const state = () => page.evaluate(() =>
          (window as Window & { __newDawnState: () => WeatherState }).__newDawnState());
        await page.goto('./');
        await page.locator('#worldSeed').fill('1847');
        await page.locator('#newGame').click();
        await page.locator('#pauseButton').click();
        await page.locator('#saveGame').click();
        await expect(page.locator('#toast')).toHaveText('World saved');
        await page.evaluate(({ day, minute }) => new Promise<void>((resolve, reject) => {
          const request = indexedDB.open('new-dawn', 1);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            const db = request.result;
            const tx = db.transaction('saves', 'readwrite');
            const store = tx.objectStore('saves');
            const get = store.get('primary');
            get.onsuccess = () => {
              const save = get.result;
              save.calendar.day = day;
              save.calendar.minute = minute;
              store.put(save, 'primary');
            };
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => { db.close(); reject(tx.error); };
            tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Calendar fixture aborted')); };
          };
        }), sample);
        await page.reload();
        await page.locator('#continueGame').click();
        await expect.poll(async () => (await state()).terrainReady).toBe(true);
        await expect(page.locator('#seasonText')).toContainText(sample.weather.toUpperCase());
        await page.waitForTimeout(2000);
        const before = (await state()).player;
        if (view.touch) {
          const box = await page.locator('#joystick').boundingBox();
          if (!box) throw new Error('Joystick is not visible');
          const cdp = await page.context().newCDPSession(page);
          const x = box.x + box.width / 2, y = box.y + box.height / 2;
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 36, id: 1 }] });
          await page.waitForTimeout(1200);
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await cdp.detach();
        } else {
          await page.keyboard.down('w');
          await page.waitForTimeout(1200);
          await page.keyboard.up('w');
        }
        const moved = (await state()).player;
        expect(Math.hypot(moved.x - before.x, moved.z - before.z)).toBeGreaterThan(0.5);
        await page.screenshot({ path: testInfo.outputPath(`${sample.weather.toLowerCase()}-moving.png`) });
        await page.locator('#pauseButton').click();
        await page.locator('#saveGame').click();
        await expect(page.locator('#toast')).toHaveText('World saved');
        await page.reload();
        await page.locator('#continueGame').click();
        await expect.poll(async () => (await state()).terrainReady).toBe(true);
        await expect(page.locator('#seasonText')).toContainText(sample.weather.toUpperCase());
        const reloaded = (await state()).player;
        expect(Math.hypot(reloaded.x - moved.x, reloaded.z - moved.z)).toBeLessThan(0.5);
        expect(errors).toEqual([]);
      });
    }
  });
}
