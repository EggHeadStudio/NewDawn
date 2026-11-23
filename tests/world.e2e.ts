import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function save(page: Page) {
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.locator('#resumeGame').click();
}

type SavedWorld = { version: number; player: { x: number; z: number }; resources: { wood: number };
  terrain: Record<string, number>; npcState: { recruited: boolean }; buildings: Array<{ kind: string; x: number; z: number }> };

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
    const text = await page.locator('#toast').innerText();
    const match = /Local map: (-?\d+), (-?\d+)/.exec(text);
    if (match) x = Number(match[1]);
  }
  await page.keyboard.up('s');
  await page.keyboard.up('Shift');
  expect(x).toBeGreaterThan(54);
  await save(page);
  const traveled = await readRecord(page, 'primary');
  expect(traveled).toMatchObject({ version: 7, resources: { wood: 17 }, terrain: { '-6,-6': -0.35 },
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
        data.player.x = 1532;
        data.player.z = 180;
        data.buildings = [{ kind: 'storage', x: -1531, z: 180, y: 1, rotation: 0, charge: 0 }];
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
  await page.locator('#pauseButton').click();
  await page.locator('#cameraFollow').uncheck();
  await page.locator('#resumeGame').click();
  await page.keyboard.down('Shift');
  await page.keyboard.down('d');
  let longitude = 1532;
  for (let attempt = 0; attempt < 8 && longitude >= 0; attempt++) {
    await page.waitForTimeout(1000);
    await page.keyboard.press('m');
    const match = /Local map: (-?\d+), (-?\d+)/.exec(await page.locator('#toast').innerText());
    if (match) longitude = Number(match[1]);
  }
  await page.keyboard.up('d');
  await page.keyboard.up('Shift');
  expect(longitude).toBeLessThan(0);
  await save(page);
  const saved = await readRecord(page, 'primary');
  expect(saved.player.x).toBeGreaterThan(1536);
  expect(Math.abs(saved.buildings[0].x - saved.player.x)).toBeLessThan(20);
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  await save(page);
  expect(Math.abs((await readRecord(page, 'primary')).buildings[0].x - saved.player.x)).toBeLessThan(20);
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
