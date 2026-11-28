import { expect, type CDPSession, type Page } from '@playwright/test';

type Tree = { id: string; falling: boolean; harvest: null | {
  phase: 'standing' | 'fallen' | 'logs'; progress?: number; remaining?: number; total?: number;
} };
type State = { trees: Tree[]; animationActionTime: number; attackCooldown: number; animationAction: string;
  player: { x: number; z: number }; cameraAngle: number };

export async function timberState(page: Page) {
  return page.evaluate(() => (window as Window & { __newDawnState: () => State }).__newDawnState());
}

export async function selectSaw(page: Page, touch = false) {
  if (touch) {
    await page.locator('#toolHubButton').tap();
    await page.locator('[data-hub="saw"]').tap();
  } else {
    await page.locator('#toolHubButton').click();
    await page.locator('[data-hub="saw"]').click();
  }
  await expect(page.locator('#toolHubButton')).toHaveAttribute('aria-label', 'Open tools, saw selected');
}

export async function timberAction(page: Page, touch = false) {
  await expect.poll(async () => {
    const state = await timberState(page);
    return Math.max(state.animationActionTime, state.attackCooldown);
  }, { timeout: 15000 }).toBe(0);
  if (touch) await page.locator('#actionA').tap();
  else await page.keyboard.press('Space');
}

export async function walkTo(page: Page, point: { x: number; z: number }, touch = false) {
  const cdp: CDPSession | undefined = touch ? await page.context().newCDPSession(page) : undefined;
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      const current = await timberState(page);
      const dx = point.x - current.player.x;
      const dz = point.z - current.player.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 1.05) return;
      const x = dx * Math.cos(current.cameraAngle) - dz * Math.sin(current.cameraAngle);
      const y = dx * Math.sin(current.cameraAngle) + dz * Math.cos(current.cameraAngle);
      const duration = Math.min(250, Math.max(75, distance * 190));
      if (cdp) {
        const box = await page.locator('#joystick').boundingBox();
        if (!box) throw new Error('Joystick is not visible');
        const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        const length = Math.hypot(x, y);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...center, id: 1 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove',
          touchPoints: [{ x: center.x + x / length * 37, y: center.y + y / length * 37, id: 1 }] });
        await page.waitForTimeout(duration);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } else {
        const largest = Math.max(Math.abs(x), Math.abs(y));
        const keys = [
          ...(Math.abs(x) > largest * 0.4 ? [x > 0 ? 'd' : 'a'] : []),
          ...(Math.abs(y) > largest * 0.4 ? [y > 0 ? 's' : 'w'] : []),
        ];
        for (const key of keys) await page.keyboard.down(key);
        await page.waitForTimeout(duration);
        for (const key of keys) await page.keyboard.up(key);
      }
    }
    throw new Error(`Could not walk to ${point.x.toFixed(1)},${point.z.toFixed(1)}`);
  } finally {
    await cdp?.detach();
  }
}

export async function workTree(page: Page, id: string, touch = false, beforeAction?: () => Promise<void>) {
  for (let attempt = 0; attempt < 12; attempt++) {
    await beforeAction?.();
    const before = (await timberState(page)).trees.find(tree => tree.id === id)?.harvest;
    await timberAction(page, touch);
    const state = await timberState(page);
    const after = state.trees.find(tree => tree.id === id)?.harvest;
    if (JSON.stringify(before) !== JSON.stringify(after)) return;
    if (state.animationAction !== 'attack' && state.animationAction !== 'hurt') {
      throw new Error(`Primary action did not affect the targeted tree (${state.animationAction})`);
    }
  }
  throw new Error('Could not work the tree after defending against nearby wildlife');
}

export async function sawTree(page: Page, id: string, touch = false, beforeAction?: () => Promise<void>) {
  const tree = async () => (await timberState(page)).trees.find(item => item.id === id);
  await selectSaw(page, touch);
  for (const progress of [1, 2]) {
    await workTree(page, id, touch, beforeAction);
    await expect.poll(async () => (await tree())?.harvest).toMatchObject({ phase: 'standing', progress });
  }
  await workTree(page, id, touch, beforeAction);
  await expect.poll(async () => (await tree())?.harvest?.phase).toBe('fallen');
  await expect.poll(async () => (await tree())?.falling, { timeout: 15000 }).toBe(false);
  await workTree(page, id, touch, beforeAction);
  await expect.poll(async () => (await tree())?.harvest).toMatchObject({ phase: 'fallen', progress: 1 });
  await workTree(page, id, touch, beforeAction);
  await expect.poll(async () => (await tree())?.harvest?.phase).toBe('logs');
}

export async function collectTree(page: Page, id: string, touch = false, beforeAction?: () => Promise<void>) {
  const tree = async () => (await timberState(page)).trees.find(item => item.id === id);
  for (let attempt = 0; attempt < 8; attempt++) {
    const current = await tree();
    if (!current) return;
    expect(current.harvest?.phase).toBe('logs');
    await workTree(page, id, touch, beforeAction);
    await expect.poll(async () => {
      const after = await tree();
      return after?.harvest?.remaining ?? 0;
    }).toBeLessThan(current.harvest?.remaining ?? 0);
  }
  expect(await tree()).toBeUndefined();
}
