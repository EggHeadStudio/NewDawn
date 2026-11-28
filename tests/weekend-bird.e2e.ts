import { expect, test, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';

type Bird = { id: string; species: string; x: number; z: number; health: number;
  behavior: string; authored: boolean; animation: string | null; flightHeight: number };
type State = { player: { x: number; z: number }; cameraAngle: number; terrainReady: boolean; wildlife: Bird[] };

async function state(page: Page) {
  return page.evaluate(() => (window as Window & { __newDawnState: () => State }).__newDawnState());
}

async function activate(page: Page, selector: string, touch: boolean) {
  if (touch) await page.locator(selector).tap();
  else await page.locator(selector).click();
}

async function placeBirdInSavedScene(page: Page, angle: number, version12 = false) {
  return page.evaluate(({ angle, version12 }) => new Promise<string>((resolve, reject) => {
    const opening = indexedDB.open('new-dawn', 1);
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
      const tx = db.transaction('saves', 'readwrite');
      const store = tx.objectStore('saves');
      const get = store.get('primary');
      let id = '';
      get.onsuccess = () => {
        const save = get.result;
        const bird = save.wildlife.find((animal: Bird) => animal.id === 'bird-0');
        if (!bird) { tx.abort(); return; }
        id = bird.id;
        bird.x = save.player.x - Math.sin(angle) * 5 + Math.cos(angle) * 1.2;
        bird.z = save.player.z - Math.cos(angle) * 5 - Math.sin(angle) * 1.2;
        bird.homeX = bird.x;
        bird.homeZ = bird.z;
        bird.heading = angle + Math.PI / 2;
        bird.behavior = 'rest';
        bird.decisionTimer = 60;
        delete bird.geographic;
        save.wildlife = [bird];
        save.calendar.minute = 720;
        save.calendar.speed = 0.5;
        if (version12) {
          save.version = 12;
          save.selectedWeapon = 'fists';
          delete save.treeHarvest;
        }
        store.put(save, 'primary');
      };
      tx.oncomplete = () => { db.close(); resolve(id); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Bird fixture aborted')); };
    };
  }), { angle, version12 });
}

async function prepareBird(page: Page, touch: boolean, version12 = false) {
  await page.goto('./');
  await activate(page, '#newGame', touch);
  await expect.poll(async () => (await state(page)).terrainReady, { timeout: 30000 }).toBe(true);
  const angle = (await state(page)).cameraAngle;
  await activate(page, '#pauseButton', touch);
  await page.locator('#cameraFollow').uncheck();
  await activate(page, '#saveGame', touch);
  await expect(page.locator('#toast')).toHaveText('World saved');
  const id = await placeBirdInSavedScene(page, angle, version12);
  await page.reload();
  await activate(page, '#continueGame', touch);
  await expect.poll(async () => (await state(page)).wildlife.find(bird => bird.id === id), { timeout: 30000 })
    .toMatchObject({ species: 'bird', health: 1, authored: true, animation: 'idle', flightHeight: 0 });
  return id;
}

for (const viewport of [
  { name: 'desktop', width: 1280, height: 720, touch: false },
  { name: 'portrait', width: 390, height: 844, touch: true },
  { name: 'landscape', width: 844, height: 390, touch: true },
]) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.touch, isMobile: viewport.touch });

    test('approaches a bird, observes takeoff and reloads it', async ({ page }, testInfo) => {
      test.setTimeout(120000);
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      const id = await prepareBird(page, viewport.touch);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: testInfo.outputPath('normal.png') });
      await activate(page, '#pauseButton', viewport.touch);
      await page.locator('#cameraDistance').fill('5');
      await activate(page, '#resumeGame', viewport.touch);
      await page.waitForTimeout(800);
      await page.screenshot({ path: testInfo.outputPath('close.png') });
      const before = (await state(page)).player;
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
        await expect.poll(async () => (await state(page)).wildlife.find(bird => bird.id === id)?.behavior,
          { timeout: 10000, intervals: [50] }).toBe('fly');
        const takeoff = (await state(page)).wildlife.find(bird => bird.id === id)!;
        expect(takeoff.flightHeight).toBeGreaterThan(0);
        expect(takeoff.flightHeight).toBeLessThan(2.4);
        await page.screenshot({ path: testInfo.outputPath('takeoff.png') });
        await page.waitForTimeout(250);
        await page.screenshot({ path: testInfo.outputPath('flight.png') });
      } finally {
        await stop();
      }
      await expect.poll(async () => (await state(page)).wildlife.find(bird => bird.id === id))
        .toMatchObject({ behavior: 'fly', authored: true, animation: 'fly' });
      const after = await state(page);
      expect(Math.hypot(after.player.x - before.x, after.player.z - before.z)).toBeGreaterThan(0.5);
      await activate(page, '#pauseButton', viewport.touch);
      await activate(page, '#saveGame', viewport.touch);
      await expect(page.locator('#toast')).toHaveText('World saved');
      await page.reload();
      await activate(page, '#continueGame', viewport.touch);
      await expect.poll(async () => (await state(page)).wildlife.find(bird => bird.id === id), { timeout: 30000 })
        .toMatchObject({ species: 'bird', health: 1, authored: true, animation: 'fly' });
      expect((await state(page)).wildlife.find(bird => bird.id === id)!.flightHeight).toBeGreaterThan(2.3);
      expect(errors).toEqual([]);
    });
  });
}

