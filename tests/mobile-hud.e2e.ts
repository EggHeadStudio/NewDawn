import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

test.use({ hasTouch: true, isMobile: true });

const viewports = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 844, height: 390 },
  { width: 932, height: 430 },
  { width: 1024, height: 768 },
];

async function screenshot(page: Page, folder: string, name: string) {
  await page.screenshot({ path: join(folder, name), animations: 'disabled' });
}

async function box(page: Page, selector: string) {
  const result = await page.locator(selector).boundingBox();
  if (!result) throw new Error(`${selector} has no visible bounding box`);
  return result;
}

function intersects(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

async function expectInsideViewport(page: Page, selector: string, viewport: { width: number; height: number }) {
  const bounds = await box(page, selector);
  expect(bounds.x, `${selector} left edge`).toBeGreaterThanOrEqual(0);
  expect(bounds.y, `${selector} top edge`).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width, `${selector} right edge`).toBeLessThanOrEqual(viewport.width);
  expect(bounds.y + bounds.height, `${selector} bottom edge`).toBeLessThanOrEqual(viewport.height);
  return bounds;
}

async function expectControlsClear(page: Page, selector: string) {
  const bounds = await box(page, selector);
  for (const control of ['#minimap', '#joystick', '#actionA', '#actionB', '#jumpButton', '#weaponButton']) {
    if (!await page.locator(control).isVisible()) continue;
    expect(intersects(bounds, await box(page, control)), `${selector} overlaps ${control}`).toBe(false);
  }
  const quickbar = await page.locator('.quickbar').boundingBox();
  if (quickbar) expect(intersects(bounds, quickbar), `${selector} overlaps quick actions`).toBe(false);
}

async function swipeScroll(page: Page, selector: string) {
  const bounds = await box(page, selector);
  const x = bounds.x + bounds.width * 0.6;
  const startY = bounds.y + bounds.height * 0.8;
  const endY = Math.max(bounds.y + 12, startY - 100);
  const session = await page.context().newCDPSession(page);
  const point = (y: number) => ({ id: 21, x, y, radiusX: 6, radiusY: 6, force: 1 });
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point(startY)] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point(endY)] });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await session.detach();
  await page.waitForTimeout(100);
  return page.locator(selector).evaluate(element => ({ top: element.scrollTop, max: element.scrollHeight - element.clientHeight }));
}

async function save(page: Page) {
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.locator('#resumeGame').click();
}

async function readPlayer(page: Page) {
  return page.evaluate(() => new Promise<{ x: number; z: number }>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const get = db.transaction('saves').objectStore('saves').get('primary');
      get.onerror = () => reject(get.error);
      get.onsuccess = () => { resolve(get.result.player); db.close(); };
    };
  }));
}

