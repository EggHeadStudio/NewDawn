import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import type { Mesh, ShaderMaterial, SphereGeometry } from 'three';

test('below-horizon sky matches fully fogged geometry with and without tone mapping', async ({ page }) => {
  await page.goto('./');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /shader|webglprogram/i.test(message.text())) errors.push(message.text());
  });
  const differences = await page.evaluate(async () => {
    const THREE = await import('/NewDawn/node_modules/three/build/three.module.js');
    const { Sky } = await import('/NewDawn/src/sky.ts');
    const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true });
    renderer.setSize(64, 64);
    const scene = new THREE.Scene();
    const sky = new Sky(scene, renderer);
    sky.setQuality('low');
    const camera = new THREE.PerspectiveCamera(20, 1, 0.1, 200);
    camera.lookAt(0, -0.3, -1);
    const horizon = new THREE.Color('#416580');
    scene.fog = new THREE.Fog(horizon, 1, 2);
    const hidden = new THREE.Vector3(0, -1, 0);
    sky.update(camera.position, { sun: hidden, moon: hidden, illumination: 0 }, 1, 0, horizon, 'Clear', 0, 0);
    const material = (scene.children[0] as Mesh<SphereGeometry, ShaderMaterial>).material;
    material.uniforms.cloudiness.value = -2;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
    plane.position.set(0, -3, -10);
    plane.lookAt(camera.position);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const context = canvas.getContext('2d')!;
    const pixel = () => {
      renderer.render(scene, camera);
      context.drawImage(renderer.domElement, 0, 0);
      return [...context.getImageData(32, 32, 1, 1).data].slice(0, 3);
    };
    const values = [];
    for (const mode of [THREE.NoToneMapping, THREE.ACESFilmicToneMapping]) {
      renderer.toneMapping = mode;
      renderer.toneMappingExposure = 1.05;
      const background = pixel();
      scene.add(plane);
      const fogged = pixel();
      scene.remove(plane);
      values.push(background.map((value, i) => Math.abs(value - fogged[i])));
    }
    plane.geometry.dispose();
    plane.material.dispose();
    sky.dispose();
    renderer.dispose();
    return values;
  });
  for (const channels of differences) expect(Math.max(...channels)).toBeLessThanOrEqual(2);
  expect(errors).toEqual([]);
});

test('tone-mapped sun and moon remain visible near the horizon', async ({ page }) => {
  await page.goto('./');
  const differences = await page.evaluate(async () => {
    const THREE = await import('/NewDawn/node_modules/three/build/three.module.js');
    const { Sky } = await import('/NewDawn/src/sky.ts');
    const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true });
    renderer.setSize(256, 256);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    const scene = new THREE.Scene();
    const sky = new Sky(scene, renderer);
    sky.setQuality('low');
    const camera = new THREE.PerspectiveCamera(20, 1, 0.1, 200);
    const direction = new THREE.Vector3(0, 0.05, -1).normalize();
    const hidden = new THREE.Vector3(0, -1, 0);
    camera.lookAt(direction);
    const material = (scene.children[0] as Mesh<SphereGeometry, ShaderMaterial>).material;
    const shader = material.fragmentShader;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const context = canvas.getContext('2d')!;
    const pixel = () => {
      renderer.render(scene, camera);
      context.drawImage(renderer.domElement, 0, 0);
      return [...context.getImageData(128, 128, 1, 1).data].slice(0, 3);
    };
    const result = [];
    for (const body of ['sun', 'moon'] as const) {
      sky.update(camera.position, {
        sun: body === 'sun' ? direction : hidden, moon: body === 'moon' ? direction : hidden, illumination: 1,
      }, body === 'sun' ? 1 : 0, 0, new THREE.Color('#416580'), 'Clear', 0, 0);
      material.uniforms.cloudiness.value = -2;
      material.fragmentShader = shader;
      material.needsUpdate = true;
      const visible = pixel();
      const marker = body === 'sun' ? 'float sunAbove = ' : 'float moonDisc = ';
      if (!shader.includes(marker)) throw new Error('Celestial-disc shader no longer matches');
      material.fragmentShader = shader.replace(marker, `${marker}0.0 * `);
      material.needsUpdate = true;
      const absent = pixel();
      result.push(Math.max(...visible.map((value, i) => value - absent[i])));
    }
    sky.dispose();
    renderer.dispose();
    return result;
  });
  expect(differences[0]).toBeGreaterThan(10);
  expect(differences[1]).toBeGreaterThan(10);
});

