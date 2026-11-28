import { expect, test, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';

type State = {
  player: { x: number; z: number };
  terrainReady: boolean;
  selectedWeapon: string;
  characterVisual: { authored: boolean; backpackBone: string | null; backpackVisible: boolean;
    backpackEquipped: boolean; heldTools: string[]; torch: boolean };
};

async function state(page: Page) {
  return page.evaluate(() => (window as Window & { __newDawnState: () => State }).__newDawnState());
}

async function selectTool(page: Page, tool: string, touch: boolean) {
  const activate = async (selector: string) => {
    if (touch) await page.locator(selector).tap();
    else await page.locator(selector).click();
  };
  await activate('#toolHubButton');
  await activate(`[data-hub="${tool}"]`);
}

async function openPack(page: Page, touch: boolean) {
  if (touch) {
    await page.locator('#toolHubButton').tap();
    await page.locator('#inventoryButton').tap();
  } else {
    await page.locator('#toolHubButton').click();
    await page.locator('#inventoryButton').click();
  }
}

async function walk(page: Page, touch: boolean) {
  if (!touch) {
    await page.keyboard.down('w');
    await page.waitForTimeout(1500);
    await page.keyboard.up('w');
    return;
  }
  const cdp = await page.context().newCDPSession(page);
  try {
    const box = await page.locator('#joystick').boundingBox();
    if (!box) throw new Error('Joystick is not visible');
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...center, id: 1 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove',
      touchPoints: [{ x: center.x, y: center.y - 36, id: 1 }] });
    await page.waitForTimeout(1500);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } finally {
    await cdp.detach();
  }
}

