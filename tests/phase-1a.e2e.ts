import { expect, test, type Page } from '@playwright/test';
import { walkTo } from './timber-helpers';

type State = {
  player: { x: number; z: number };
  vehicle: { x: number; z: number; yaw: number; speed: number; driving: boolean };
  npcVisual: { authored: boolean; bunBone: string | null; x: number; z: number };
};
const state = (page: Page) => page.evaluate(() => (window as Window & { __newDawnState: () => State }).__newDawnState());

for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test.describe(`${viewport.width}x${viewport.height} touch`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test('drives with independent steering and pedals, blocks moving exits and restores button size', async ({ page }, testInfo) => {
      test.setTimeout(120000);
      await page.goto('./');
      await page.locator('#newGame').click();
      await page.locator('#pauseButton').tap();
      await page.locator('#buttonSize').selectOption('large');
      await page.locator('#saveGame').tap();
      await expect(page.locator('#toast')).toHaveText('World saved');
      await page.locator('#resumeGame').tap();
      await page.locator('#toolHubButton').tap();
      await page.locator('[data-hub="saw"]').tap();
      await expect(page.locator('#toolHubButton')).toHaveAttribute('aria-label', 'Open tools, saw selected');
      await page.locator('#toolHubButton').tap();
      await page.locator('#inventoryButton').tap();
      await expect(page.locator('#basicInventory')).toContainText('food 3');
      if (viewport.width > viewport.height) {
        expect((await page.locator('#craftPanel').boundingBox())!.height).toBeGreaterThan(250);
      }
      await page.screenshot({ path: testInfo.outputPath('pack-large.png') });
      await page.locator('#closeCraft').tap();
      await page.locator('#minimap').tap();
      await expect(page.locator('#atlasPanel')).toBeVisible();
      await page.locator('#closeAtlas').tap();
      await page.locator('#pauseButton').tap();
      await page.locator('#saveGame').tap();
      await expect(page.locator('#toast')).toHaveText('World saved');
      await page.reload();
      await page.locator('#continueGame').tap();
      await expect(page.locator('#actionA')).toHaveCSS('width', '68px');
      await expect(page.locator('#toolHubButton')).toHaveAttribute('aria-label', 'Open tools, saw selected');
      await page.locator('#pauseButton').tap();
      await expect(page.locator('#buttonSize')).toHaveValue('large');
      await page.locator('#resumeGame').tap();
      const current = await state(page);
      await walkTo(page, { x: current.vehicle.x - 1, z: current.vehicle.z }, true);
      await page.locator('#actionB').tap();
      await expect(page.locator('#exitVehicle')).toBeVisible();
      await expect(page.locator('#exitVehicle')).toHaveAttribute('aria-label', 'Exit vehicle');
      await expect(page.locator('#exitVehicle svg')).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('driving-large.png') });

      const box = async (selector: string) => {
        const bounds = await page.locator(selector).boundingBox();
        if (!bounds) throw new Error(`Missing ${selector}`);
        return bounds;
      };
      const joystick = await box('#joystick');
      const pedal = await box('#actionA');
      const brake = await box('#actionB');
      const exit = await box('#exitVehicle');
      const point = (id: number, x: number, y: number) => ({ id, x, y, radiusX: 6, radiusY: 6, force: 1 });
      const steer = point(1, joystick.x + joystick.width / 2 + 34, joystick.y + joystick.height / 2);
      const gas = point(2, pedal.x + pedal.width / 2, pedal.y + pedal.height / 2);
      const reverse = point(3, brake.x + brake.width / 2, brake.y + brake.height / 2);
      const exitTouch = point(4, exit.x + exit.width / 2, exit.y + exit.height / 2);
      const cdp = await page.context().newCDPSession(page);
      const yaw = (await state(page)).vehicle.yaw;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [steer] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [steer, gas] });
      await expect.poll(async () => (await state(page)).vehicle.speed, { timeout: 10000 }).toBeGreaterThan(0.5);
      await expect.poll(async () => Math.abs((await state(page)).vehicle.yaw - yaw)).toBeGreaterThan(0.03);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [gas] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [steer, exitTouch] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [exitTouch] });
      await expect(page.locator('#toast')).toContainText('Stop the rover');
      expect((await state(page)).vehicle.driving).toBe(true);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [steer, reverse] });
      await expect.poll(async () => (await state(page)).vehicle.speed, { timeout: 10000 }).toBeLessThan(-0.4);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [steer, reverse, exitTouch] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [exitTouch] });
      await expect(page.locator('#toast')).toContainText('Stop the rover');
      expect((await state(page)).vehicle.driving).toBe(true);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
      await expect.poll(async () => Math.abs((await state(page)).vehicle.speed), { timeout: 10000 }).toBeLessThanOrEqual(0.3);
      await page.locator('#exitVehicle').tap();
      await expect(page.locator('#vehicleIndicator')).toBeHidden();
      await page.screenshot({ path: testInfo.outputPath('walking-large.png') });
      await page.locator('#pauseButton').tap();
      await page.locator('#buttonSize').selectOption('normal');
      await page.locator('#resumeGame').tap();
      await expect(page.locator('#actionA')).toHaveCSS('width', '60px');
    });
  });
}

test('desktop keeps its controls while preventing an exit at speed', async ({ page }) => {
      test.setTimeout(120000);
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto('./');
      await page.locator('#newGame').click();
      await page.locator('#pauseButton').click();
      await page.locator('#buttonSize').selectOption('large');
      await page.locator('#resumeGame').click();
      await expect(page.locator('#toolHubButton')).toHaveCSS('width', '54px');
      const vehicle = (await state(page)).vehicle;
      await walkTo(page, { x: vehicle.x - 1, z: vehicle.z });
      await page.keyboard.press('e');
      await expect(page.locator('#vehicleIndicator')).toBeVisible();
      await page.keyboard.down('w');
      await expect.poll(async () => (await state(page)).vehicle.speed, { timeout: 10000 }).toBeGreaterThan(0.5);
      await page.keyboard.press('e');
      await expect(page.locator('#toast')).toContainText('Stop the rover');
      expect((await state(page)).vehicle.driving).toBe(true);
      await page.keyboard.up('w');
      await expect.poll(async () => Math.abs((await state(page)).vehicle.speed), { timeout: 10000 }).toBeLessThanOrEqual(0.3);
      await page.keyboard.press('e');
      await expect(page.locator('#vehicleIndicator')).toBeHidden();
});

test('Taru appears in gameplay and retains the saved survivor state', async ({ page }, testInfo) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('./');
  await page.locator('#newGame').click();
  await expect.poll(async () => (await state(page)).npcVisual.bunBone, { timeout: 30000 }).toBe('Head');
  const npc = (await state(page)).npcVisual;
  expect(npc.authored).toBe(true);
  await walkTo(page, { x: npc.x + 1, z: npc.z });
  await page.locator('#pauseButton').click();
  await page.locator('#cameraDistance').fill('5');
  await page.locator('#resumeGame').click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: testInfo.outputPath('taru-gameplay.png') });
  await page.keyboard.press('e');
  await expect(page.locator('#npcPanel h2')).toHaveText('TARU PAMPULA · SURVIVOR');
  await page.locator('#npcRecruit').click();
  await page.locator('#closeNpc').click();
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.reload();
  await page.locator('#continueGame').click();
  await expect.poll(async () => (await state(page)).npcVisual.bunBone, { timeout: 30000 }).toBe('Head');
  await page.keyboard.press('e');
  await expect(page.locator('#npcRecruit')).toBeDisabled();
});