test('lunar surface detail loads once, falls back on failure and releases owned textures', async ({ page }) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const THREE = await import('/NewDawn/node_modules/three/build/three.module.js');
    const { Sky } = await import('/NewDawn/src/sky.ts');
    const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true });
    renderer.setSize(256, 256);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(20, 1, 0.1, 200);
    const moon = new THREE.Vector3(0, 0.65, -0.76).normalize();
    camera.lookAt(moon);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const context = canvas.getContext('2d')!;
    const renderRange = (sky: InstanceType<typeof Sky>) => {
      sky.update(camera.position, {
        sun: moon.clone().negate(), moon, illumination: 1,
      }, 0, 0, new THREE.Color(0), 'Clear', 0, 0);
      const material = (scene.children[0] as Mesh<SphereGeometry, ShaderMaterial>).material;
      material.uniforms.cloudiness.value = -2;
      renderer.render(scene, camera);
      context.drawImage(renderer.domElement, 0, 0);
      const pixels = context.getImageData(121, 121, 14, 14).data;
      const values = [];
      for (let i = 0; i < pixels.length; i += 4) values.push(pixels[i]);
      return Math.max(...values) - Math.min(...values);
    };
    const sky = new Sky(scene, renderer);
    const plain = renderRange(sky);
    const loading = sky.loadMoonSurface();
    const sharedLoad = loading === sky.loadMoonSurface();
    await loading;
    const mapped = renderRange(sky);
    const loadedTextures = renderer.info.memory.textures;
    sky.setQuality('medium');
    renderRange(sky);
    const withCloudCache = renderer.info.memory.textures;
    sky.setQuality('low');
    const mappedLow = renderRange(sky);
    const lowTextures = renderer.info.memory.textures;
    sky.dispose();
    renderer.render(scene, camera);
    const disposedTextures = renderer.info.memory.textures;
    const late = new Sky(scene, renderer);
    const pending = late.loadMoonSurface();
    late.dispose();
    await pending;
    renderer.render(scene, camera);
    const lateTextures = renderer.info.memory.textures;
    renderer.dispose();
    return { plain, mapped, mappedLow, sharedLoad, loadedTextures, withCloudCache, lowTextures, disposedTextures, lateTextures };
  });
  expect(result.mapped).toBeGreaterThan(result.plain + 10);
  expect(result.sharedLoad).toBe(true);
  expect(result.loadedTextures).toBe(1);
  expect(result.withCloudCache).toBe(2);
  expect(result.lowTextures).toBe(1);
  expect(result.mappedLow).toBeGreaterThan(result.plain + 10);
  expect(result.disposedTextures).toBe(0);
  expect(result.lateTextures).toBe(0);

  await page.route('**/assets/environment/sky/moon.jpg', route => route.abort());
  const failed = await page.evaluate(async () => {
    const THREE = await import('/NewDawn/node_modules/three/build/three.module.js');
    const { Sky } = await import('/NewDawn/src/sky.ts');
    const renderer = new THREE.WebGLRenderer();
    const scene = new THREE.Scene();
    const sky = new Sky(scene, renderer);
    const rejected = await sky.loadMoonSurface().then(() => false, () => true);
    const material = (scene.children[0] as Mesh<SphereGeometry, ShaderMaterial>).material;
    const ready = material.uniforms.moonSurfaceReady.value;
    const texture = material.uniforms.moonSurface.value;
    sky.dispose();
    renderer.dispose();
    return { rejected, ready, texture };
  });
  expect(failed).toEqual({ rejected: true, ready: 0, texture: null });
});