for (const viewport of [
  { name: 'desktop', width: 1280, height: 720, touch: false },
  { name: 'portrait', width: 390, height: 844, touch: true },
  { name: 'landscape', width: 844, height: 390, touch: true },
]) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.touch, isMobile: viewport.touch });

    test('shows equipment during gameplay and restores it after reload', async ({ page }, testInfo) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('./');
      await page.locator('#newGame').click();
      await expect(page.locator('#pauseButton')).toBeVisible();
      await page.locator('#pauseButton').click();
      await page.locator('#saveGame').click();
      await expect(page.locator('#toast')).toHaveText('World saved');
      await page.evaluate(() => new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('new-dawn', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('saves', 'readwrite');
          const store = tx.objectStore('saves');
          const get = store.get('primary');
          get.onsuccess = () => {
            const save = get.result;
            save.calendar.minute = 720;
            save.calendar.speed = 0.5;
            save.resources.wood = 3;
            save.resources.stone = 2;
            store.put(save, 'primary');
          };
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        };
      }));
      await page.reload();
      await page.locator('#continueGame').click();
      await expect(page.locator('#pauseButton')).toBeVisible();
      await page.locator('#pauseButton').click();
      await page.locator('#cameraFollow').uncheck();
      await page.locator('#gameSpeed').fill('0.5');
      await page.locator('#resumeGame').click();
      await expect.poll(async () => (await state(page)).terrainReady, { timeout: 30000 }).toBe(true);
      await expect.poll(async () => (await state(page)).characterVisual.backpackBone, { timeout: 30000 }).toBe('spine_02');
      await page.waitForTimeout(3000);
      await page.screenshot({ path: testInfo.outputPath('normal.png') });
      await page.locator('#pauseButton').click();
      await page.locator('#cameraDistance').fill('5');
      await page.locator('#resumeGame').click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: testInfo.outputPath('close.png') });

      await openPack(page, viewport.touch);
      const backpack = page.getByRole('button', { name: 'Wear backpack' });
      await expect(backpack).toHaveAttribute('aria-pressed', 'true');
      if (viewport.touch) await backpack.tap();
      else { await backpack.focus(); await page.keyboard.press('Space'); }
      await expect(backpack).toHaveAttribute('aria-pressed', 'false');
      await expect(page.locator('#backpackStatus')).toContainText('not worn');
      await expect.poll(async () => (await state(page)).characterVisual)
        .toMatchObject({ backpackEquipped: false, backpackVisible: false });
      await page.screenshot({ path: testInfo.outputPath('pack-unequipped.png') });
      await page.locator('#closeCraft').click();
      await page.screenshot({ path: testInfo.outputPath('unequipped.png') });
      await page.locator('#pauseButton').click();
      await page.locator('#saveGame').click();
      await expect(page.locator('#toast')).toHaveText('World saved');
      await page.reload();
      await page.locator('#continueGame').click();
      await expect.poll(async () => (await state(page)).characterVisual, { timeout: 30000 })
        .toMatchObject({ backpackBone: 'spine_02', backpackEquipped: false, backpackVisible: false });
      await page.locator('#pauseButton').click();
      await page.locator('#cameraFollow').uncheck();
      await page.locator('#cameraDistance').fill('5');
      await page.locator('#resumeGame').click();
      await openPack(page, viewport.touch);
      await expect(backpack).toHaveAttribute('aria-pressed', 'false');
      if (viewport.touch) await backpack.tap();
      else { await backpack.focus(); await page.keyboard.press('Enter'); }
      await expect(backpack).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(async () => (await state(page)).characterVisual)
        .toMatchObject({ backpackEquipped: true, backpackVisible: true });
      await page.locator('#closeCraft').click();
      await page.screenshot({ path: testInfo.outputPath('equipped.png') });
      await page.locator('#pauseButton').click();
      await page.locator('#saveGame').click();
      await expect(page.locator('#toast')).toHaveText('World saved');
      await page.reload();
      await page.locator('#continueGame').click();
      await expect.poll(async () => (await state(page)).characterVisual, { timeout: 30000 })
        .toMatchObject({ backpackBone: 'spine_02', backpackEquipped: true, backpackVisible: true });

      await openPack(page, viewport.touch);
      if (viewport.touch) await page.locator('[data-craft="axe"]').tap();
      else await page.locator('[data-craft="axe"]').click();
      await expect(page.locator('#panelNotification')).toHaveText('axe crafted');
      await expect(page.locator('[data-craft="axe"]')).toBeDisabled();
      await page.locator('#closeCraft').click();
      for (const [tool, visible] of [['stick', 'stick'], ['axe', 'chop'], ['saw', 'saw']] as const) {
        await selectTool(page, tool, viewport.touch);
        await expect.poll(async () => (await state(page)).characterVisual.heldTools).toEqual([visible]);
      }
      const before = (await state(page)).player;
      await walk(page, viewport.touch);
      const after = await state(page);
      expect(Math.hypot(after.player.x - before.x, after.player.z - before.z)).toBeGreaterThan(0.5);
      expect(after.characterVisual).toMatchObject({ backpackBone: 'spine_02', heldTools: ['saw'] });
      await page.screenshot({ path: testInfo.outputPath('walking-saw.png') });
      await page.locator('#pauseButton').click();
      await page.locator('#saveGame').click();
      await expect(page.locator('#toast')).toHaveText('World saved');
      await page.reload();
      await page.locator('#continueGame').click();
      await expect.poll(async () => (await state(page)).characterVisual.backpackBone, { timeout: 30000 }).toBe('spine_02');
      await expect.poll(async () => (await state(page)).characterVisual.heldTools).toEqual(['saw']);
      expect((await state(page)).selectedWeapon).toBe('saw');
      await selectTool(page, 'fists', viewport.touch);
      await expect.poll(async () => (await state(page)).characterVisual.heldTools).toEqual([]);
      expect(errors).toEqual([]);
    });
  });
}

test('keeps an unequipped backpack hidden when its asset finishes loading late', async ({ page }) => {
  let release = () => {};
  const delayed = new Promise<void>(resolve => { release = resolve; });
  let requests = 0;
  await page.route('**/assets/characters/equipment/hiking-backpack.glb', async route => {
    requests++;
    await delayed;
    await route.continue();
  });
  try {
    await page.goto('./');
    await page.locator('#newGame').click();
    await expect.poll(() => requests, { timeout: 30000 }).toBeGreaterThan(0);
    await openPack(page, false);
    const backpack = page.getByRole('button', { name: 'Wear backpack' });
    await backpack.click();
    await expect(backpack).toHaveAttribute('aria-pressed', 'false');
    release();
    await expect.poll(async () => (await state(page)).characterVisual, { timeout: 30000 })
      .toMatchObject({ backpackBone: 'spine_02', backpackEquipped: false, backpackVisible: false });
    await backpack.click();
    await expect.poll(async () => (await state(page)).characterVisual)
      .toMatchObject({ backpackEquipped: true, backpackVisible: true });
  } finally {
    release();
  }
});

