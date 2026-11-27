import { test, expect, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { createServer, request as httpRequest, type Server, type ServerResponse } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import { resolve } from 'node:path';

// Run against an already-built Vite preview. A local proxy supplies a previous
// worker/asset and controllable failures without editing dist or browser data.
const assetPath = '/NewDawn/assets/environment/trees/mature-fir.glb';
const optionalCache = 'new-dawn-optional-regional-trees-v2';
const legacyOptionalCache = 'new-dawn-optional-regional-trees';
const distDir = resolve(process.env.OPTIONAL_TREE_TEST_DIST || 'dist');
const oldBytes = Buffer.from('previous regional fir fixture');
const oldVersion = createHash('sha256').update(oldBytes).digest('hex');
let preview: ChildProcess;
let previewPort: number;
let builtWorker: string;
let newVersion: string;
let newBytes: Buffer;

async function unusedPort(): Promise<number> {
  const server = createTcpServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

test.beforeAll(async () => {
  builtWorker = await readFile(resolve(distDir, 'sw.js'), 'utf8');
  newBytes = await readFile(resolve(distDir, `.${assetPath.replace('/NewDawn', '')}`));
  expect(newBytes.length, 'Build after the mature-fir asset has been integrated').toBeGreaterThan(0);
  const match = builtWorker.match(/const OPTIONAL_VERSION = ("[^"]+");/);
  expect(match, 'Build must emit the optional asset version').not.toBeNull();
  newVersion = JSON.parse(match![1]);
  expect(newVersion).toBe(createHash('sha256').update(newBytes).digest('hex'));
  expect(newVersion).not.toBe(oldVersion);

  previewPort = await unusedPort();
  preview = spawn(process.execPath, [
    resolve('node_modules/vite/bin/vite.js'), 'preview', '--host', '127.0.0.1',
    '--port', String(previewPort), '--strictPort', '--outDir', distDir,
  ], { stdio: 'ignore' });
  await expect.poll(async () => {
    if (preview.exitCode !== null) throw new Error(`Preview exited: ${preview.exitCode}`);
    try { return (await fetch(`http://127.0.0.1:${previewPort}/NewDawn/`)).status; }
    catch { return 0; }
  }, { timeout: 30000 }).toBe(200);
});

test.afterAll(async () => {
  if (preview && preview.exitCode === null) {
    const exited = new Promise<void>(resolve => preview.once('exit', () => resolve()));
    preview.kill('SIGTERM');
    await exited;
  }
});

async function startProxy() {
  const state = {
    revision: 'old', failCore: false, failNew: false, failOptionalStorage: false,
    disableLocks: false, legacyWorker: false, holdOld: false, oldRequests: 0, newRequests: 0,
  };
  const pendingOld: ServerResponse[] = [];
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://127.0.0.1');
    res.setHeader('Cache-Control', 'no-store');
    if (url.pathname === '/NewDawn/__cache_test__' || url.pathname === '/NewDawn/old/__cache_test__') {
      res.setHeader('Content-Type', 'text/html');
      res.end('<!doctype html><title>Offline cache fixture</title>');
      return;
    }
    if (url.pathname === '/NewDawn/sw.js' || url.pathname === '/NewDawn/old/sw.js') {
      const oldScope = url.pathname === '/NewDawn/old/sw.js';
      let source = state.revision === 'old' || oldScope
        ? builtWorker
          .replace(/const CACHE = "[^"]+";/, 'const CACHE = "new-dawn-shell-test-previous";')
          .replace(/const OPTIONAL_VERSION = "[^"]+";/, `const OPTIONAL_VERSION = "${oldVersion}";`)
        : builtWorker.replace(/const CACHE = "[^"]+";/, `const CACHE = "new-dawn-shell-test-${state.revision}";`);
      if (oldScope) source = source
        .replace(/const CORE = \[[^\n]*\];/, 'const CORE = [];')
        .replace("new URL('./assets/environment/trees/mature-fir.glb', self.registration.scope)",
          "new URL('/NewDawn/assets/environment/trees/mature-fir.glb', self.location.origin)");
      if ((state.revision === 'old' || oldScope) && state.legacyWorker) source = `
        const url = new URL('/NewDawn/assets/environment/trees/mature-fir.glb?v=${oldVersion}', self.location.origin).href;
        self.addEventListener('install', event => event.waitUntil(Promise.resolve()));
        self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
        self.addEventListener('message', event => { if (event.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
        self.addEventListener('fetch', event => {
          if (event.request.url !== url) return;
          event.respondWith((async () => {
            const cache = await caches.open('${legacyOptionalCache}');
            const cached = await cache.match(event.request);
            if (cached) return cached;
            const response = await fetch(event.request);
            if (response.status === 200) {
              await cache.put(url, response.clone());
              const keys = await cache.keys();
              await Promise.all(keys.filter(key => key.url !== url).map(key => cache.delete(key)));
            }
            return response;
          })());
        });
      `;
      if (state.disableLocks) source = `Object.defineProperty(self.navigator, 'locks', { value: undefined });\n${source}`;
      if (state.failOptionalStorage) source += `
        const realOpen = caches.open.bind(caches);
        caches.open = async name => {
          const cache = await realOpen(name);
          if (name === OPTIONAL_CACHE) {
            cache.match = async () => { throw new Error('test read failure'); };
            cache.put = async () => { throw new Error('test write failure'); };
          }
          return cache;
        };
      `;
      res.setHeader('Content-Type', 'text/javascript');
      res.end(source);
      return;
    }
    if (state.failCore && url.pathname === '/NewDawn/icon-192.png') {
      res.writeHead(503).end('unavailable');
      return;
    }
    if (url.pathname === assetPath) {
      if (url.searchParams.get('v') === oldVersion) {
        state.oldRequests++;
        res.setHeader('Content-Type', 'model/gltf-binary');
        if (state.holdOld) pendingOld.push(res);
        else res.end(oldBytes);
        return;
      }
      if (url.searchParams.get('v') === newVersion) {
        state.newRequests++;
        if (state.failNew) {
          res.writeHead(503).end('unavailable');
          return;
        }
      }
    }
    const upstream = httpRequest({
      hostname: '127.0.0.1', port: previewPort, path: req.url, method: req.method,
      headers: { ...req.headers, host: `127.0.0.1:${previewPort}` },
    }, response => {
      res.writeHead(response.statusCode!, { ...response.headers, 'cache-control': 'no-store' });
      response.pipe(res);
    });
    res.on('close', () => { if (!res.writableFinished) upstream.destroy(); });
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.pipe(upstream);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  return {
    state, origin: `http://127.0.0.1:${port}`,
    releaseOld: () => { for (const response of pendingOld.splice(0)) response.end(oldBytes); },
    close: () => new Promise<void>((resolve, reject) => {
      server.close(error => error ? reject(error) : resolve());
      server.closeAllConnections();
    }),
  };
}

async function install(page: Page, origin: string, scope = '/NewDawn/') {
  await page.goto(`${origin}${scope}__cache_test__`);
  await page.evaluate(async scope => {
    await navigator.serviceWorker.register(`${scope}sw.js`, { updateViaCache: 'none' });
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
    }
  }, scope);
}

async function update(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const registration = (await navigator.serviceWorker.getRegistration('/NewDawn/'))!;
    const found = new Promise<ServiceWorker>(resolve => registration.addEventListener('updatefound', () => resolve(registration.installing!), { once: true }));
    const updating = registration.update();
    const worker = await found;
    await updating.catch(() => undefined);
    if (worker.state !== 'installed' && worker.state !== 'redundant') {
      await new Promise<void>(resolve => worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' || worker.state === 'redundant') resolve();
      }));
    }
    return worker.state;
  });
}