test('volume clouds reuse a bounded cache and release it on Low', async ({ page }) => {
  await page.goto('./');
  const result = await page.evaluate(async () => {
    const THREE = await import('/NewDawn/node_modules/three/build/three.module.js');
    const { Sky } = await import('/NewDawn/src/sky.ts');
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(128, 128);
    renderer.info.autoReset = false;
    const scene = new THREE.Scene();
    const sky = new Sky(scene, renderer);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
    camera.lookAt(0, 1, 0);
    const celestial = {
      sun: new THREE.Vector3(0, 1, 0), moon: new THREE.Vector3(0, -1, 0), illumination: 0,
    };
    const horizon = new THREE.Color('#407ea8');
    const step = (dt: number) => {
      renderer.info.reset();
      sky.update(camera.position, celestial, 1, 0, horizon, 'Clear', 0, dt);
      renderer.render(scene, camera);
      return renderer.info.render.calls;
    };
    sky.setQuality('medium');
    const initial = step(60);
    const cadence = [step(0.05), step(0.05), step(0.05), step(0.05)];
    const catchup = step(60);
    const activeTextures = renderer.info.memory.textures;
    sky.setQuality('low');
    const low = step(60);
    const lowTextures = renderer.info.memory.textures;
    sky.setQuality('high');
    const resumed = step(0);
    const resumedTextures = renderer.info.memory.textures;
    sky.dispose();
    renderer.render(scene, camera);
    const disposed = { ...renderer.info.memory };
    renderer.dispose();
    return { initial, cadence, catchup, activeTextures, low, lowTextures, resumed, resumedTextures, disposed };
  });
  expect(result.initial).toBe(7);
  expect(result.cadence).toEqual([1, 1, 1, 7]);
  expect(result.catchup).toBe(7);
  expect(result.activeTextures).toBe(1);
  expect(result.low).toBe(1);
  expect(result.lowTextures).toBe(0);
  expect(result.resumed).toBe(7);
  expect(result.resumedTextures).toBe(1);
  expect(result.disposed).toEqual({ geometries: 0, textures: 0 });
});

test('cached storm cores occlude celestial discs without changing their lighting', async ({ page }) => {
  await page.goto('./');
  const samples = await page.evaluate(async () => {
    const THREE = await import('/NewDawn/node_modules/three/build/three.module.js');
    const { Sky } = await import('/NewDawn/src/sky.ts');
    const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true });
    renderer.setSize(256, 256);
    const scene = new THREE.Scene();
    const sky = new Sky(scene, renderer);
    sky.setQuality('medium');
    const camera = new THREE.PerspectiveCamera(90, 1, 0.1, 200);
    camera.lookAt(0, 1, 0);
    const hidden = new THREE.Vector3(0, -1, 0);
    const celestial = { sun: hidden, moon: hidden, illumination: 1 };
    const horizon = new THREE.Color('#407ea8');
    sky.update(camera.position, celestial, 1, 0, horizon, 'Storm', 0, 60);
    const material = (scene.children[0] as Mesh<SphereGeometry, ShaderMaterial>).material;
    if (!material.uniforms.cloudMap.value) throw new Error('Volume-cloud cache was not generated');
    const normalShader = material.fragmentShader;
    if (!normalShader.includes('float sunAbove = ') || !normalShader.includes('float moonDisc = ')) {
      throw new Error('Celestial-disc comparison shader no longer matches');
    }
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const context = canvas.getContext('2d')!;
    const render = () => {
      renderer.render(scene, camera);
      context.drawImage(renderer.domElement, 0, 0);
      return context.getImageData(0, 0, 256, 256).data;
    };
    material.fragmentShader = `uniform samplerCube cloudMap; varying vec3 skyDirection;
      void main() {
        float opacity = textureCube(cloudMap, normalize(skyDirection)).a;
        gl_FragColor = vec4(vec3(opacity), 1.0);
      }`;
    material.needsUpdate = true;
    const opacity = render();
    let point: { x: number; y: number } | undefined;
    for (let y = 16; y < 240 && !point; y += 4) {
      for (let x = 16; x < 240 && !point; x += 4) {
        let covered = true;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          if (opacity[((y + dy) * 256 + x + dx) * 4] !== 255) covered = false;
        }
        if (covered) point = { x, y };
      }
    }
    if (!point) throw new Error('No fully opaque storm core found');
    const direction = new THREE.Vector3((point.x + 0.5) / 128 - 1, 1 - (point.y + 0.5) / 128, 0.5)
      .unproject(camera).sub(camera.position).normalize();
    const offset = (point.y * 256 + point.x) * 4;
    const samples = [];
    for (const body of ['sun', 'moon'] as const) {
      sky.update(camera.position, { ...celestial, [body]: direction },
        body === 'sun' ? 1 : 0, 0, horizon, 'Storm', 0, 0.2);
      material.fragmentShader = normalShader;
      material.needsUpdate = true;
      const visibleDisc = render().slice(offset, offset + 3);
      // Suppress only the discs/glow, leaving the cached cloud illumination unchanged.
      material.fragmentShader = normalShader.replace('float sunAbove = ', 'float sunAbove = 0.0 * ')
        .replace('float moonDisc = ', 'float moonDisc = 0.0 * ');
      material.needsUpdate = true;
      const hiddenDisc = render().slice(offset, offset + 3);
      samples.push({ body, difference: [...visibleDisc].map((value, index) => Math.abs(value - hiddenDisc[index])) });
    }
    sky.dispose();
    renderer.dispose();
    return samples;
  });
  for (const sample of samples) expect(Math.max(...sample.difference), sample.body).toBeLessThanOrEqual(2);
});

