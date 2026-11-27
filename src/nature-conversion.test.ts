import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

describe('bundled ground foliage', () => {
  for (const kind of ['grass', 'fern', 'shrub']) {
    it(`retains usable cutout alpha for ${kind}`, async () => {
      const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
      const document = await io.read(`public/assets/environment/ground/${kind}.glb`);
      const material = document.getRoot().listMaterials()[0];
      const image = material.getBaseColorTexture()?.getImage();
      expect(image).toBeDefined();
      const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect(material.getAlphaMode()).toBe('MASK');
      let opaque = 0;
      let transparent = 0;
      let paddedEdges = 0;
      for (let i = 0; i < info.width * info.height; i++) {
        const alpha = data[i * 4 + 3];
        if (alpha >= 128) opaque++;
        if (alpha === 0) transparent++;
        if (i % info.width > 0 && alpha === 0 && data[(i - 1) * 4 + 3] >= 128
          && data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2] > 30) paddedEdges++;
      }
      expect(opaque).toBeGreaterThan(0);
      expect(transparent).toBeGreaterThan(0);
      expect(paddedEdges).toBeGreaterThan(0);
    });

  }
});

describe('regional mature fir', () => {
  it('retains a bounded, alpha-masked foliage mesh', async () => {
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
    const document = await io.read('public/assets/environment/trees/mature-fir.glb');
    const material = document.getRoot().listMaterials().find(item => item.getName() === 'fir_tree_01_twig');
    expect(material?.getAlphaMode()).toBe('MASK');
    expect(material?.getDoubleSided()).toBe(true);
    const image = material?.getBaseColorTexture()?.getImage();
    expect(image).toBeDefined();
    const { data, info } = await sharp(image).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const alpha = Array.from({ length: info.width * info.height }, (_, i) => data[i * 4 + 3]);
    expect(alpha.some(value => value === 0)).toBe(true);
    expect(alpha.some(value => value === 255)).toBe(true);
    const foliage = document.getRoot().listMeshes().flatMap(mesh => mesh.listPrimitives())
      .find(primitive => primitive.getMaterial() === material);
    const triangles = (foliage?.getIndices()?.getCount() ?? 0) / 3;
    expect(triangles).toBeGreaterThan(0);
    expect(triangles).toBeLessThan(60000);
    const primitives = document.getRoot().listMeshes().flatMap(mesh => mesh.listPrimitives());
    const total = primitives.reduce((sum, primitive) => sum + (primitive.getIndices()?.getCount() ?? 0) / 3, 0);
    expect(total).toBeLessThan(45000);
    expect(total - triangles).toBeGreaterThan(0);
    expect(total - triangles).toBeLessThan(18000);
    expect(io.lastReadBytes).toBeGreaterThan(0);
    expect(io.lastReadBytes).toBeLessThan(4000000);
  });
});
