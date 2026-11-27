import { expect, test } from '@playwright/test';
import type { Points, PointsMaterial } from 'three';

test('snowflakes have soft round edges while rain keeps its existing shape', async ({ page }) => {
  await page.goto('./');
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error' && /shader|webglprogram/i.test(message.text())) errors.push(message.text());
  });
  const samples = await page.evaluate(async () => {
    const THREE = await import('/NewDawn/node_modules/three/build/three.module.js');
    const { Precipitation } = await import('/NewDawn/src/effects.ts');
    const { ShelterIndex } = await import('/NewDawn/src/shelter.ts');
    const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true });
    renderer.setSize(128, 128);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    const precipitation = new Precipitation(scene);
    const points = scene.children[0] as Points;
    const positions = points.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) positions.setXYZ(i, 1000, 0, -2);
    positions.setXYZ(0, 0, 0, -2);
    const material = points.material as PointsMaterial;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const context = canvas.getContext('2d')!;
    const sample = (weather: 'Snow' | 'Rain', shelter?: InstanceType<typeof ShelterIndex>) => {
      precipitation.update(weather, new THREE.Vector3(), 0, shelter);
      material.size = 1;
      renderer.render(scene, camera);
      context.drawImage(renderer.domElement, 0, 0);
      return {
        center: context.getImageData(64, 64, 1, 1).data[0],
        edge: context.getImageData(76, 64, 1, 1).data[0],
        corner: context.getImageData(76, 76, 1, 1).data[0],
      };
    };
    const shelter = new ShelterIndex();
    shelter.refresh([{ id: 'roof', kind: 'roof', x: 0, z: -2, y: 0, level: 0, rotation: 0, open: false }]);
    const result = [sample('Snow'), sample('Rain'), sample('Snow'), sample('Snow', shelter)];
    shelter.refresh([]);
    result.push(sample('Snow', shelter));
    points.geometry.dispose();
    material.dispose();
    renderer.dispose();
    return result;
  });
  for (const snow of [samples[0], samples[2]]) {
    expect(snow.center).toBeGreaterThan(150);
    expect(snow.edge).toBeGreaterThan(0);
    expect(snow.edge).toBeLessThan(snow.center);
    expect(snow.corner).toBeLessThan(3);
  }
  expect(samples[1].corner).toBeGreaterThan(150);
  expect(samples[3].center).toBeLessThan(3);
  expect(samples[4].center).toBeGreaterThan(150);
  expect(errors).toEqual([]);
});