test('a dense storm cloud fully occludes the sun and moon', async ({ page }) => {
  await page.goto('./');
  const samples = await page.evaluate(async () => {
    const THREE = await import('/NewDawn/node_modules/three/build/three.module.js');
    const { Sky } = await import('/NewDawn/src/sky.ts');
    const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true });
    renderer.setSize(256, 256);
    const scene = new THREE.Scene();
    const sky = new Sky(scene, renderer);
    const camera = new THREE.PerspectiveCamera(90, 1, 0.1, 200);
    camera.lookAt(0, 1, 0);
    const horizon = new THREE.Color('#407ea8');
    const hidden = new THREE.Vector3(0, -1, 0);
    const celestial = { sun: hidden, moon: hidden, illumination: 1 };
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const context = canvas.getContext('2d')!;
    const render = () => {
      renderer.render(scene, camera);
      context.drawImage(renderer.domElement, 0, 0);
      return context.getImageData(0, 0, 256, 256).data;
    };
    sky.update(camera.position, celestial, 1, 0, horizon, 'Storm', 0, 60);
    const clouds = render();
    let brightest = 0;
    for (let index = 0; index < clouds.length; index += 4) brightest = Math.max(brightest, clouds[index]);
    if (brightest < 170) throw new Error('No dense cloud found in the storm fixture');
    let point: { x: number; y: number } | undefined;
    for (let y = 16; y < 240 && !point; y += 4) {
      for (let x = 16; x < 240 && !point; x += 4) {
        let plateau = true;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          if (clouds[((y + dy) * 256 + x + dx) * 4] < brightest - 1) plateau = false;
        }
        if (plateau) point = { x, y };
      }
    }
    if (!point) throw new Error('No fully covered cloud patch found');
    const direction = new THREE.Vector3((point.x + 0.5) / 128 - 1, 1 - (point.y + 0.5) / 128, 0.5)
      .unproject(camera).sub(camera.position).normalize();
    const offset = (point.y * 256 + point.x) * 4;
    const samples = [];
    for (const body of ['sun', 'moon'] as const) {
      const daylight = body === 'sun' ? 1 : 0;
      sky.update(camera.position, celestial, daylight, 0, horizon, 'Storm', 0, 0);
      const before = render().slice(offset, offset + 3);
      sky.update(camera.position, { ...celestial, [body]: direction }, daylight, 0, horizon, 'Storm', 0, 0);
      const after = render().slice(offset, offset + 3);
      samples.push({ body, difference: [...after].map((value, index) => Math.abs(value - before[index])) });
    }
    sky.dispose();
    renderer.dispose();
    return samples;
  });
  for (const sample of samples) expect(Math.max(...sample.difference), sample.body).toBeLessThanOrEqual(2);
});

