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
