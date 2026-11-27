import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

type Tree = { id: string; x: number; z: number; family: string; authored: boolean };
type Snapshot = { trees: Tree[]; player: { x: number; z: number } };
type SavedWorld = { version: number; seed: number; player: { x: number; y: number; z: number };
  npc: { x: number; z: number }; vehicle: { x: number; z: number };
  planetPositions?: unknown; onboarding?: unknown; wildlife: unknown[] };

async function changeSave(page: Page, change: 'tree' | 'mira' | 'legacy', tree?: Tree) {
  await page.evaluate(async ({ change, tree }) => {
    const { World } = await import('/NewDawn/src/world.ts');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('new-dawn', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const record = await new Promise<SavedWorld>((resolve, reject) => {
      const request = db.transaction('saves').objectStore('saves').get('primary');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (change === 'legacy') {
      delete record.onboarding;
    } else {
      record.version = 11;
      delete record.planetPositions;
      record.wildlife = [];
      if (change === 'tree' && tree) {
        const world = new World(Number(record.seed));
        record.player = { x: tree.x, y: world.heightAt(tree.x, tree.z), z: tree.z };
        record.npc = { x: tree.x + 30, z: tree.z + 30 };
        record.vehicle = { x: tree.x + 35, z: tree.z + 35 };
        world.dispose();
      } else {
        record.npc = { x: record.player.x + 1, z: record.player.z };
        record.vehicle = { x: record.player.x + 30, z: record.player.z + 30 };
      }
    }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('saves', 'readwrite');
      tx.objectStore('saves').put(record, 'primary');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, { change, tree });
}

async function save(page: Page) {
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
}

test('guided introduction follows real gathering, construction and Mira interaction', async ({ page }) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const state = () => page.evaluate(() => (window as Window & { __newDawnState: () => Snapshot }).__newDawnState());
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await page.locator('#newGame').click();
  await expect(page.locator('#objectiveText')).toContainText('Gather a resource');
  await expect.poll(async () => (await state()).trees.some(tree => tree.family === 'deciduous' && tree.authored), { timeout: 30000 }).toBe(true);
  const tree = (await state()).trees.find(item => item.family === 'deciduous' && item.authored)!;
  await save(page);
  await changeSave(page, 'tree', tree);
  await page.reload();
  await page.locator('#continueGame').click();
  await expect.poll(async () => {
    const snapshot = await state();
    return Math.hypot(snapshot.player.x - tree.x, snapshot.player.z - tree.z) < 0.5
      && snapshot.trees.some(item => item.id === tree.id && item.authored);
  }, { timeout: 30000 }).toBe(true);
  await page.keyboard.press('Space');
  await expect(page.locator('#toast')).toContainText('wood');
  await expect(page.locator('#objectiveText')).toContainText('Open Pack');
  await page.locator('#inventoryButton').click();
  await expect(page.locator('#objectiveText')).toContainText('modular floor');
  await page.locator('#closeCraft').click();
  await page.locator('[data-tool="build"]').click();
  await page.locator('[data-building="floor"]').click();
  const point = await page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
    const status = document.querySelector('#placementStatus')!;
    for (let y = 220; y <= 820; y += 15) for (let x = 140; x <= 1390; x += 15) {
      if (document.elementFromPoint(x, y) !== canvas) continue;
      canvas.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse', clientX: x, clientY: y }));
      if (status.textContent === 'Ready to place') return { x, y };
    }
    return null;
  });
  expect(point).not.toBeNull();
  await page.mouse.move(point!.x, point!.y);
  await page.locator('#confirmBuild').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#objectiveText')).toContainText('Mira');
  await save(page);
  await changeSave(page, 'mira');
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#objectiveText')).toContainText('Mira');
  await page.keyboard.press('e');
  await expect(page.locator('#npcPanel')).toBeVisible();
  await page.locator('#npcRecruit').click();
  await expect(page.locator('#objective')).toBeHidden();
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#objective')).toBeHidden();
  expect(errors).toEqual([]);
});

test.describe('mobile introduction', () => {
test.use({ hasTouch: true, isMobile: true });

test('free exploration, restart, skip and legacy saves persist', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.locator('#introductionChoice').selectOption('free');
  await page.locator('#newGame').click();
  await expect(page.locator('#objective')).toBeHidden();
  await page.locator('#pauseButton').click();
  await page.locator('#restartIntroduction').click();
  await page.locator('#resumeGame').click();
  await expect(page.locator('#objectiveText')).toContainText('Gather a resource');
  const directory = join(process.cwd(), 'art-review', 'batch-005d-a3', 'onboarding');
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: join(directory, 'mobile-guide.png') });
  const checkHint = async () => {
    const hint = await page.locator('#objective').boundingBox();
    expect(hint).not.toBeNull();
    const viewport = page.viewportSize()!;
    expect(hint!.x).toBeGreaterThanOrEqual(0);
    expect(hint!.y).toBeGreaterThanOrEqual(0);
    expect(hint!.x + hint!.width).toBeLessThanOrEqual(viewport.width);
    expect(hint!.y + hint!.height).toBeLessThanOrEqual(viewport.height);
    for (const selector of ['#minimap', '#joystick', '#actionA', '#actionB', '#weaponButton']) {
      const box = await page.locator(selector).boundingBox();
      expect(box).not.toBeNull();
      expect(hint!.x < box!.x + box!.width && hint!.x + hint!.width > box!.x
        && hint!.y < box!.y + box!.height && hint!.y + hint!.height > box!.y, selector).toBe(false);
    }
  };
  await checkHint();
  await page.setViewportSize({ width: 844, height: 390 });
  await checkHint();
  await page.screenshot({ path: join(directory, 'mobile-guide-landscape.png') });
  await page.locator('#pauseButton').click();
  await page.locator('#skipIntroduction').click();
  await expect(page.locator('#toast')).toHaveText('Introduction skipped');
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#objective')).toBeHidden();
  await save(page);
  await changeSave(page, 'legacy');
  await page.reload();
  await page.locator('#continueGame').click();
  await expect(page.locator('#objective')).toBeHidden();
});
});