async function activateWaiting(page: Page) {
  await page.evaluate(async () => {
    const registration = (await navigator.serviceWorker.getRegistration('/NewDawn/'))!;
    const waiting = registration.waiting;
    if (!waiting) throw new Error('Expected a waiting worker');
    const changed = new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
    waiting.postMessage({ type: 'SKIP_WAITING' });
    await changed;
  });
  await expect.poll(() => page.evaluate(async () =>
    (await navigator.serviceWorker.getRegistration('/NewDawn/'))?.active?.state)).toBe('activated');
}

async function fetchAsset(page: Page, version: string) {
  return page.evaluate(async ({ assetPath, version }) => {
    try {
      const response = await fetch(`${assetPath}?v=${version}`, { cache: 'no-store' });
      const bytes = await response.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return { status: response.status, hash: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('') };
    } catch { return { status: 0, hash: '' }; }
  }, { assetPath, version });
}

async function optionalKeys(page: Page) {
  return page.evaluate(async name => {
    if (!(await caches.has(name))) return [];
    return (await (await caches.open(name)).keys()).map(key => key.url);
  }, optionalCache);
}

async function savedFixture(page: Page) {
  return page.evaluate(() => new Promise<string>((resolve, reject) => {
    const request = indexedDB.open('optional-tree-test-save');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const get = request.result.transaction('saves').objectStore('saves').get('slot');
      get.onsuccess = () => { request.result.close(); resolve(get.result); };
      get.onerror = () => reject(get.error);
    };
  }));
}