test('gives legacy saves the previously visible starter backpack', async ({ page }) => {
  await page.goto('./');
  await page.locator('#newGame').click();
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('saves', 'readwrite');
      const store = tx.objectStore('saves');
      const get = store.get('primary');
      get.onsuccess = () => {
        const save = get.result;
        save.version = 12;
        delete save.treeHarvest;
        delete save.backpackEquipped;
        store.put(save, 'primary');
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Legacy backpack fixture aborted')); };
    };
  }));
  await page.reload();
  await page.locator('#continueGame').click();
  await expect.poll(async () => (await state(page)).characterVisual, { timeout: 30000 })
    .toMatchObject({ backpackBone: 'spine_02', backpackEquipped: true, backpackVisible: true });
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  const saved = await page.evaluate(() => new Promise<{ current: unknown; backup: unknown }>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('saves');
      const current = tx.objectStore('saves').get('primary');
      const backup = tx.objectStore('saves').get('pre-timber-backup');
      tx.oncomplete = () => { db.close(); resolve({ current: current.result, backup: backup.result }); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }));
  expect(saved.current).toMatchObject({ version: 13, backpackEquipped: true });
  expect(saved.backup).toMatchObject({ version: 12 });
  expect(saved.backup).not.toHaveProperty('backpackEquipped');
});

test('shares backpack art safely across animated and disposed characters', async ({ page }) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const { createCharacter, disposeCharacter } = await import('/NewDawn/src/characters.ts');
    const { attachAuthoredCharacter, updateAuthoredCharacter } = await import('/NewDawn/src/authored-character.ts');
    const { defaultAppearance } = await import('/NewDawn/src/appearance.ts');
    const looks = [defaultAppearance(), { ...defaultAppearance(), body: 'feminine' as const,
      hair: 'long' as const, clothing: 'fur' as const, hat: 'hood' as const }];
    const roots = looks.map(look => {
      const root = createCharacter(look);
      attachAuthoredCharacter(root, look, error => { throw error; },
        { backpack: true, onBackpackError: error => { throw error; } });
      return root;
    });
    const end = performance.now() + 30000;
    while (roots.some(root => !root.getObjectByName('survivor-backpack')) && performance.now() < end) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const backpacks = roots.map(root => root.getObjectByName('survivor-backpack'));
    if (backpacks.some(backpack => !backpack)) throw new Error('Backpack did not load');
    const meshes = backpacks.map(backpack => {
      let found: import('three').Mesh | undefined;
      backpack!.traverse(object => { if ((object as import('three').Mesh).isMesh) found = object as import('three').Mesh; });
      if (!found) throw new Error('Backpack has no mesh');
      return found;
    });
    let disposed = 0;
    meshes[0].geometry.addEventListener('dispose', () => { disposed++; });
    roots[1].updateMatrixWorld(true);
    const before = backpacks[1]!.getWorldPosition(roots[1].position.clone());
    for (let frame = 0; frame < 20; frame++) {
      updateAuthoredCharacter(roots[1], 1 / 30, 1, true, undefined, false, 'saw');
    }
    roots[1].updateMatrixWorld(true);
    const after = backpacks[1]!.getWorldPosition(roots[1].position.clone());
    updateAuthoredCharacter(roots[1], 1 / 30, 0, false, undefined, false);
    const defaultTools = ['chop', 'mine', 'weapon', 'stick', 'saw'].filter(kind =>
      roots[1].getObjectByName('authored-character')?.getObjectByName(`tool-${kind}`)?.visible);
    disposeCharacter(roots[0]);
    const values = {
      bones: backpacks.map(backpack => backpack!.parent?.name),
      sharedGeometry: meshes[0].geometry === meshes[1].geometry,
      movedWithAnimation: before.distanceTo(after),
      geometryDisposals: disposed,
      secondStillAttached: !!roots[1].getObjectByName('survivor-backpack'),
      defaultTools,
    };
    disposeCharacter(roots[1]);
    return values;
  });
  expect(result.bones).toEqual(['spine_02', 'spine_02']);
  expect(result.sharedGeometry).toBe(true);
  expect(result.movedWithAnimation).toBeGreaterThan(0.001);
  expect(result.geometryDisposals).toBe(0);
  expect(result.secondStillAttached).toBe(true);
  expect(result.defaultTools).toEqual([]);
});

