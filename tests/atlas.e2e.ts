import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { atlasBiomeAtCell, atlasBiomeColors } from '../src/atlas';
import { hierarchicalTileId } from '../src/geography';

async function save(page: Page) {
  await expect(page.locator('#pauseButton')).toBeVisible();
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.locator('#resumeGame').click();
}

test('opens the world atlas, zooms, marks and restores an explored position', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await page.locator('#newGame').click();
  await save(page);
  await page.keyboard.press('m');
  await expect(page.locator('#atlasPanel')).toBeVisible();
  await expect(page.locator('#atlasCanvas')).toBeVisible();
  await expect(page.locator('#atlasCoordinates')).toContainText('REGION');
  await page.locator('#atlasZoomIn').click();
  await expect(page.locator('#atlasZoom')).toHaveText('2×');
  await page.locator('#atlasMarkerName').fill('North Camp');
  await page.locator('#atlasAddMarker').click();
  await expect(page.locator('#atlasMarkerList')).toContainText('North Camp');
  await page.locator('#closeAtlas').click();
  await save(page);
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  await page.keyboard.press('m');
  await expect(page.locator('#atlasMarkerList')).toContainText('North Camp');
  await page.locator('#closeAtlas').click();
  await expect(page.locator('#atlasPanel')).toBeHidden();
  await page.keyboard.press('m');
  await expect(page.locator('#atlasPanel')).toBeVisible();
  const desktopFolder = join('art-review', 'batch-005a');
  await mkdir(desktopFolder, { recursive: true });
  await page.screenshot({ path: join(desktopFolder, 'desktop-atlas.png') });
  await page.locator('#closeAtlas').click();
});

test('world atlas is usable in portrait and landscape viewports', async ({ page }) => {
  test.setTimeout(90000);
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await page.goto('./');
    await page.locator('#newGame').click();
    await page.keyboard.press('m');
    await expect(page.locator('#atlasPanel')).toBeVisible();
    await expect(page.locator('#atlasCanvas')).toBeVisible();
    const mobileFolder = join('art-review', 'batch-005a');
    await mkdir(mobileFolder, { recursive: true });
    await page.screenshot({ path: join(mobileFolder, viewport.width < viewport.height ? 'mobile-portrait-atlas.png' : 'mobile-landscape-atlas.png') });
    await page.locator('#closeAtlas').click();
  }
});

test('world atlas renders the generated biome even for an unexplored geographic cell', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await page.locator('#newGame').click();
  await page.keyboard.press('m');
  await expect(page.locator('#atlasPanel')).toBeVisible();
  const expectedColor = atlasBiomeColors[atlasBiomeAtCell(-40, 80, 1847)];
  const expected = expectedColor.match(/[0-9a-f]{2}/gi)!.map(value => Number.parseInt(value, 16));
  const sample = await page.locator('#atlasCanvas').evaluate(canvas => {
    const context = (canvas as HTMLCanvasElement).getContext('2d')!;
    return [...context.getImageData(666, 446, 1, 1).data].slice(0, 3);
  });
  expect(sample).toEqual(expected);
  await page.locator('#closeAtlas').click();
  await save(page);
  const explored = await page.evaluate(() => new Promise<string[]>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const get = db.transaction('saves').objectStore('saves').get('primary');
      get.onerror = () => reject(get.error);
      get.onsuccess = () => { resolve(get.result.atlas.explored); db.close(); };
    };
  }));
  expect(explored).not.toContain(hierarchicalTileId(-39.5, 80.5, 4));
  await page.locator('#minimap').click();
  const review = join('art-review', 'batch-005c');
  await mkdir(review, { recursive: true });
  await page.screenshot({ path: join(review, 'atlas-shared-world.png') });
});

test('wraps the atlas across the dateline and preserves legacy exploration and markers', async ({ page }) => {
  await page.goto('./');
  await page.locator('#newGame').click();
  await save(page);
  const marker = { id: 'legacy-home', name: 'Old home', latitude: 12, longitude: -179.7, altitude: 0, kind: 'home' };
  const explored = ['4/1/1', '4/5/7'];
  await page.evaluate(({ marker, explored }) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('saves', 'readwrite');
      const store = tx.objectStore('saves');
      const get = store.get('primary');
      get.onsuccess = () => {
        const save = get.result;
        save.atlas = { explored, markers: [marker], centerLatitude: 0, centerLongitude: 179, zoom: 4, level: 'region' };
        store.put(save, 'primary');
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }), { marker, explored });
  await page.reload();
  await page.locator('#continueGame').click();
  await page.locator('#minimap').click();
  await expect(page.locator('#atlasMarkerList')).toContainText('Old home');
  await expect(page.locator('#atlasZoom')).toHaveText('4×');
  const pixels = await page.locator('#atlasCanvas').evaluate(canvas => {
    const context = (canvas as HTMLCanvasElement).getContext('2d')!;
    return [444, 475].map(x => [...context.getImageData(x, 234, 1, 1).data].slice(0, 3));
  });
  const rgb = (color: string) => color.match(/[0-9a-f]{2}/gi)!.map(value => Number.parseInt(value, 16));
  expect(pixels).toEqual([
    rgb(atlasBiomeColors[atlasBiomeAtCell(5, 177, 1847)]),
    rgb(atlasBiomeColors[atlasBiomeAtCell(5, -180, 1847)]),
  ]);
  const bounds = (await page.locator('#atlasCanvas').boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 2 / 3, bounds.y + bounds.height / 2);
  await page.mouse.up();
  await page.locator('#closeAtlas').click();
  await save(page);
  const persisted = await page.evaluate(() => new Promise<{ explored: string[]; markers: unknown[]; centerLongitude: number }>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const get = db.transaction('saves').objectStore('saves').get('primary');
      get.onerror = () => reject(get.error);
      get.onsuccess = () => { resolve(get.result.atlas); db.close(); };
    };
  }));
  expect(persisted.explored).toEqual(expect.arrayContaining(explored));
  expect(persisted.markers).toContainEqual(marker);
  expect(persisted.centerLongitude).toBeCloseTo(164, 1);
});
