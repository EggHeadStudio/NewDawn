import { defineConfig, type Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const version = `0.1.0+${Date.now().toString(36)}`;
const matureFirPath = resolve('public/assets/environment/trees/mature-fir.glb');
const matureFirVersion = createHash('sha256').update(readFileSync(matureFirPath)).digest('hex');

function offlineShell(): Plugin {
  return {
    name: 'new-dawn-offline-shell',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle).filter(name => name === 'index.html' || name.startsWith('assets/'));
      const characters = readdirSync(resolve('public/assets/characters/quaternius'))
        .filter(name => /\.(gltf|glb|bin|png)$/.test(name))
        .map(name => `./assets/characters/quaternius/${name}`);
      const terrain = readdirSync(resolve('public/assets/environment/terrain'))
        .filter(name => /^terrain_(color|surface)_atlas\.jpg$/.test(name))
        .map(name => `./assets/environment/terrain/${name}`);
      const trees = readdirSync(resolve('public/assets/environment/trees'))
        .filter(name => name.endsWith('.glb') && name !== 'mature-fir.glb')
        .map(name => `./assets/environment/trees/${name}`);
      const ground = readdirSync(resolve('public/assets/environment/ground'))
        .filter(name => name.endsWith('.glb'))
        .map(name => `./assets/environment/ground/${name}`);
      const construction = readdirSync(resolve('public/assets/environment/construction'))
        .filter(name => /^weathered-wood-(color|normal)\.jpg$/.test(name))
        .map(name => `./assets/environment/construction/${name}`);
      const core = [
        './', './manifest.webmanifest', './icon-192.png', './icon-512.png',
        './icon-maskable-192.png', './icon-maskable-512.png', './apple-touch-icon.png',
        './favicon.ico', './favicon-16x16.png', './favicon-32x32.png',
        './assets/branding/newdawn-logo.png', './assets/environment/sky/moon.jpg',
        './assets/environment/sky/moon-LICENSE.txt',
        './assets/characters/equipment/hiking-backpack.glb',
        './assets/animals/sheep.glb',
        './assets/animals/mountain-hare.glb',
        './assets/animals/dairy-cow.glb',
        './assets/animals/hooded-crow.glb',
        './assets/animals/red-squirrel.glb', './assets/animals/red-squirrel-LICENSE.txt',
        './assets/animals/gray-wolf.glb', './assets/animals/gray-wolf-LICENSE.txt',
        './assets/animals/red-fox.glb',
        './assets/animals/roe-deer.glb',
        './assets/animals/moose.glb',
        './assets/animals/grizzly-bear.glb', './assets/animals/grizzly-bear-LICENSE.txt',
        './assets/animals/reindeer.glb',
        './assets/environment/trees/vinish-trees-LICENSE.txt',
        ...assets.map(name => `./${name}`), ...characters, ...terrain, ...trees, ...ground, ...construction,
      ];
      const source = `
const CACHE = ${JSON.stringify(`new-dawn-shell-${version}`)};
const CORE = ${JSON.stringify(core)};
const URLS = new Set(CORE.map(path => new URL(path, self.registration.scope).href));
// The v2 namespace isolates this cache from in-flight pre-lock workers.
const OPTIONAL_CACHE = 'new-dawn-optional-regional-trees-v2';
const LEGACY_OPTIONAL_CACHE = 'new-dawn-optional-regional-trees';
const OPTIONAL_VERSION = ${JSON.stringify(matureFirVersion)};
const OPTIONAL_PATH = new URL('./assets/environment/trees/mature-fir.glb', self.registration.scope);
const OPTIONAL_URL = new URL(OPTIONAL_PATH);
OPTIONAL_URL.searchParams.set('v', OPTIONAL_VERSION);
let optionalWrites = Promise.resolve();
// CacheStorage has no cross-worker transaction. Keep a separate IndexedDB
// transaction alive while mutating it; activation joins the same queue.
// This does not open or modify the game's save database.
function withOptionalLock(work) {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open('new-dawn-optional-cache-lock', 1);
    let abandoned = false;
    opening.onupgradeneeded = () => opening.result.createObjectStore('lock');
    opening.onerror = () => reject(opening.error);
    opening.onblocked = () => {
      abandoned = true;
      reject(new Error('Optional cache lock database is blocked'));
    };
    opening.onsuccess = () => {
      const db = opening.result;
      if (abandoned) { db.close(); return; }
      let tx;
      try { tx = db.transaction('lock', 'readwrite'); }
      catch (error) { db.close(); reject(error); return; }
      const store = tx.objectStore('lock');
      let keepAlive = true;
      let alive = true;
      let result;
      let failure;
      const pump = () => {
        if (!keepAlive) return;
        const request = store.get('lock');
        request.onsuccess = pump;
      };
      const first = store.get('lock');
      first.onsuccess = () => {
        pump();
        Promise.resolve().then(() => work(() => alive)).then(value => {
          result = value;
          keepAlive = false;
        }, error => {
          failure = error;
          keepAlive = false;
        });
      };
      tx.oncomplete = () => {
        alive = false;
        db.close();
        if (failure) reject(failure);
        else resolve(result);
      };
      tx.onabort = () => {
        alive = false;
        keepAlive = false;
        db.close();
        reject(tx.error || new Error('Optional cache lock aborted'));
      };
    };
  });
}
function isActiveWorker() {
  return self.serviceWorker?.state === 'activated';
}
function queueOptionalWork(work) {
  const write = optionalWrites.then(() => withOptionalLock(work));
  optionalWrites = write.catch(() => {});
  return write;
}
async function pruneOptional(cache, alive, activating = false) {
  const allowed = () => alive() && (isActiveWorker()
    || (activating && self.serviceWorker?.state === 'activating'));
  if (!allowed()) return;
  const keys = await cache.keys();
  for (const key of keys.filter(key => {
    const old = new URL(key.url);
    return old.origin === OPTIONAL_PATH.origin && old.pathname === OPTIONAL_PATH.pathname
      && old.href !== OPTIONAL_URL.href;
  })) {
    if (!allowed()) return;
    await cache.delete(key);
  }
  if (allowed()) await caches.delete(LEGACY_OPTIONAL_CACHE);
}
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => (key.startsWith('new-dawn-shell-') || key === 'new-dawn-v1') && key !== CACHE).map(key => caches.delete(key)));
    try {
      await withOptionalLock(async alive => {
        // Move an already-demanded matching asset before an older worker can
        // prune the legacy namespace. A missing version stays lazy.
        if (!alive() || !(await caches.has(LEGACY_OPTIONAL_CACHE))) return;
        const legacy = await (await caches.open(LEGACY_OPTIONAL_CACHE)).match(OPTIONAL_URL.href);
        if (!legacy || !alive()) return;
        const cache = await caches.open(OPTIONAL_CACHE);
        if (!(await cache.match(OPTIONAL_URL.href)) && alive()) await cache.put(OPTIONAL_URL.href, legacy);
        await pruneOptional(cache, alive, true);
      });
    }
    catch (error) { console.warn('Optional fir cache activation lock failed.', error); }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || request.headers.has('Authorization')) return;
  if (url.href === OPTIONAL_URL.href && !request.headers.has('Range')
      && !request.headers.has('If-None-Match') && !request.headers.has('If-Modified-Since')
      && !request.headers.has('If-Match') && !request.headers.has('If-Unmodified-Since')) {
    event.respondWith((async () => {
      let cache;
      let legacy;
      try {
        cache = await caches.open(OPTIONAL_CACHE);
        const cached = await cache.match(request);
        if (cached) {
          try { await queueOptionalWork(alive => pruneOptional(cache, alive)); }
          catch (error) { console.warn('Optional fir cache cleanup failed.', error); }
          return cached;
        }
        if (await caches.has(LEGACY_OPTIONAL_CACHE)) {
          legacy = await (await caches.open(LEGACY_OPTIONAL_CACHE)).match(request);
        }
      } catch (error) {
        console.warn('Optional fir cache read failed; using network.', error);
        // Cache storage can be unavailable or full; keep the network fallback usable.
      }
      const response = legacy || await fetch(request);
      if (cache && response.status === 200
          && (legacy || (response.type === 'basic' && !response.redirected && response.url === OPTIONAL_URL.href))) {
        try {
          // Finish the network stream before acquiring the cross-worker lock.
          const bytes = await response.clone().blob();
          const stored = new Response(bytes, { status: response.status, statusText: response.statusText, headers: response.headers });
          const store = async alive => {
            if (!alive() || !isActiveWorker()) return;
            // Use one canonical request key even if callers send different headers.
            await cache.put(OPTIONAL_URL.href, stored);
            // Retain the old version until the replacement was written successfully.
            await pruneOptional(cache, alive);
          };
          await queueOptionalWork(store);
        } catch (error) {
          console.warn('Optional fir cache write or cleanup failed.', error);
          // Do not turn a successful download into a failed visual load.
        }
      }
      return response;
    })());
    return;
  }
  if (request.mode === 'navigate' && url.href.startsWith(self.registration.scope)) {
    event.respondWith((async () => {
      const cached = await (await caches.open(CACHE)).match(new URL('./index.html', self.registration.scope).href, { ignoreVary: true });
      return cached || fetch(request);
    })());
    return;
  }
  if (URLS.has(url.href)) {
    event.respondWith((async () => {
      const cached = await (await caches.open(CACHE)).match(url.href, { ignoreVary: true });
      return cached || fetch(request);
    })());
  }
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  base: '/NewDawn/',
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __MATURE_FIR_ASSET_VERSION__: JSON.stringify(matureFirVersion),
  },
  plugins: [offlineShell()],
  build: {
    target: 'es2022',
  },
});
