import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NatureAssets } from './nature-assets';

vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    async loadAsync() {
      const scene = new THREE.Group();
      const map = new THREE.DataTexture(new Uint8Array([
        255, 255, 255, 255, 0, 0, 0, 0,
      ]), 2, 1);
      scene.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
        new THREE.MeshStandardMaterial({ name: 'test_twig', map, alphaTest: 0.5, side: THREE.DoubleSide })));
      return { scene };
    }
  },
}));

afterEach(() => vi.unstubAllGlobals());

describe('authored canopy shadows', () => {
  it('uses the foliage cutout and wind in an independent opaque shadow pass', async () => {
    vi.stubGlobal('window', new EventTarget());
    let assets!: NatureAssets;
    await new Promise<void>(resolve => { assets = new NatureAssets(() => resolve(), true); });
    const tree = assets.create('conifer', 0)!;
    const foliage: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = [];
    tree.traverse(object => {
      if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial) foliage.push(object);
    });
    try {
      expect(foliage).toHaveLength(1);
      const leaf = foliage[0], shadow = leaf.customDepthMaterial;
      expect(leaf.castShadow).toBe(true);
      expect(shadow).toBeInstanceOf(THREE.MeshDepthMaterial);
      if (!(shadow instanceof THREE.MeshDepthMaterial)) throw new Error('Missing foliage depth material');
      expect(shadow.map).toBe(leaf.material.map);
      expect(shadow.alphaTest).toBe(leaf.material.alphaTest);
      expect(shadow.side).toBe(leaf.material.side);
      expect(shadow.depthPacking).toBe(THREE.RGBADepthPacking);
      expect(shadow.onBeforeCompile).not.toBe(THREE.Material.prototype.onBeforeCompile);
      expect(leaf.material.userData.treeClearance).toBeDefined();
      expect(shadow.userData.treeClearance).toBeUndefined();
      expect(leaf.material.transparent).toBe(false);
    } finally {
      foliage.forEach(leaf => { leaf.material.dispose(); leaf.customDepthMaterial?.dispose(); });
      assets.dispose();
    }
  });
});