test('captures and checks mobile HUD gameplay and expanded panels', async ({ page }) => {
  test.setTimeout(240000);
  const folder = join('art-review', 'batch-005c-p2c', 'mobile-ui', 'action-pad');
  await mkdir(folder, { recursive: true });

  for (const viewport of viewports) {
    const size = `${viewport.width}x${viewport.height}`;
    await page.setViewportSize(viewport);
    await page.goto('./');
    await page.locator('#newGame').click();
    await expect(page.locator('#pauseButton')).toBeVisible();
    await page.locator('#toast').evaluate(element => element.classList.add('visible'));
    const notification = await box(page, '#toast');
    expect(intersects(notification, await box(page, '#minimap')), 'notification overlaps minimap').toBe(false);
    for (const control of ['#joystick', '#actionA', '#actionB', '#jumpButton', '#weaponButton', '.quickbar']) {
      expect(intersects(notification, await box(page, control)), `notification overlaps ${control}`).toBe(false);
    }
    await page.locator('#toast').evaluate(element => element.classList.remove('visible'));
    await page.waitForTimeout(2000);
    await expect(page.locator('#resourceToggle')).toBeVisible();
    await expect(page.locator('#joystick')).toBeVisible();
    await expect(page.locator('#actionA')).toBeVisible();
    await expect(page.locator('#actionB')).toBeVisible();

    const documentWidth = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
    expect(documentWidth.scrollWidth).toBeLessThanOrEqual(documentWidth.width);

    const minimap = await box(page, '#minimap');
    const resources = await box(page, '#resourceToggle');
    const joystick = await box(page, '#joystick');
    const actionA = await box(page, '#actionA');
    const actionB = await box(page, '#actionB');
    const jump = await box(page, '#jumpButton');
    const weapon = await box(page, '#weaponButton');
    const quickbar = await box(page, '.quickbar');
    expect(intersects(minimap, resources), 'resource summary overlaps minimap').toBe(false);
    for (const [name, bounds] of [['joystick', joystick], ['A', actionA], ['B', actionB], ['jump', jump], ['weapon', weapon], ['quickbar', quickbar]] as const) {
      expect(bounds.x, `${name} left edge`).toBeGreaterThanOrEqual(0);
      expect(bounds.y, `${name} top edge`).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width, `${name} right edge`).toBeLessThanOrEqual(viewport.width);
      expect(bounds.y + bounds.height, `${name} bottom edge`).toBeLessThanOrEqual(viewport.height);
    }
    expect(intersects(joystick, actionA), 'joystick overlaps action A').toBe(false);
    expect(intersects(joystick, actionB), 'joystick overlaps action B').toBe(false);
    expect(intersects(joystick, quickbar), 'joystick overlaps quick actions').toBe(false);
    expect(intersects(actionA, actionB), 'action buttons overlap').toBe(false);
    expect(intersects(jump, actionA), 'jump overlaps action A').toBe(false);
    expect(intersects(jump, actionB), 'jump overlaps action B').toBe(false);
    expect(intersects(jump, joystick), 'jump overlaps joystick').toBe(false);
    expect(intersects(quickbar, actionA), 'quickbar overlaps action A').toBe(false);
    expect(intersects(quickbar, actionB), 'quickbar overlaps action B').toBe(false);
    expect(intersects(quickbar, jump), 'quickbar overlaps jump').toBe(false);
    for (const [name, bounds] of [['joystick', joystick], ['A', actionA], ['B', actionB], ['jump', jump], ['quickbar', quickbar], ['minimap', minimap], ['resources', resources]] as const) {
      expect(intersects(weapon, bounds), `weapon overlaps ${name}`).toBe(false);
    }
    expect(weapon.width).toBeGreaterThanOrEqual(60);
    expect(weapon.height).toBeGreaterThanOrEqual(60);
    expect(actionA.width).toBeGreaterThanOrEqual(60);
    expect(actionA.height).toBeGreaterThanOrEqual(60);
    expect(actionB.width).toBeGreaterThanOrEqual(60);
    expect(actionB.height).toBeGreaterThanOrEqual(60);
    expect(jump.width).toBeGreaterThanOrEqual(50);
    expect(jump.height).toBeGreaterThanOrEqual(50);
    expect(intersects(resources, joystick), 'resource summary overlaps joystick').toBe(false);
    await screenshot(page, folder, `gameplay-${size}.png`);

    await page.locator('#resourceToggle').click();
    await expect(page.locator('#resourceToggle')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#resourceCounts')).toBeVisible();
    const resourceDetails = await expectInsideViewport(page, '#resourceCounts', viewport);
    expect(intersects(minimap, resourceDetails), 'expanded resources overlap minimap').toBe(false);
    expect(intersects(joystick, resourceDetails), 'expanded resources overlap joystick').toBe(false);
    expect(intersects(actionA, resourceDetails), 'expanded resources overlap action A').toBe(false);
    expect(intersects(actionB, resourceDetails), 'expanded resources overlap action B').toBe(false);
    expect(intersects(weapon, resourceDetails), 'expanded resources overlap weapon').toBe(false);
    await screenshot(page, folder, `resources-expanded-${size}.png`);
    await page.locator('#resourceToggle').click();

    await page.locator('#toolHubButton').click();
    await expect(page.locator('#toolHub')).toBeVisible();
    await expect(page.locator('#toast')).toBeHidden();
    const hub = await expectInsideViewport(page, '#toolHub', viewport);
    await expectInsideViewport(page, '#closeToolHub', viewport);
    expect(intersects(hub, joystick), 'tool hub overlaps joystick').toBe(false);
    expect(intersects(hub, actionA), 'tool hub overlaps action A').toBe(false);
    expect(intersects(hub, actionB), 'tool hub overlaps action B').toBe(false);
    expect(intersects(hub, jump), 'tool hub overlaps jump').toBe(false);
    expect(intersects(hub, weapon), 'tool hub overlaps weapon').toBe(false);
    await screenshot(page, folder, `tool-hub-${size}.png`);
    await page.locator('#closeToolHub').click();

    await page.locator('#toolHubButton').click();
    await page.locator('[data-hub="build"]').click();
    await expect(page.locator('#buildPanel')).toBeVisible();
    await expect(page.locator('#toast')).toBeHidden();
    await expectInsideViewport(page, '#buildPanel', viewport);
    await expectControlsClear(page, '#buildPanel');
    await screenshot(page, folder, `build-${size}.png`);
    const buildScroll = await swipeScroll(page, '#buildPanel');
    if (buildScroll.max > 0) expect(buildScroll.top, `build panel scrolls on touch at ${size}`).toBeGreaterThan(0);
    await page.locator('#buildPanel').evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expectInsideViewport(page, '#closeBuild', viewport);
    await page.locator('#closeBuild').click();

    for (const tool of ['terrain', 'road', 'paint']) {
      await page.locator('#toolHubButton').click();
      await page.locator(`[data-hub="${tool}"]`).click();
      const toolbar = page.locator(`#${tool}Toolbar`);
      await expect(toolbar).toBeVisible();
      await expect(page.locator('#toast')).toBeHidden();
      await expectInsideViewport(page, `#${tool}Toolbar`, viewport);
      await expectControlsClear(page, `#${tool}Toolbar`);
      await screenshot(page, folder, `${tool}-${size}.png`);
      const touchScroll = await swipeScroll(page, `#${tool}Toolbar`);
      if (touchScroll.max > 0) expect(touchScroll.top, `${tool} toolbar scrolls on touch at ${size}`).toBeGreaterThan(0);
      const scrollState = await toolbar.evaluate(element => {
        element.scrollTop = element.scrollHeight;
        return { top: element.scrollTop, max: element.scrollHeight - element.clientHeight };
      });
      if (scrollState.max > 0) expect(scrollState.top).toBeGreaterThan(0);
      await expectInsideViewport(page, `#${tool}Exit`, viewport);
      await page.locator(`#${tool}Exit`).click();
    }

    await page.locator('#toolHubButton').click();
    await page.locator('#inventoryButton').click();
    await expect(page.locator('#craftPanel')).toBeVisible();
    await expect(page.locator('#toast')).toBeHidden();
    await expectInsideViewport(page, '#craftPanel', viewport);
    await expectControlsClear(page, '#craftPanel');
    await screenshot(page, folder, `inventory-${size}.png`);
    const inventoryScroll = await swipeScroll(page, '#craftPanel');
    if (inventoryScroll.max > 0) expect(inventoryScroll.top, `inventory panel scrolls on touch at ${size}`).toBeGreaterThan(0);
    await page.locator('#craftPanel').evaluate(element => { element.scrollTop = element.scrollHeight; });
    await expectInsideViewport(page, '#closeCraft', viewport);
    await page.locator('#closeCraft').click();

    await page.locator('#minimap').click();
    await expect(page.locator('#atlasPanel')).toBeVisible();
    await expect(page.locator('#toast')).toBeHidden();
    await expectInsideViewport(page, '#atlasPanel', viewport);
    await expectInsideViewport(page, '#closeAtlas', viewport);
    await expectInsideViewport(page, '#atlasCanvas', viewport);
    await screenshot(page, folder, `atlas-${size}.png`);
    await page.locator('#closeAtlas').click();
  }
});