test('encounters a naturally spawned bird in a new game', async ({ page }, testInfo) => {
  test.setTimeout(120000);
  await page.goto('./');
  await page.locator('#newGame').click();
  await expect.poll(async () => (await state(page)).terrainReady, { timeout: 30000 }).toBe(true);
  const initial = await state(page);
  const target = initial.wildlife.filter(animal => animal.species === 'bird')
    .sort((a, b) => Math.hypot(a.x - initial.player.x, a.z - initial.player.z)
      - Math.hypot(b.x - initial.player.x, b.z - initial.player.z))[0];
  if (!target) throw new Error('No naturally spawned bird');
  let distance = Infinity;
  for (let attempt = 0; attempt < 150; attempt++) {
    const snapshot = await state(page);
    const bird = snapshot.wildlife.find(animal => animal.id === target.id);
    if (!bird) throw new Error('The target bird disappeared before the encounter');
    const dx = bird.x - snapshot.player.x;
    const dz = bird.z - snapshot.player.z;
    distance = Math.hypot(dx, dz);
    if (distance < 7) break;
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
  expect(distance).toBeLessThan(7);
  await expect.poll(async () => (await state(page)).wildlife.find(bird => bird.id === target.id)?.authored).toBe(true);
  await page.locator('#pauseButton').click();
  await page.locator('#cameraFollow').uncheck();
  await page.locator('#legacyCamera').check();
  await page.locator('#cameraDistance').fill('5');
  await page.locator('#resumeGame').click();
  const view = await state(page);
  const bird = view.wildlife.find(animal => animal.id === target.id);
  if (!bird) throw new Error('The target bird disappeared before the camera turn');
  const direction = Math.atan2(view.player.x - bird.x, view.player.z - bird.z);
  const delta = Math.atan2(Math.sin(direction - view.cameraAngle), Math.cos(direction - view.cameraAngle));
  await page.mouse.move(640, 350);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(640 - delta / 0.006, 350);
  await page.mouse.up({ button: 'right' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: testInfo.outputPath('natural-encounter.png') });
});

test('lands a flying bird gradually when its normal decision returns it to rest', async ({ page }, testInfo) => {
  const id = await prepareBird(page, false);
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.evaluate(async id => {
    const { seededNoise } = await import('/NewDawn/src/world.ts');
    await new Promise<void>((resolve, reject) => {
      const opening = indexedDB.open('new-dawn', 1);
      opening.onerror = () => reject(opening.error);
      opening.onsuccess = () => {
        const db = opening.result;
        const tx = db.transaction('saves', 'readwrite');
        const store = tx.objectStore('saves');
        const get = store.get('primary');
        get.onsuccess = () => {
          const save = get.result;
          const bird = save.wildlife.find((animal: Bird) => animal.id === id);
          const decisions = Array.from({ length: 100 }, (_, index) => index)
            .find(index => seededNoise(index + 1, bird.homeX + bird.homeZ, save.seed) < 0.25);
          if (decisions === undefined) { tx.abort(); return; }
          bird.behavior = 'fly';
          bird.decisionTimer = 1;
          bird.decisions = decisions;
          store.put(save, 'primary');
        };
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
        tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Landing fixture aborted')); };
      };
    });
  }, id);
  await page.reload();
  await page.evaluate(() => {
    const zoom = document.querySelector<HTMLInputElement>('#cameraDistance');
    if (!zoom) throw new Error('Camera zoom control is missing');
    zoom.value = '5';
    zoom.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('#continueGame').click();
  await expect.poll(async () => (await state(page)).wildlife.find(bird => bird.id === id)?.behavior,
    { timeout: 10000, intervals: [50] }).toBe('rest');
  const landing = (await state(page)).wildlife.find(bird => bird.id === id)!;
  expect(landing.flightHeight).toBeGreaterThan(1);
  expect(landing.animation).toBe('fly');
  await page.screenshot({ path: testInfo.outputPath('landing.png') });
  await expect.poll(async () => (await state(page)).wildlife.find(bird => bird.id === id)?.flightHeight,
    { timeout: 10000 }).toBeLessThan(0.1);
  await expect.poll(async () => (await state(page)).wildlife.find(bird => bird.id === id)?.animation).toBe('idle');
  await page.screenshot({ path: testInfo.outputPath('landed.png') });
});

test('shares crow art while keeping wing animation and disposal independent', async ({ page }) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const { createAnimal, disposeAnimal } = await import('/NewDawn/src/animal-assets.ts');
    const { attachAuthoredAnimal, updateAuthoredAnimal } = await import('/NewDawn/src/authored-animal.ts');
    const roots = [createAnimal('bird', 0), createAnimal('bird', 1)];
    const errors: string[] = [];
    roots.forEach((root, variant) => attachAuthoredAnimal(root, 'bird', variant, error => errors.push(String(error))));
    const deadline = performance.now() + 30000;
    while (roots.some(root => !root.getObjectByName('authored-animal')) && performance.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (errors.length || roots.some(root => !root.getObjectByName('authored-animal'))) {
      throw new Error(`Could not load crow: ${errors.join(', ')}`);
    }
    const meshes = roots.map(root => {
      let found: import('three').SkinnedMesh | undefined;
      root.getObjectByName('authored-animal')!.traverse(object => {
        if ((object as import('three').SkinnedMesh).isSkinnedMesh) found = object as import('three').SkinnedMesh;
      });
      if (!found) throw new Error('Crow has no skinned mesh');
      return found;
    });
    const wing = roots[0].getObjectByName('upperwing_L');
    if (!wing) throw new Error('Crow has no wing joint');
    const before = wing.quaternion.clone();
    for (let frame = 0; frame < 5; frame++) {
      updateAuthoredAnimal(roots[0], 1 / 30, 2.5, 'fly', true);
      updateAuthoredAnimal(roots[1], 1 / 30, 0, 'rest', true);
    }
    const moved = before.angleTo(wing.quaternion);
    const beforeFar = wing.quaternion.clone();
    const farUsesAuthored = updateAuthoredAnimal(roots[0], 1, 2.5, 'fly', false);
    let disposed = 0;
    meshes[0].geometry.addEventListener('dispose', () => { disposed++; });
    const values = {
      sharedGeometry: meshes[0].geometry === meshes[1].geometry,
      sharedMaterial: meshes[0].material === meshes[1].material,
      independentSkeletons: meshes[0].skeleton !== meshes[1].skeleton,
      flying: roots[0].getObjectByName('authored-animal')!.userData.animation,
      resting: roots[1].getObjectByName('authored-animal')!.userData.animation,
      moved, farUsesAuthored, farMovement: beforeFar.angleTo(wing.quaternion),
    };
    disposeAnimal(roots[0]);
    const secondStillAnimated = updateAuthoredAnimal(roots[1], 0.1, 2.5, 'fly', true);
    const secondAction = roots[1].getObjectByName('authored-animal')!.userData.animation;
    disposeAnimal(roots[1]);
    return { ...values, disposed, secondStillAnimated, secondAction };
  });
  expect(result).toMatchObject({
    sharedGeometry: true, sharedMaterial: true, independentSkeletons: true,
    flying: 'fly', resting: 'peck', farUsesAuthored: true, farMovement: 0,
    disposed: 0, secondStillAnimated: true, secondAction: 'fly',
  });
  expect(result.moved).toBeGreaterThan(0.05);
});

test('retains the procedural bird on load failure and retries', async ({ page }) => {
  await page.goto('./');
  let requests = 0;
  await page.route('**/assets/animals/hooded-crow.glb', async route => {
    requests++;
    if (requests === 1) await route.abort();
    else await route.continue();
  });
  const result = await page.evaluate(async () => {
    const { createAnimal, disposeAnimal } = await import('/NewDawn/src/animal-assets.ts');
    const { attachAuthoredAnimal } = await import('/NewDawn/src/authored-animal.ts?bird-recovery');
    const errors: string[] = [];
    const first = createAnimal('bird', 0);
    attachAuthoredAnimal(first, 'bird', 0, error => errors.push(String(error)));
    const deadline = performance.now() + 30000;
    while (!errors.length && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    const fallbackVisible = first.children.some(child => child.visible);
    const second = createAnimal('bird', 1);
    attachAuthoredAnimal(second, 'bird', 1, error => errors.push(String(error)));
    while (!second.getObjectByName('authored-animal') && performance.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const retried = !!second.getObjectByName('authored-animal');
    const disposedEarly = createAnimal('bird', 2);
    attachAuthoredAnimal(disposedEarly, 'bird', 2, error => errors.push(String(error)));
    disposeAnimal(disposedEarly);
    await new Promise(resolve => setTimeout(resolve, 200));
    const addedAfterDisposal = !!disposedEarly.getObjectByName('authored-animal');
    disposeAnimal(first);
    disposeAnimal(second);
    return { errors, fallbackVisible, retried, addedAfterDisposal };
  });
  expect(result.errors).toHaveLength(1);
  expect(result.fallbackVisible).toBe(true);
  expect(result.retried).toBe(true);
  expect(result.addedAfterDisposal).toBe(false);
  expect(requests).toBe(2);
});

test('preserves a version 12 bird and its backup after migration', async ({ page }) => {
  const id = await prepareBird(page, false, true);
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  const records = await page.evaluate(() => new Promise<{ version: number; backup: number; wildlife: Bird[] }>((resolve, reject) => {
    const opening = indexedDB.open('new-dawn', 1);
    opening.onerror = () => reject(opening.error);
    opening.onsuccess = () => {
      const db = opening.result;
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
  expect(records.version).toBe(13);
  expect(records.backup).toBe(12);
  expect(records.wildlife).toEqual([expect.objectContaining({ id, species: 'bird', health: 1 })]);
});

test('continues offline with the bundled bird and saved identity', async ({ browser }, testInfo) => {
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
    const id = await placeBirdInSavedScene(page, 0.78);
    await context.setOffline(true);
    await page.reload();
    const assetResponse = page.waitForResponse(response => response.url().endsWith('/assets/animals/hooded-crow.glb'));
    await page.locator('#continueGame').click();
    const response = await assetResponse;
    expect(response.status()).toBe(200);
    expect(response.fromServiceWorker()).toBe(true);
    expect((await response.body()).subarray(0, 4).toString()).toBe('glTF');
    await page.waitForTimeout(3000);
    await page.screenshot({ path: testInfo.outputPath('offline-bird.png') });
    await page.locator('#pauseButton').click();
    await page.locator('#saveGame').click();
    await expect(page.locator('#toast')).toHaveText('World saved');
    const saved = await page.evaluate(() => new Promise<Bird[]>((resolve, reject) => {
      const opening = indexedDB.open('new-dawn', 1);
      opening.onerror = () => reject(opening.error);
      opening.onsuccess = () => {
        const db = opening.result;
        const get = db.transaction('saves').objectStore('saves').get('primary');
        get.onsuccess = () => { db.close(); resolve(get.result.wildlife); };
        get.onerror = () => { db.close(); reject(get.error); };
      };
    }));
    expect(saved).toEqual([expect.objectContaining({ id, species: 'bird', health: 1 })]);
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
