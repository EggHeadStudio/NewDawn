import { expect, test } from '@playwright/test';
import { walkTo } from './timber-helpers';

type Tree = { id: string; x: number; z: number; species: string; variant?: string; authored: boolean };
type State = { player: { x: number; z: number }; cameraAngle: number; trees: Tree[] };

for (const viewport of [
  { name: 'desktop', width: 1280, height: 720, touch: false },
  { name: 'portrait', width: 390, height: 844, touch: true },
  { name: 'landscape', width: 844, height: 390, touch: true },
]) {
  test.describe(viewport.name, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.touch, isMobile: viewport.touch });

    test('walks from the starter island to an authored mature pine', async ({ page }, testInfo) => {
      test.setTimeout(180000);
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => {
        if (message.type() === 'error' && /shader|webglprogram/i.test(message.text())) errors.push(message.text());
      });
      const state = () => page.evaluate(() => (window as Window & { __newDawnState: () => State }).__newDawnState());
      const activate = async (selector: string) => {
        if (viewport.touch) await page.locator(selector).tap();
        else await page.locator(selector).click();
      };

      await page.goto('./');
      await page.locator('#worldSeed').fill('1847');
      await activate('#newGame');
      await activate('#pauseButton');
      await page.locator('#cameraFollow').uncheck();
      await page.locator('#gameSpeed').fill('8');
      await activate('#resumeGame');

      await walkTo(page, { x: 90, z: 0 }, viewport.touch);
      await expect.poll(async () => (await state()).trees.some(tree => tree.variant === 'mature-pine'),
        { timeout: 30000 }).toBe(true);
      const initial = await state();
      const pine = initial.trees.filter(tree => tree.species === 'pine' && tree.variant === 'mature-pine')
        .sort((a, b) => Math.hypot(a.x - initial.player.x, a.z - initial.player.z)
          - Math.hypot(b.x - initial.player.x, b.z - initial.player.z))[0];
      expect(initial.trees.some(tree => tree.species === 'pine' && tree.variant === 'pine'
        && Math.hypot(tree.x - pine.x, tree.z - pine.z) < 25)).toBe(true);
      const camera = initial.cameraAngle;
      await walkTo(page, { x: pine.x + Math.sin(camera) * 5, z: pine.z + Math.cos(camera) * 5 }, viewport.touch);
      await expect.poll(async () => (await state()).trees.some(tree => tree.id === pine.id
        && tree.variant === 'mature-pine' && tree.authored), { timeout: 30000 }).toBe(true);
      await page.waitForTimeout(1000);
      await page.screenshot({ path: testInfo.outputPath('pine-normal.png') });

      if (viewport.touch) {
        const cdp = await page.context().newCDPSession(page);
        const x = viewport.width * 0.75;
        const y = viewport.height * 0.55;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 150, id: 1 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await cdp.detach();
      } else {
        await activate('#pauseButton');
        await page.locator('#legacyCamera').check();
        await activate('#resumeGame');
        await page.mouse.move(600, 350);
        await page.mouse.down({ button: 'right' });
        await page.mouse.move(600, 200);
        await page.mouse.up({ button: 'right' });
      }
      await page.waitForTimeout(500);
      await page.screenshot({ path: testInfo.outputPath('pine-canopy.png') });

      await activate('#pauseButton');
      await activate('#saveGame');
      await expect(page.locator('#toast')).toHaveText('World saved');
      await page.reload();
      await activate('#continueGame');
      await expect.poll(async () => (await state()).trees.some(tree => tree.id === pine.id
        && tree.variant === 'mature-pine' && tree.authored), { timeout: 30000 }).toBe(true);
      console.log(`${viewport.name}: walked to mature pine ${pine.id} at x=${pine.x.toFixed(1)}, z=${pine.z.toFixed(1)}.`);
      expect(errors).toEqual([]);
    });
  });
}