test('stars remain compact points when looking through the zenith', async ({ page }, testInfo) => {
  await page.goto('./');
  const views = await page.evaluate(async () => {
    const THREE = await import('/NewDawn/node_modules/three/build/three.module.js');
    const { Sky } = await import('/NewDawn/src/sky.ts');
    const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true });
    renderer.setSize(512, 512);
    const scene = new THREE.Scene();
    const sky = new Sky(scene, renderer);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
    const celestial = {
      sun: new THREE.Vector3(0, -1, 0), moon: new THREE.Vector3(0, -1, 0), illumination: 0,
    };
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 512;
    const context = canvas.getContext('2d')!;
    const views = [];
    const settings = (['low', 'medium'] as const).flatMap(quality =>
      [[0, 1, 0], [0.2, 1, -0.3], [0.6, 0.4, -0.8]].map(target => ({ quality, target })));
    for (const { quality, target } of settings) {
      sky.setQuality(quality);
      sky.update(camera.position, celestial, 0, 0, new THREE.Color(0), 'Clear', 0, 60);
      camera.lookAt(new THREE.Vector3(...target));
      renderer.render(scene, camera);
      context.drawImage(renderer.domElement, 0, 0);
      const pixels = context.getImageData(0, 0, 512, 512).data;
      const visited = new Uint8Array(512 * 512);
      const components: { width: number; height: number }[] = [];
      const bright = (index: number) => pixels[index * 4] + pixels[index * 4 + 1] + pixels[index * 4 + 2] > 400;
      for (let index = 0; index < visited.length; index++) {
        if (visited[index] || !bright(index)) continue;
        const queue = [index];
        visited[index] = 1;
        let minX = 512, minY = 512, maxX = 0, maxY = 0;
        for (let cursor = 0; cursor < queue.length; cursor++) {
          const current = queue[cursor], x = current % 512, y = Math.floor(current / 512);
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy, next = ny * 512 + nx;
            if (nx < 0 || nx >= 512 || ny < 0 || ny >= 512 || visited[next] || !bright(next)) continue;
            visited[next] = 1;
            queue.push(next);
          }
        }
        components.push({ width: maxX - minX + 1, height: maxY - minY + 1 });
      }
      const streaks = components.filter(({ width, height }) =>
        Math.max(width, height) >= 3 && Math.max(width, height) > 2 * Math.min(width, height));
      views.push({ quality, target, stars: components.length, streaks, image: canvas.toDataURL('image/png') });
    }
    sky.dispose();
    renderer.dispose();
    return views;
  });
  for (const [index, view] of views.entries()) {
    await testInfo.attach(`star-view-${index}`, {
      body: Buffer.from(view.image.split(',')[1], 'base64'), contentType: 'image/png',
    });
    expect(view.stars).toBeGreaterThan(10);
    expect(view.streaks).toEqual([]);
  }
});

for (const mapped of [false, true]) {
  test(`the ${mapped ? 'mapped' : 'plain'} moon is illuminated toward the sun at both quarter phases`, async ({ page }) => {
    await page.goto('./');
    const samples = await page.evaluate(async mapped => {
      const THREE = await import('/NewDawn/node_modules/three/build/three.module.js');
      const { Sky } = await import('/NewDawn/src/sky.ts');
      const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true });
      renderer.setSize(256, 256);
      const scene = new THREE.Scene();
      const sky = new Sky(scene, renderer);
      if (mapped) await sky.loadMoonSurface();
      const camera = new THREE.PerspectiveCamera(20, 1, 0.1, 200);
      const moon = new THREE.Vector3(0, 0.65, -0.76).normalize();
      camera.lookAt(moon);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const context = canvas.getContext('2d')!;

      function render(sun: InstanceType<typeof THREE.Vector3>, illumination: number) {
        sky.update(camera.position, { sun, moon, illumination }, 0, 0, new THREE.Color(0), 'Clear', 0, 0);
        renderer.render(scene, camera);
        context.drawImage(renderer.domElement, 0, 0);
        const pixels = context.getImageData(0, 0, 256, 256).data;
        const halves = [0, 0, 0, 0];
        let count = 0;
        for (let y = -5; y <= 5; y++) {
          for (let x = 4; x <= 8; x++) {
            for (const [side, dx] of [-x, x].entries()) {
              const index = ((128 + y) * 256 + 128 + dx) * 4;
              halves[side] += pixels[index] + pixels[index + 1] + pixels[index + 2];
            }
            for (const [side, dy] of [-x, x].entries()) {
              const index = ((128 + dy) * 256 + 128 + y) * 4;
              halves[side + 2] += pixels[index] + pixels[index + 1] + pixels[index + 2];
            }
            count++;
          }
        }
        return halves.map(value => value / count);
      }

      const right = render(new THREE.Vector3(1, 0, 0), 0.5);
      const left = render(new THREE.Vector3(-1, 0, 0), 0.5);
      const up = new THREE.Vector3(0, -moon.z, moon.y);
      const above = render(up, 0.5);
      const below = render(up.clone().negate(), 0.5);
      const full = render(new THREE.Vector3(1, 0, 0), 1);
      const dark = render(new THREE.Vector3(1, 0, 0), 0);
      sky.dispose();
      renderer.dispose();
      return { right, left, above, below, full, dark };
    }, mapped);

    expect(samples.right[1]).toBeGreaterThan(samples.right[0] + 100);
    expect(samples.left[0]).toBeGreaterThan(samples.left[1] + 100);
    expect(samples.above[2]).toBeGreaterThan(samples.above[3] + 100);
    expect(samples.below[3]).toBeGreaterThan(samples.below[2] + 100);
    for (const side of [0, 1]) {
      expect(samples.full[side]).toBeGreaterThan(samples.dark[side] + 100);
    }
  });
}