test('optional fir is demand-cached, versioned and survives safe worker upgrades', async ({ page, context }) => {
  test.setTimeout(180000);
  const proxy = await startProxy();
  try {
    await install(page, proxy.origin);
    const initial = await page.evaluate(async () => {
      const names = await caches.keys();
      const entries = (await Promise.all(names.map(async name => (await (await caches.open(name)).keys()).map(key => key.url)))).flat();
      return { names, entries };
    });
    expect(initial.entries.some(url => new URL(url).pathname === assetPath)).toBe(false);
    for (const [directory, include] of [
      ['environment/trees', (name: string) => name.endsWith('.glb') && name !== 'mature-fir.glb'],
      ['environment/ground', (name: string) => name.endsWith('.glb')],
      ['environment/terrain', (name: string) => /^terrain_(color|surface)_atlas\.jpg$/.test(name)],
      ['characters/quaternius', (name: string) => /\.(gltf|glb|bin|png)$/.test(name)],
    ] as const) {
      const files = (await readdir(resolve(distDir, 'assets', directory))).filter(include);
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        expect(initial.entries).toContain(`${proxy.origin}/NewDawn/assets/${directory}/${file}`);
      }
    }
    expect(proxy.state.oldRequests + proxy.state.newRequests).toBe(0);

    // These are isolated test-origin data, not the developer's browser profile.
    await page.evaluate(async () => {
      await (await caches.open('new-dawn-v1')).put('/NewDawn/legacy-test', new Response('legacy'));
      await (await caches.open('unrelated-test-cache')).put('/NewDawn/unrelated-test', new Response('keep'));
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('optional-tree-test-save', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('saves');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const transaction = request.result.transaction('saves', 'readwrite');
          transaction.objectStore('saves').put('keep', 'slot');
          transaction.oncomplete = () => { request.result.close(); resolve(); };
          transaction.onerror = () => reject(transaction.error);
        };
      });
    });
    expect(await fetchAsset(page, oldVersion)).toEqual({ status: 200, hash: oldVersion });
    expect(proxy.state.oldRequests).toBe(1);
    expect(await optionalKeys(page)).toEqual([`${proxy.origin}${assetPath}?v=${oldVersion}`]);

    proxy.state.revision = 'failed-install';
    proxy.state.failCore = true;
    expect(await update(page)).toBe('redundant');
    expect(await optionalKeys(page)).toEqual([`${proxy.origin}${assetPath}?v=${oldVersion}`]);
    expect(await page.evaluate(() => caches.has('new-dawn-shell-test-previous'))).toBe(true);
    expect(await page.evaluate(() => caches.has('new-dawn-v1'))).toBe(true);
    expect(await page.evaluate(() => caches.has('unrelated-test-cache'))).toBe(true);
    expect(await savedFixture(page)).toBe('keep');
    await context.setOffline(true);
    expect(await page.evaluate(async () => (await fetch('/NewDawn/index.html')).status)).toBe(200);
    expect(await fetchAsset(page, oldVersion)).toEqual({ status: 200, hash: oldVersion });
    await context.setOffline(false);

    proxy.state.failCore = false;
    proxy.state.revision = 'successful-install';
    expect(await update(page)).toBe('installed');
    expect(await page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration('/NewDawn/'))?.waiting))).toBe(true);
    expect(await page.evaluate(() => caches.has('new-dawn-shell-test-previous'))).toBe(true);
    expect(await page.evaluate(() => caches.has('new-dawn-v1'))).toBe(true);
    await activateWaiting(page);
    expect(await page.evaluate(() => caches.has('new-dawn-v1'))).toBe(false);
    expect(await page.evaluate(() => caches.has('new-dawn-shell-test-previous'))).toBe(false);
    expect(await page.evaluate(() => caches.has('new-dawn-shell-test-failed-install'))).toBe(false);
    expect(await page.evaluate(() => caches.has('new-dawn-shell-test-successful-install'))).toBe(true);
    expect(await page.evaluate(() => caches.has('unrelated-test-cache'))).toBe(true);
    expect(await optionalKeys(page)).toEqual([`${proxy.origin}${assetPath}?v=${oldVersion}`]);
    expect(await savedFixture(page)).toBe('keep');

    // A cached old version must never answer a request for the new version.
    await context.setOffline(true);
    expect((await fetchAsset(page, newVersion)).status).toBe(0);
    expect(await page.evaluate(async () => (await fetch('/NewDawn/index.html')).status)).toBe(200);
    await context.setOffline(false);
    proxy.state.failNew = true;
    expect((await fetchAsset(page, newVersion)).status).toBe(503);
    expect(await optionalKeys(page)).toEqual([`${proxy.origin}${assetPath}?v=${oldVersion}`]);

    proxy.state.failNew = false;
    expect(await fetchAsset(page, newVersion)).toEqual({ status: 200, hash: newVersion });
    expect(await optionalKeys(page)).toEqual([`${proxy.origin}${assetPath}?v=${newVersion}`]);
    const requestsAfterFill = proxy.state.newRequests;

    // A further shell revision with unchanged content reuses the same cache entry.
    proxy.state.revision = 'unchanged-asset';
    expect(await update(page)).toBe('installed');
    await activateWaiting(page);
    expect(await page.evaluate(() => caches.has('new-dawn-shell-test-successful-install'))).toBe(false);
    expect(await page.evaluate(() => caches.has('new-dawn-shell-test-unchanged-asset'))).toBe(true);
    expect(await savedFixture(page)).toBe('keep');
    await context.setOffline(true);
    expect(await fetchAsset(page, newVersion)).toEqual({ status: 200, hash: newVersion });
    expect((await fetchAsset(page, oldVersion)).status).toBe(0);
    expect(proxy.state.newRequests).toBe(requestsAfterFill);
    expect(await optionalKeys(page)).toEqual([`${proxy.origin}${assetPath}?v=${newVersion}`]);
    await page.goto(`${proxy.origin}/NewDawn/`, { waitUntil: 'domcontentloaded' });
    expect(await fetchAsset(page, newVersion)).toEqual({ status: 200, hash: newVersion });
  } finally {
    await context.setOffline(false);
    await proxy.close();
  }
});

