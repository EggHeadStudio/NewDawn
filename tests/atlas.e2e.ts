import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { atlasBiomeAtCell, atlasBiomeColors } from '../src/atlas';

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
  await expect(page.locator('#atlasZoom')).toHaveText('8×');
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

test('world atlas renders the generated biome for an explored geographic cell', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await page.locator('#newGame').click();
  await page.keyboard.press('m');
  await expect(page.locator('#atlasPanel')).toBeVisible();
  const expectedColor = atlasBiomeColors[atlasBiomeAtCell(4, 4, 1847)];
  const expected = expectedColor.match(/[0-9a-f]{2}/gi)!.map(value => Number.parseInt(value, 16));
  const sample = await page.locator('#atlasCanvas').evaluate(canvas => {
    const context = (canvas as HTMLCanvasElement).getContext('2d')!;
    return [...context.getImageData(506, 248, 1, 1).data].slice(0, 3);
  });
  expect(sample).toEqual(expected);
  const review = join('art-review', 'batch-005c');
  await mkdir(review, { recursive: true });
  await page.screenshot({ path: join(review, 'atlas-shared-world.png') });
});