test('keeps the character usable when backpack loading fails and retries', async ({ page }) => {
  await page.goto('./');
  await expect.poll(async () => (await state(page)).characterVisual.backpackBone, { timeout: 30000 }).toBe('spine_02');
  let requests = 0;
  await page.route('**/assets/characters/equipment/hiking-backpack.glb', async route => {
    requests++;
    if (requests === 1) await route.abort();
    else await route.continue();
  });
  const result = await page.evaluate(async () => {
    const { createCharacter, disposeCharacter } = await import('/NewDawn/src/characters.ts');
    const { attachAuthoredCharacter } = await import('/NewDawn/src/authored-character.ts?recovery-test');
    const { defaultAppearance } = await import('/NewDawn/src/appearance.ts');
    const errors: string[] = [];
    const look = defaultAppearance();
    const create = () => {
      const root = createCharacter(look);
      attachAuthoredCharacter(root, look, error => errors.push(`character: ${String(error)}`),
        { backpack: true, onBackpackError: error => errors.push(`backpack: ${String(error)}`) });
      return root;
    };
    const first = create();
    const deadline = performance.now() + 30000;
    while (!errors.length && performance.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    const survived = !!first.getObjectByName('authored-character') && !first.getObjectByName('survivor-backpack');
    const second = create();
    while (!second.getObjectByName('survivor-backpack') && performance.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const retried = second.getObjectByName('survivor-backpack')?.parent?.name;
    const disposedEarly = create();
    disposeCharacter(disposedEarly);
    await new Promise(resolve => setTimeout(resolve, 250));
    const addedAfterDisposal = !!disposedEarly.getObjectByName('survivor-backpack');
    disposeCharacter(first);
    disposeCharacter(second);
    return { errors, survived, retried, addedAfterDisposal };
  });
  expect(result.errors).toHaveLength(1);
  expect(result.errors[0]).toContain('backpack:');
  expect(result.survived).toBe(true);
  expect(result.retried).toBe('spine_02');
  expect(result.addedAfterDisposal).toBe(false);
  expect(requests).toBe(2);
});

test('previews and reloads a different outfit with its backpack', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await page.locator('#customizeCharacter').click();
  await page.locator('#appearance-body').selectOption('feminine');
  await page.locator('#appearance-hair').selectOption('long');
  await page.locator('#appearance-clothing').selectOption('fur');
  await page.locator('#appearance-hat').selectOption('hood');
  await page.waitForTimeout(3000);
  const canvas = page.locator('#characterPreview');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Character preview is not visible');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 209, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();
  await canvas.screenshot({ path: testInfo.outputPath('feminine-preview-back.png') });
  await page.locator('#finishCharacter').click();
  await page.locator('#newGame').click();
  await expect.poll(async () => (await state(page)).characterVisual.backpackBone, { timeout: 30000 }).toBe('spine_02');
  await page.locator('#pauseButton').click();
  await page.locator('#cameraDistance').fill('5');
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.locator('#resumeGame').click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: testInfo.outputPath('feminine-game.png') });
  await page.reload();
  await page.locator('#continueGame').click();
  await expect.poll(async () => (await state(page)).characterVisual.backpackBone, { timeout: 30000 }).toBe('spine_02');
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  const appearance = await page.evaluate(() => new Promise<unknown>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const get = db.transaction('saves').objectStore('saves').get('primary');
      get.onsuccess = () => { db.close(); resolve(get.result.appearance); };
      get.onerror = () => { db.close(); reject(get.error); };
    };
  }));
  expect(appearance).toMatchObject({ body: 'feminine', hair: 'long', clothing: 'fur', hat: 'hood' });
  expect(errors).toEqual([]);
});