test('an uncached offline request fails without creating an optional entry', async ({ page, context }) => {
  test.setTimeout(120000);
  const proxy = await startProxy();
  try {
    proxy.state.revision = 'current';
    await install(page, proxy.origin);
    // Similar URLs and authenticated/range requests must not populate the cache.
    const bypass = await page.evaluate(async ({ assetPath, newVersion }) => {
      const responses = await Promise.all([
        fetch(assetPath),
        fetch(`${assetPath}?v=${newVersion}&extra=1`),
        fetch(`${assetPath}?v=${newVersion}`, { headers: { Authorization: 'test' } }),
        fetch(`${assetPath}?v=${newVersion}`, { headers: { Range: 'bytes=0-15' } }),
      ]);
      return Promise.all(responses.map(async response => {
        // Fetch resolves at headers; drain each body before going offline or closing the proxy.
        const reader = response.body?.getReader();
        if (reader) while (!(await reader.read()).done) { /* discard */ }
        return response.status;
      }));
    }, { assetPath, newVersion });
    expect(bypass.every(status => status >= 200 && status < 300)).toBe(true);
    expect(await optionalKeys(page)).toEqual([]);
    await context.setOffline(true);
    expect((await fetchAsset(page, newVersion)).status).toBe(0);
    expect(await optionalKeys(page)).toEqual([]);
    await context.setOffline(false);
    proxy.state.failNew = true;
    expect((await fetchAsset(page, newVersion)).status).toBe(503);
    expect(await optionalKeys(page)).toEqual([]);
  } finally {
    await context.setOffline(false);
    await proxy.close();
  }
});

