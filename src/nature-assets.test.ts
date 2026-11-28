import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NatureAssets } from './nature-assets';

const loaderState = vi.hoisted(() => ({ urls: [] as string[], failPalm: false }));

vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    async loadAsync(url: string) {
      loaderState.urls.push(url);
      if (url.includes('vinish-fan-palm.glb') && loaderState.failPalm) throw new Error('Palm unavailable');
      const scene = new THREE.Group();
      const map = new THREE.DataTexture(new Uint8Array([
        255, 255, 255, 255, 0, 0, 0, 0,
      ]), 2, 1);
      const palm = url.includes('vinish-fan-palm.glb');
      scene.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
        new THREE.MeshStandardMaterial({ name: palm ? 'Fan_Leaf' : 'test_twig', map, alphaTest: 0.5, side: THREE.DoubleSide })));
      if (palm) scene.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 2, 0.2),
        new THREE.MeshStandardMaterial({ name: 'Palm_Trunk' })));
      return { scene };
    }
  },
}));

afterEach(() => {
  loaderState.urls.length = 0;
  loaderState.failPalm = false;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function disposeInstance(root: THREE.Object3D) {
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
    object.customDepthMaterial?.dispose();
  });
}

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

  it('loads palms only on demand and keeps leaf LOD, wind shadows and shared geometry', async () => {
    vi.stubGlobal('window', new EventTarget());
    const assets = new NatureAssets(() => {}, true);
    let first: THREE.Group | undefined;
    let second: THREE.Group | undefined;
    try {
      expect(loaderState.urls.some(url => url.includes('vinish-fan-palm.glb'))).toBe(false);
      expect(assets.create('deciduous', 0, 'palm')).toBeUndefined();
      await vi.waitFor(() => {
        first = assets.create('deciduous', 0, 'palm');
        expect(first).toBeDefined();
      });
      second = assets.create('deciduous', 1, 'palm');
      expect(second).toBeDefined();
      const meshes = (root: THREE.Object3D) => {
        const found: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = [];
        root.traverse(object => {
          if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshStandardMaterial) found.push(object);
        });
        return found;
      };
      const leaf = meshes(first!).find(mesh => mesh.material.name === 'Fan_Leaf')!;
      const trunk = meshes(first!).find(mesh => mesh.material.name === 'Palm_Trunk')!;
      const otherLeaf = meshes(second!).find(mesh => mesh.material.name === 'Fan_Leaf')!;
      expect(leaf.geometry).toBe(otherLeaf.geometry);
      expect(leaf.customDepthMaterial).toBeInstanceOf(THREE.MeshDepthMaterial);
      expect(leaf.material.alphaToCoverage).toBe(true);
      expect(leaf.material.userData.treeClearance).toBeDefined();
      expect(trunk.material.userData.treeClearance).toBeUndefined();
      const near = leaf.geometry;
      assets.setDetail(first!, 'mid');
      expect(leaf.geometry).not.toBe(near);
      expect(otherLeaf.geometry).toBe(near);
      assets.setDetail(first!, 'near');
      expect(leaf.geometry).toBe(near);
      expect(loaderState.urls.filter(url => url.includes('vinish-fan-palm.glb'))).toHaveLength(1);
    } finally {
      if (first) disposeInstance(first);
      if (second) disposeInstance(second);
      assets.dispose();
    }
  });

  it('keeps the palm fallback after a failed request and retries once online', async () => {
    const target = new EventTarget();
    vi.stubGlobal('window', target);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    loaderState.failPalm = true;
    const assets = new NatureAssets(() => {}, false);
    let tree: THREE.Group | undefined;
    try {
      expect(assets.create('deciduous', 0, 'palm')).toBeUndefined();
      await vi.waitFor(() => expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('using local fallback'), expect.any(Error)));
      expect(assets.create('deciduous', 0, 'palm')).toBeUndefined();
      expect(loaderState.urls.filter(url => url.includes('vinish-fan-palm.glb'))).toHaveLength(1);
      loaderState.failPalm = false;
      target.dispatchEvent(new Event('online'));
      expect(assets.create('deciduous', 0, 'palm')).toBeUndefined();
      await vi.waitFor(() => {
        tree = assets.create('deciduous', 0, 'palm');
        expect(tree).toBeDefined();
      });
      expect(loaderState.urls.filter(url => url.includes('vinish-fan-palm.glb'))).toHaveLength(2);
    } finally {
      if (tree) disposeInstance(tree);
      assets.dispose();
    }
  });
});