test('shows a crafted torch alongside a selected saw and restores both', async ({ page }) => {
  await page.goto('./');
  await page.locator('#newGame').click();
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('saves', 'readwrite');
      const store = tx.objectStore('saves');
      const get = store.get('primary');
      get.onsuccess = () => {
        const save = get.result;
        save.resources.wood = 2;
        save.minerals.coal = 1;
        store.put(save, 'primary');
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error ?? new Error('Torch fixture aborted')); };
    };
  }));
  await page.reload();
  await page.locator('#continueGame').click();
  await expect.poll(async () => (await state(page)).characterVisual.backpackBone, { timeout: 30000 }).toBe('spine_02');
  await selectTool(page, 'saw', false);
  await page.locator('#toolHubButton').click();
  await page.locator('#inventoryButton').click();
  await page.locator('#craftTorch').click();
  await page.locator('#equipTorch').click();
  await page.locator('#igniteTorch').click();
  await expect(page.locator('#torchStatus')).toHaveText('Torch: equipped and burning');
  await page.locator('#closeCraft').click();
  await expect.poll(async () => (await state(page)).characterVisual).toMatchObject({ heldTools: ['saw'], torch: true });
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.reload();
  await page.locator('#continueGame').click();
  await expect.poll(async () => (await state(page)).characterVisual, { timeout: 30000 })
    .toMatchObject({ backpackBone: 'spine_02', heldTools: ['saw'], torch: true });
  await page.locator('#toolHubButton').click();
  await page.locator('#inventoryButton').click();
  await expect(page.locator('#torchStatus')).toHaveText('Torch: equipped and burning');
  await page.locator('#equipTorch').click();
  await page.locator('#closeCraft').click();
  await expect.poll(async () => (await state(page)).characterVisual.torch).toBe(false);
});

test('continues offline with the bundled backpack and selected saw', async ({ browser }, testInfo) => {
  test.setTimeout(120000);
  const portServer = createServer();
  await new Promise<void>(resolve => portServer.listen(0, '127.0.0.1', resolve));
  const port = (portServer.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => portServer.close(error => error ? reject(error) : resolve()));
  const preview = spawn(process.execPath, [
    resolve('node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort',
  ], { stdio: 'ignore' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
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
    await page.locator('#newGame').tap();
    await selectTool(page, 'saw', true);
    await openPack(page, true);
    await page.getByRole('button', { name: 'Wear backpack' }).tap();
    await expect(page.getByRole('button', { name: 'Wear backpack' })).toHaveAttribute('aria-pressed', 'false');
    await page.locator('#closeCraft').tap();
    await page.locator('#pauseButton').tap();
    await page.locator('#cameraDistance').fill('5');
    await page.locator('#saveGame').tap();
    await expect(page.locator('#toast')).toHaveText('World saved');
    await context.setOffline(true);
    await page.reload();
    const backpack = page.waitForResponse(response => response.url().endsWith('/hiking-backpack.glb'));
    await page.locator('#continueGame').tap();
    const response = await backpack;
    expect(response.status()).toBe(200);
    expect(response.fromServiceWorker()).toBe(true);
    expect((await response.body()).subarray(0, 4).toString()).toBe('glTF');
    await expect(page.locator('#toolHubButton')).toHaveAttribute('aria-label', 'Open tools, saw selected');
    await openPack(page, true);
    const toggle = page.getByRole('button', { name: 'Wear backpack' });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.tap();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#closeCraft').tap();
    await page.locator('#pauseButton').tap();
    await page.locator('#saveGame').tap();
    await expect(page.locator('#toast')).toHaveText('World saved');
    await page.reload();
    await page.locator('#continueGame').tap();
    await openPack(page, true);
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#closeCraft').tap();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: testInfo.outputPath('offline-character.png') });
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
