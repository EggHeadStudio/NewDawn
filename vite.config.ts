import { defineConfig, type Plugin } from 'vite';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const version = `0.1.0+${Date.now().toString(36)}`;

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
        .filter(name => name.endsWith('.glb'))
        .map(name => `./assets/environment/trees/${name}`);
      const ground = readdirSync(resolve('public/assets/environment/ground'))
        .filter(name => name.endsWith('.glb'))
        .map(name => `./assets/environment/ground/${name}`);
      const core = ['./', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png', ...assets.map(name => `./${name}`), ...characters, ...terrain, ...trees, ...ground];
      const source = `
const CACHE = ${JSON.stringify(`new-dawn-shell-${version}`)};
const CORE = ${JSON.stringify(core)};
const URLS = new Set(CORE.map(path => new URL(path, self.registration.scope).href));
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
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || request.headers.has('Authorization')) return;
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
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [offlineShell()],
  build: {
    target: 'es2022',
  },
});