test('a moonless storm keeps the player area visible without removing the weather', async ({ page }, testInfo) => {
  const baseline = async (route: import('@playwright/test').Route) => {
    const response = await route.fetch();
    const body = await response.text();
    const needle = 'weather === "Storm" ? 0.75 : weather === "Cloudy" ? 0.85 : weather === "Rain" ? 0.8';
    if (!body.includes(needle)) throw new Error('Storm visibility baseline substitution did not match');
    await route.fulfill({ response, body: body.replace(needle,
      'weather === "Storm" ? 0.2 : weather === "Cloudy" ? 0.5 : weather === "Rain" ? 0.35') });
  };
  await page.route('**/src/environment-lighting.ts*', baseline);
  await page.route('**/src/main.ts*', async route => {
    const response = await route.fetch();
    const body = await response.text();
    const weather = /const weather = climate[\s\S]+?: weatherBase;/;
    if (!weather.test(body)) throw new Error('Storm weather substitution did not match');
    await route.fulfill({ response, body: body.replace(weather, 'const weather = "Storm";') });
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /shader|webglprogram/i.test(message.text())) errors.push(message.text());
  });
  await page.goto('./');
  await page.locator('#worldSeed').fill('1847');
  await page.locator('#newGame').click();
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.evaluate(async () => {
    const { terrainHeight } = await import('/NewDawn/src/world.ts');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('new-dawn', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const save = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const request = db.transaction('saves').objectStore('saves').get('primary');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    save.version = 11;
    delete save.planetPositions;
    save.player = { x: 0, y: terrainHeight(0, 0, Number(save.seed)), z: 0 };
    save.npc = { x: 50, z: 50 };
    save.vehicle = { x: 40, z: 40 };
    save.wildlife = [];
    save.calendar = { minute: 0, day: 1, speed: 0.5 };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('saves', 'readwrite');
      tx.objectStore('saves').put(save, 'primary');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    db.close();
  });
  const brightness: number[] = [];
  for (const withFill of [false, true]) {
    if (withFill) await page.unroute('**/src/environment-lighting.ts*', baseline);
    await page.reload();
    await page.locator('#continueGame').click();
    await expect(page.locator('#menu')).not.toHaveClass(/active/);
    await expect(page.locator('#seasonText')).toContainText('DAY 1 · STORM');
    await expect.poll(async () => page.evaluate(() => (window as Window & {
      __newDawnState: () => { terrainReady: boolean }
    }).__newDawnState().terrainReady), { timeout: 30000 }).toBe(true);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: testInfo.outputPath(withFill ? 'storm-after.png' : 'storm-before.png') });
    const image = await page.screenshot({ clip: { x: 590, y: 350, width: 100, height: 140 } });
    const stats = await sharp(image).stats();
    brightness.push(stats.channels.slice(0, 3).reduce((sum, channel) => sum + channel.mean, 0) / 3);
  }
  expect(brightness[1]).toBeGreaterThan(brightness[0] + 2);
  expect(errors).toEqual([]);
});