test('keeps joystick movement and action A active at the same time', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.locator('#newGame').click();
  await expect(page.locator('#pauseButton')).toBeVisible();
  await save(page);
  const before = await readPlayer(page);

  await page.evaluate(() => {
    const audit = window as Window & { mobileInputAudit?: Array<{ target: string; pointerId: number; captured: boolean }> };
    audit.mobileInputAudit = [];
    for (const selector of ['#joystick', '#actionA']) {
      const element = document.querySelector<HTMLElement>(selector)!;
      element.addEventListener('pointerdown', event => {
        audit.mobileInputAudit!.push({ target: selector, pointerId: event.pointerId, captured: element.hasPointerCapture(event.pointerId) });
      });
      element.addEventListener('pointerup', event => {
        audit.mobileInputAudit!.push({ target: `${selector}-up`, pointerId: event.pointerId, captured: element.hasPointerCapture(event.pointerId) });
      });
      element.addEventListener('pointercancel', event => {
        audit.mobileInputAudit!.push({ target: `${selector}-cancel`, pointerId: event.pointerId, captured: false });
      });
    }
  });

  const joystick = await box(page, '#joystick');
  const actionA = await box(page, '#actionA');
  const touchPoint = (id: number, x: number, y: number) => ({ id, x, y, radiusX: 6, radiusY: 6, force: 1 });
  const session = await page.context().newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      touchPoint(1, joystick.x + joystick.width / 2 + 20, joystick.y + joystick.height / 2),
      touchPoint(2, actionA.x + actionA.width / 2, actionA.y + actionA.height / 2),
    ],
  });
  await expect.poll(() => page.evaluate(() => (window as Window & { mobileInputAudit?: Array<{ target: string }> }).mobileInputAudit?.map(event => event.target))).toEqual(['#joystick', '#actionA']);
  await expect.poll(() => page.locator('#stick').evaluate(element => element.style.transform)).not.toBe('translate(0px, 0px)');

  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [
      touchPoint(1, joystick.x + joystick.width / 2 + 34, joystick.y + joystick.height / 2),
      touchPoint(2, actionA.x + actionA.width / 2, actionA.y + actionA.height / 2),
    ],
  });
  await page.waitForTimeout(600);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('#toast')).not.toHaveText('World saved');
  await expect(page.locator('#toast')).toHaveClass(/visible/);
  const notification = await box(page, '#toast');
  for (const selector of ['#minimap', '#joystick', '#actionA', '#actionB', '#jumpButton', '.quickbar']) {
    expect(intersects(notification, await box(page, selector)), `notification overlaps ${selector}`).toBe(false);
  }
  const folder = join('art-review', 'batch-005c-p2c', 'mobile-ui', 'after');
  await mkdir(folder, { recursive: true });
  await screenshot(page, folder, 'notification-390x844.png');
  await session.detach();

  await save(page);
  const after = await readPlayer(page);
  expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(0.1);
  const captures = await page.evaluate(() => (window as Window & { mobileInputAudit?: Array<{ target: string; captured: boolean }> }).mobileInputAudit);
  expect(captures?.filter(event => event.target === '#joystick' || event.target === '#actionA').every(event => event.captured)).toBe(true);
});