test('cache read and write failures warn but do not discard a successful download', async ({ page, context }) => {
  test.setTimeout(120000);
  const proxy = await startProxy();
  const warnings: string[] = [];
  context.on('serviceworker', worker => worker.on('console', message => {
    if (message.type() === 'warning') warnings.push(message.text());
  }));
  try {
    proxy.state.revision = 'storage-errors';
    proxy.state.failOptionalStorage = true;
    await install(page, proxy.origin);
    expect(await fetchAsset(page, newVersion)).toEqual({ status: 200, hash: newVersion });
    expect(await optionalKeys(page)).toEqual([]);
    await expect.poll(() => warnings.some(message => message.includes('Optional fir cache read failed'))).toBe(true);
    await expect.poll(() => warnings.some(message => message.includes('Optional fir cache write or cleanup failed'))).toBe(true);
  } finally {
    await proxy.close();
  }
});

test('a late redundant worker cannot evict the active fir without Web Locks', async ({ page, context }) => {
  test.setTimeout(120000);
  for (const legacyWorker of [false, true]) {
    const proxy = await startProxy();
    const newPage = await context.newPage();
    try {
      proxy.state.disableLocks = true;
      proxy.state.legacyWorker = legacyWorker;
      proxy.state.holdOld = true;
      // Separate scopes let Chromium keep the old fetch alive while a new worker
      // activates; both workers use the same origin, asset URL and CacheStorage.
      await install(page, proxy.origin, '/NewDawn/old/');
      if (legacyWorker) {
        // A pre-upgrade cache must still be reusable after moving to the isolated namespace.
        await page.evaluate(async ({ assetPath, newVersion, legacyOptionalCache }) => {
          const url = `${assetPath}?v=${newVersion}`;
          const response = await fetch(url);
          await (await caches.open(legacyOptionalCache)).put(url, response);
        }, { assetPath, newVersion, legacyOptionalCache });
      }
      const oldFetch = fetchAsset(page, oldVersion);
      await expect.poll(() => proxy.state.oldRequests).toBe(1);
      proxy.state.revision = 'race-upgrade';
      await install(newPage, proxy.origin);
      const requestsBeforeNewFetch = proxy.state.newRequests;
      if (legacyWorker) {
        expect(await optionalKeys(newPage)).toEqual([`${proxy.origin}${assetPath}?v=${newVersion}`]);
      }
      expect(await fetchAsset(newPage, newVersion)).toEqual({ status: 200, hash: newVersion });
      if (legacyWorker) expect(proxy.state.newRequests).toBe(requestsBeforeNewFetch);
      expect(await optionalKeys(newPage)).toEqual([`${proxy.origin}${assetPath}?v=${newVersion}`]);
      if (!legacyWorker) {
        const oldWorker = context.serviceWorkers().find(worker => worker.url() === `${proxy.origin}/NewDawn/old/sw.js`);
        expect(oldWorker).toBeDefined();
        await oldWorker!.evaluate(() => {
          Object.defineProperty((globalThis as unknown as { serviceWorker: ServiceWorker }).serviceWorker,
            'state', { value: 'redundant', configurable: true });
        });
      }
      proxy.releaseOld();
      expect(await oldFetch).toEqual({ status: 200, hash: oldVersion });
      expect(await optionalKeys(newPage)).toEqual([`${proxy.origin}${assetPath}?v=${newVersion}`]);
      expect(await newPage.evaluate(name => caches.has(name), legacyOptionalCache)).toBe(false);
      // An interrupted earlier cleanup is repaired on a current-version cache hit.
      await newPage.evaluate(async ({ assetPath, oldVersion, optionalCache }) => {
        await (await caches.open(optionalCache)).put(`${assetPath}?v=${oldVersion}`, new Response('stale'));
      }, { assetPath, oldVersion, optionalCache });
      expect((await optionalKeys(newPage)).length).toBe(2);
      expect(await fetchAsset(newPage, newVersion)).toEqual({ status: 200, hash: newVersion });
      expect(await optionalKeys(newPage)).toEqual([`${proxy.origin}${assetPath}?v=${newVersion}`]);
      proxy.state.revision = 'race-upgrade-unchanged';
      expect(await update(newPage)).toBe('installed');
      await activateWaiting(newPage);
      await context.setOffline(true);
      expect(await fetchAsset(newPage, newVersion)).toEqual({ status: 200, hash: newVersion });
      expect((await fetchAsset(newPage, oldVersion)).status).toBe(0);
    } finally {
      proxy.releaseOld();
      await context.setOffline(false);
      await newPage.close();
      await proxy.close();
    }
  }
});
