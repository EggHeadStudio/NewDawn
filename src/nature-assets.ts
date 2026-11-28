import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { makeMidFoliage, type TreeDetail } from './vegetation-lod';
import { installTreeClearance } from './tree-occlusion';

export type NatureTreeFamily = 'deciduous' | 'conifer';
type NatureTreePrototype = NatureTreeFamily | 'pine' | 'mature' | 'mature-birch' | 'mature-pine' | 'mature-fir' | 'palm';
export type NatureTreeVariant = 'default' | 'pine' | 'mature' | 'mature-birch' | 'mature-pine' | 'mature-fir' | 'young-fir' | 'palm';
/** Young firs reuse the cached whorled fir at a sub-adult height instead of the sparse sapling. */
export const YOUNG_FIR_SCALE = 0.6;
type WindUniforms = { time: { value: number }; wind: { value: number } };

function foliageMaterial(material: THREE.Material) {
  return /leaf|leaves|twig/i.test(material.name);
}

export class NatureAssets {
  private readonly prototypes = new Map<NatureTreePrototype, THREE.Group>();
  private readonly midFoliage = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  private readonly loader = new GLTFLoader();
  private firStatus: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
  private palmStatus: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
  private disposed = false;
  readonly wind: WindUniforms = { time: { value: 0 }, wind: { value: 0 } };

  private readonly retryFir = () => {
    if (this.firStatus !== 'failed' || this.disposed) return;
    this.firStatus = 'idle';
    this.onReady('conifer');
  };

  private readonly retryPalm = () => {
    if (this.palmStatus !== 'failed' || this.disposed) return;
    this.palmStatus = 'idle';
    this.onReady('deciduous');
  };

  constructor(private readonly onReady: (family: NatureTreeFamily) => void, private readonly alphaCoverage = false) {
    window.addEventListener('online', this.retryFir);
    window.addEventListener('online', this.retryPalm);
    const assets: Array<[NatureTreePrototype, NatureTreeFamily, string, number]> = [
      ['conifer', 'conifer', 'fir-sapling.glb', 4],
      ['pine', 'conifer', 'pine-sapling.glb', 5],
      ['deciduous', 'deciduous', 'tree-small.glb', 4],
      ['mature', 'deciduous', 'mature-broadleaf.glb', 7],
      ['mature-birch', 'deciduous', 'mature-birch.glb', 7],
      ['mature-pine', 'conifer', 'mature-pine.glb', 9],
    ];
    for (const [prototype, family, name, heightTarget] of assets) {
      void this.load(prototype, family, name, heightTarget);
    }
  }

