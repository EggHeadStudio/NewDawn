import { expect, test } from '@playwright/test';

test('missing terrain atlases report errors while retaining a playable fallback', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.route('**/assets/environment/terrain/terrain_*_atlas.jpg', route => route.abort());
  await page.goto('./');
  await page.locator('#newGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  await expect.poll(() => ['color', 'surface'].every(name =>
    errors.some(error => error.includes(`Failed to load terrain texture`) && error.includes(`terrain_${name}_atlas.jpg`)))).toBe(true);
  const fallback = await page.evaluate(async () => {
    const { TerrainTextures } = await import('/NewDawn/src/terrain-material.ts');
    const textures = new TerrainTextures();
    await new Promise(resolve => setTimeout(resolve, 500));
    const result = textures.color.image instanceof HTMLCanvasElement
      && textures.surface.image instanceof HTMLCanvasElement;
    textures.dispose();
    return result;
  });
  expect(fallback).toBe(true);
  await page.keyboard.press('KeyW');
  await page.locator('#pauseButton').click();
  await expect(page.locator('#saveGame')).toBeVisible();
});

test('loaded atlases invalidate the fallback GPU allocations', async ({ page }) => {
  await page.route('**/assets/environment/terrain/terrain_*_atlas.jpg', async route => {
    await new Promise(resolve => setTimeout(resolve, 750));
    await route.continue();
  });
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const { TerrainTextures } = await import('/NewDawn/src/terrain-material.ts');
    const textures = new TerrainTextures();
    const fallback = textures.color.image instanceof HTMLCanvasElement
      && textures.surface.image instanceof HTMLCanvasElement;
    let disposals = 0;
    textures.color.addEventListener('dispose', () => disposals++);
    textures.surface.addEventListener('dispose', () => disposals++);
    const deadline = performance.now() + 15000;
    while (!textures.ready && performance.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const result = { fallback, ready: textures.ready, disposals,
      width: textures.color.image.width, height: textures.color.image.height };
    textures.dispose();
    return result;
  });
  expect(result).toEqual({ fallback: true, ready: true, disposals: 2, width: 1632, height: 1088 });
});
