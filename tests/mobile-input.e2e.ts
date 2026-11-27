import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

type Snapshot = {
  player: { x: number; z: number };
  cameraAngle: number;
  stones: number;
  projectiles: unknown[];
};

test.use({ hasTouch: true, isMobile: true });

for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`independent touch ownership and focus cleanup at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize(viewport);
    await page.goto('./');
    await page.locator('#newGame').click();
    await page.locator('#pauseButton').click();
    await page.locator('#cameraFollow').uncheck();
    await page.locator('#saveGame').click();
    await expect(page.locator('#toast')).toHaveText('World saved');
    await page.locator('#resumeGame').click();
    await page.locator('#toolHubButton').tap();
    await page.locator('[data-hub="stones"]').tap();
    await expect(page.locator('#weaponButton')).toHaveAttribute('aria-label', 'Throw stone, 0 remaining');
    const snapshot = () => page.evaluate(() => (window as Window & { __newDawnState: () => Snapshot }).__newDawnState());
    const initial = await snapshot();
    const direction = await page.evaluate(async state => {
      const { terrainHeight } = await import('/NewDawn/src/world.ts');
      const { cameraRelativeMovement } = await import('/NewDawn/src/camera.ts');
      const request = indexedDB.open('new-dawn', 1);
      const seed = await new Promise<number>((resolve, reject) => {
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const get = db.transaction('saves').objectStore('saves').get('primary');
          get.onerror = () => reject(get.error);
          get.onsuccess = () => { resolve(get.result.seed); db.close(); };
        };
      });
      for (let i = 0; i < 16; i++) {
        const x = Math.cos(i * Math.PI / 8), y = Math.sin(i * Math.PI / 8);
        const movement = cameraRelativeMovement(x, y, state.cameraAngle);
        if ([1, 2, 3, 4, 5].every(distance => terrainHeight(
          state.player.x + movement.x * distance, state.player.z + movement.y * distance, seed,
        ) > 0.3)) return { x, y };
      }
      throw new Error('No dry movement direction near the starting player');
    }, initial);
    await page.evaluate(() => {
      const weapon = document.querySelector<HTMLButtonElement>('#weaponButton')!;
      weapon.addEventListener('pointerdown', event => { weapon.dataset.testPointer = String(event.pointerId); });
      const action = document.querySelector<HTMLButtonElement>('#actionA')!;
      action.addEventListener('pointerdown', event => { action.dataset.testPointer = String(event.pointerId); });
    });
    const joystick = (await page.locator('#joystick').boundingBox())!;
    const action = (await page.locator('#actionA').boundingBox())!;
    const weapon = (await page.locator('#weaponButton').boundingBox())!;
    const point = (id: number, x: number, y: number) => ({ id, x, y, radiusX: 6, radiusY: 6, force: 1 });
    const stick = point(1, joystick.x + joystick.width / 2 + direction.x * 32, joystick.y + joystick.height / 2 + direction.y * 32);
    const a = point(2, action.x + action.width / 2, action.y + action.height / 2);
    const attack = point(3, weapon.x + weapon.width / 2, weapon.y + weapon.height / 2);
    const cdp = await page.context().newCDPSession(page);

    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a, stick] });
    await page.waitForTimeout(500);
    const moved = await snapshot();
    expect(Math.hypot(moved.player.x - initial.player.x, moved.player.z - initial.player.z)).toBeGreaterThan(0.1);
    const folder = join('art-review', 'batch-005c-p2c', 'mobile-ui', 'action-pad');
    await mkdir(folder, { recursive: true });
    await page.screenshot({ path: join(folder, `simultaneous-a-${viewport.width}x${viewport.height}.png`) });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [stick] });
    expect(await page.locator('#actionA').evaluate(element =>
      element.hasPointerCapture(Number((element as HTMLElement).dataset.testPointer)))).toBe(true);
    const toastBefore = await page.locator('#toast').innerText();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [a] });
    await expect(page.locator('#toast')).not.toHaveText(toastBefore);

    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [stick] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [stick, attack] });
    const beforeCancel = await snapshot();
    await page.locator('#weaponButton').evaluate(element => {
      const id = Number((element as HTMLElement).dataset.testPointer);
      element.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: id, pointerType: 'touch' }));
    });
    await page.waitForTimeout(400);
    const afterCancel = await snapshot();
    expect(Math.hypot(afterCancel.player.x - beforeCancel.player.x, afterCancel.player.z - beforeCancel.player.z)).toBeGreaterThan(0.1);
    expect(afterCancel.stones).toBe(0);
    expect(afterCancel.projectiles).toHaveLength(0);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });

    const hub = (await page.locator('#toolHubButton').boundingBox())!;
    const hubTouch = point(4, hub.x + hub.width / 2, hub.y + hub.height / 2);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [stick] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [stick, hubTouch] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [hubTouch] });
    await expect(page.locator('#toolHub')).toBeVisible();
    const beforeHub = await snapshot();
    await page.waitForTimeout(300);
    const afterHub = await snapshot();
    expect(Math.hypot(afterHub.player.x - beforeHub.player.x, afterHub.player.z - beforeHub.player.z)).toBeGreaterThan(0.1);
    const close = (await page.locator('#closeToolHub').boundingBox())!;
    const closeTouch = point(5, close.x + close.width / 2, close.y + close.height / 2);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [stick, closeTouch] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [closeTouch] });
    await expect(page.locator('#toolHub')).toBeHidden();
    await expect(page.locator('#stick')).not.toHaveAttribute('style', 'transform: translate(0px, 0px);');
    expect((await snapshot()).projectiles).toHaveLength(0);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [stick, hubTouch] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [hubTouch] });
    await expect(page.locator('#toolHub')).toBeVisible();
    await page.locator('#toolHub').evaluate(element => { element.scrollTop = 0; });
    const fists = (await page.locator('[data-hub="fists"]').boundingBox())!;
    const fistsTouch = point(8, fists.x + fists.width / 2, fists.y + fists.height / 2);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [stick, fistsTouch] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [fistsTouch] });
    await expect(page.locator('#toolHub')).toBeHidden();
    await expect(page.locator('#weaponButton')).toHaveAttribute('aria-label', 'Attack with fists');
    const beforeSelection = await snapshot();
    await page.waitForTimeout(300);
    const afterSelection = await snapshot();
    expect(Math.hypot(afterSelection.player.x - beforeSelection.player.x, afterSelection.player.z - beforeSelection.player.z)).toBeGreaterThan(0.1);
    expect(afterSelection.projectiles).toHaveLength(0);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [stick] });

    const cameraA = point(6, viewport.width * 0.58, viewport.height * 0.42);
    const cameraB = point(7, viewport.width * 0.75, viewport.height * 0.42);
    const cameraBMoved = point(7, cameraB.x + 30, cameraB.y);
    const distanceBefore = await page.locator('#cameraDistance').inputValue();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [stick] });
    const beforePinch = await snapshot();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [stick, cameraA, cameraB] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [stick, cameraA, cameraBMoved] });
    await expect.poll(() => page.locator('#cameraDistance').inputValue()).not.toBe(distanceBefore);
    await page.waitForTimeout(250);
    const afterPinch = await snapshot();
    expect(Math.hypot(afterPinch.player.x - beforePinch.player.x, afterPinch.player.z - beforePinch.player.z)).toBeGreaterThan(0.05);
    await expect(page.locator('#stick')).not.toHaveAttribute('style', 'transform: translate(0px, 0px);');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [cameraA, cameraBMoved] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [stick] });

    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [stick] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [stick, attack] });
    const beforeBlur = await page.locator('#toast').innerText();
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(page.locator('#stick')).toHaveAttribute('style', 'transform: translate(0px, 0px);');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [attack] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [stick] });
    expect(await page.locator('#toast').innerText()).toBe(beforeBlur);
    const stopped = await snapshot();
    await page.waitForTimeout(250);
    const stillStopped = await snapshot();
    expect(Math.hypot(stillStopped.player.x - stopped.player.x, stillStopped.player.z - stopped.player.z)).toBeLessThan(0.02);

    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [stick] });
    await expect(page.locator('#stick')).not.toHaveAttribute('style', 'transform: translate(0px, 0px);');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [stick] });
    await cdp.detach();
  });
}