test('a clear moonlit night makes the gameplay foreground more readable than a moonless night', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('./');
  await page.locator('#newGame').click();
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  const brightness: number[] = [];
  for (const day of [1, 15]) {
    await page.evaluate(async day => {
      const { terrainHeight } = await import('/NewDawn/src/world.ts');
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('new-dawn', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const save = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const request = db.transaction('saves').objectStore('saves').get('primary');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      save.version = 11;
      delete save.planetPositions;
      save.player = { x: 0, y: terrainHeight(0, 0, Number(save.seed)), z: 0 };
      save.npc = { x: 50, z: 50 };
      save.vehicle = { x: 40, z: 40 };
      save.wildlife = [];
      save.calendar = { minute: 0, day, speed: 0.5 };
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('saves', 'readwrite');
        tx.objectStore('saves').put(save, 'primary');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    }, day);
    await page.reload();
    await page.locator('#continueGame').click();
    await expect(page.locator('#seasonText')).toContainText(`DAY ${day} · CLEAR`);
    await expect.poll(async () => page.evaluate(() => (window as Window & {
      __newDawnState: () => { terrainReady: boolean }
    }).__newDawnState().terrainReady), { timeout: 30000 }).toBe(true);
    await page.waitForTimeout(3000);
    const image = await page.screenshot({ clip: { x: 80, y: 350, width: 300, height: 230 } });
    const stats = await sharp(image).stats();
    brightness.push(stats.channels.slice(0, 3).reduce((sum, channel) => sum + channel.mean, 0) / 3);
  }
  expect(brightness[1]).toBeGreaterThan(brightness[0] + 5);
});

test('moonlit fill improves the player area without changing the saved scene', async ({ page }) => {
  const baseline = async (route: import('@playwright/test').Route) => {
    const response = await route.fetch();
    const body = await response.text();
    const needle = 'ambient.intensity, moonlit.hemisphere, 5, dt';
    if (!body.includes(needle)) throw new Error('Moonlit fill baseline substitution did not match');
    await route.fulfill({ response, body: body.replace(needle, 'ambient.intensity, lighting.hemisphere, 5, dt') });
  };
  await page.route('**/src/main.ts*', baseline);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('./');
  await page.locator('#newGame').click();
  await page.locator('#pauseButton').click();
  await page.locator('#saveGame').click();
  await expect(page.locator('#toast')).toHaveText('World saved');
  await page.evaluate(async () => {
    const { terrainHeight } = await import('/NewDawn/src/world.ts');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('new-dawn', 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const save = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const request = db.transaction('saves').objectStore('saves').get('primary');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    save.version = 11;
    delete save.planetPositions;
    save.player = { x: 0, y: terrainHeight(0, 0, Number(save.seed)), z: 0 };
    save.npc = { x: 50, z: 50 };
    save.vehicle = { x: 40, z: 40 };
    save.wildlife = [];
    save.calendar = { minute: 0, day: 15, speed: 0.5 };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('saves', 'readwrite');
      tx.objectStore('saves').put(save, 'primary');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  const brightness: number[] = [];
  for (const withFill of [false, true]) {
    if (withFill) await page.unroute('**/src/main.ts*', baseline);
    await page.reload();
    await page.locator('#continueGame').click();
    await expect(page.locator('#seasonText')).toContainText('DAY 15 · CLEAR');
    await expect.poll(async () => page.evaluate(() => (window as Window & {
      __newDawnState: () => { terrainReady: boolean }
    }).__newDawnState().terrainReady), { timeout: 30000 }).toBe(true);
    await page.waitForTimeout(3000);
    const image = await page.screenshot({ clip: { x: 590, y: 350, width: 100, height: 140 } });
    const stats = await sharp(image).stats();
    brightness.push(stats.channels.slice(0, 3).reduce((sum, channel) => sum + channel.mean, 0) / 3);
  }
  expect(brightness[1]).toBeGreaterThan(brightness[0] + 2);
});