  private async load(prototype: NatureTreePrototype, family: NatureTreeFamily, name: string, heightTarget: number) {
    const url = `${import.meta.env.BASE_URL}assets/environment/trees/${name}${prototype === 'mature-fir' ? `?v=${__MATURE_FIR_ASSET_VERSION__}` : ''}`;
    try {
      const model = await this.loader.loadAsync(url);
      const scene = model.scene;
      if (this.disposed) { disposePrototype(scene); return; }
      scene.updateMatrixWorld(true);
      scene.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        if (materials.some(foliageMaterial) && !this.midFoliage.has(object.geometry)) {
          this.midFoliage.set(object.geometry, makeMidFoliage(object.geometry));
        }
      });
      const bounds = new THREE.Box3().setFromObject(scene);
      const height = bounds.max.y - bounds.min.y;
      if (!Number.isFinite(height) || height <= 0) {
        disposePrototype(scene);
        throw new Error(`Invalid tree bounds: ${url}`);
      }
      const center = bounds.getCenter(new THREE.Vector3());
      const wrapper = new THREE.Group();
      scene.position.set(-center.x, -bounds.min.y, -center.z);
      wrapper.scale.setScalar(heightTarget / height);
      wrapper.add(scene);
      this.prototypes.set(prototype, wrapper);
      if (prototype === 'mature-fir') this.firStatus = 'ready';
      if (prototype === 'palm') this.palmStatus = 'ready';
      this.onReady(family);
    } catch (error) {
      if (this.disposed) return;
      if (prototype === 'mature-fir') {
        this.firStatus = 'failed';
        console.warn(`Optional tree asset unavailable; using local fallback: ${url}`, error);
      } else if (prototype === 'palm') {
        this.palmStatus = 'failed';
        console.warn(`Regional tree asset unavailable; using local fallback: ${url}`, error);
      } else {
        console.error(`Failed to load local tree asset ${url}`, error);
      }
    }
  }

  create(family: NatureTreeFamily, phase: number, variant: NatureTreeVariant = 'default') {
    const fir = family === 'conifer' && (variant === 'mature-fir' || variant === 'young-fir');
    if (fir && this.firStatus === 'idle') {
      this.firStatus = 'loading';
      void this.load('mature-fir', 'conifer', 'mature-fir.glb', 9);
    }
    const palm = family === 'deciduous' && variant === 'palm';
    if (palm && this.palmStatus === 'idle') {
      this.palmStatus = 'loading';
      void this.load('palm', 'deciduous', 'vinish-fan-palm.glb', 7);
    }
    const key = palm ? 'palm' : (family === 'conifer' && variant === 'pine' ? 'pine'
      : family === 'conifer' && variant === 'mature-pine' ? 'mature-pine'
      : fir ? 'mature-fir'
      : family === 'deciduous' && variant === 'mature-birch' ? 'mature-birch'
      : family === 'deciduous' && variant === 'mature' ? 'mature' : family);
    const prototype = this.prototypes.get(key);
    if (!prototype) return undefined;
    const instance = prototype.clone(true);
    if (variant === 'young-fir') instance.scale.multiplyScalar(YOUNG_FIR_SCALE);
    instance.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.userData.natureSharedGeometry = true;
      const mid = this.midFoliage.get(object.geometry);
      if (mid) {
        object.userData.natureNearGeometry = object.geometry;
        object.userData.natureMidGeometry = mid;
      }
      const materials = (Array.isArray(object.material) ? object.material : [object.material]).map(original => {
        const material = original.clone();
        material.userData.natureOpacity = material.opacity;
        material.userData.natureTransparent = material.transparent;
        material.userData.natureDepthWrite = material.depthWrite;
        const foliage = foliageMaterial(material);
        if (foliage && material instanceof THREE.MeshStandardMaterial) {
          material.alphaToCoverage = this.alphaCoverage && material.alphaTest > 0 && !material.transparent;
          object.userData.foliageBase = `#${material.color.getHexString()}`;
          object.userData.foliageTier = 0;
          const positions = object.geometry.getAttribute('position');
          if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
          const bounds = object.geometry.boundingBox;
          if (!positions || !bounds) throw new Error('Tree foliage is missing geometry bounds');
          const bottom = bounds.min.y;
          const height = Math.max(0.01, bounds.max.y - bottom);
          material.onBeforeCompile = shader => {
            shader.uniforms.forestTime = this.wind.time;
            shader.uniforms.forestWind = this.wind.wind;
            shader.uniforms.forestPhase = { value: phase };
            shader.uniforms.forestBottom = { value: bottom };
            shader.uniforms.forestHeight = { value: height };
            shader.vertexShader = shader.vertexShader
              .replace('#include <common>', `#include <common>
                uniform float forestTime, forestWind, forestPhase, forestBottom, forestHeight;`)
              .replace('#include <begin_vertex>', `#include <begin_vertex>
                float bend = clamp((position.y - forestBottom) / forestHeight, 0.0, 1.0);
                bend *= bend;
                float gust = (0.004 + min(forestWind, 1.6) * 0.012) * forestHeight * bend;
                transformed.x += sin(forestTime * 1.1 + forestPhase + position.y * 1.7) * gust;
                transformed.z += cos(forestTime * 0.8 + forestPhase + position.x * 2.0) * gust * 0.5;`);
          };
          material.customProgramCacheKey = () => 'nature-foliage-wind-v2';
          const shadow = new THREE.MeshDepthMaterial({
            depthPacking: THREE.RGBADepthPacking,
            map: material.map,
            alphaMap: material.alphaMap,
            alphaTest: material.alphaTest,
            side: material.side,
          });
          shadow.onBeforeCompile = material.onBeforeCompile;
          shadow.customProgramCacheKey = () => 'nature-foliage-shadow-wind-v1';
          object.customDepthMaterial = shadow;
        }
        // A local cut through the narrow palm trunk leaves visibly disconnected pieces.
        if (material instanceof THREE.MeshStandardMaterial && material.name !== 'Palm_Trunk') installTreeClearance(material);
        return material;
      });
      object.material = Array.isArray(object.material) ? materials : materials[0];
      object.castShadow = true;
      object.receiveShadow = true;
    });
    return instance;
  }

  setDetail(instance: THREE.Object3D, detail: TreeDetail) {
    instance.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const geometry: unknown = detail === 'near' ? object.userData.natureNearGeometry : object.userData.natureMidGeometry;
      if (geometry instanceof THREE.BufferGeometry) object.geometry = geometry;
    });
  }

  dispose() {
    this.disposed = true;
    window.removeEventListener('online', this.retryFir);
    window.removeEventListener('online', this.retryPalm);
    this.midFoliage.forEach(geometry => geometry.dispose());
    this.midFoliage.clear();
    for (const prototype of this.prototypes.values()) disposePrototype(prototype);
    this.prototypes.clear();
  }
}

function disposePrototype(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    }
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
  textures.forEach(texture => texture.dispose());
}
