import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { makeMidFoliage, type TreeDetail } from './vegetation-lod';
import { FoliageClearance } from './tree-occlusion';

export type NatureTreeFamily = 'deciduous' | 'conifer';
type NatureTreePrototype = NatureTreeFamily | 'pine' | 'mature' | 'mature-pine';
export type NatureTreeVariant = 'default' | 'pine' | 'mature' | 'mature-pine';
type WindUniforms = { time: { value: number }; wind: { value: number } };

export class NatureAssets {
  private readonly prototypes = new Map<NatureTreePrototype, THREE.Group>();
  private readonly midFoliage = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  private disposed = false;
  readonly wind: WindUniforms = { time: { value: 0 }, wind: { value: 0 } };

  constructor(onReady: (family: NatureTreeFamily) => void, private readonly alphaCoverage = false) {
    const loader = new GLTFLoader();
    const assets: Array<[NatureTreePrototype, NatureTreeFamily, string, number]> = [
      ['conifer', 'conifer', 'fir-sapling.glb', 4],
      ['pine', 'conifer', 'pine-sapling.glb', 5],
      ['deciduous', 'deciduous', 'tree-small.glb', 4],
      ['mature', 'deciduous', 'mature-broadleaf.glb', 7],
      ['mature-pine', 'conifer', 'mature-pine.glb', 9],
    ];
    for (const [prototype, family, name, heightTarget] of assets) {
      const url = `${import.meta.env.BASE_URL}assets/environment/trees/${name}`;
      void loader.loadAsync(url).then(model => {
        const scene = model.scene;
        if (this.disposed) { disposePrototype(scene); return; }
        scene.updateMatrixWorld(true);
        scene.traverse(object => {
          if (!(object instanceof THREE.Mesh)) return;
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          if (materials.some(material => /leaves|twig/i.test(material.name)) && !this.midFoliage.has(object.geometry)) {
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
        onReady(family);
      }).catch(error => {
        console.error(`Failed to load local tree asset ${url}`, error);
      });
    }
  }

  create(family: NatureTreeFamily, phase: number, variant: NatureTreeVariant = 'default') {
    const key = family === 'conifer' && variant === 'pine' ? 'pine'
      : family === 'conifer' && variant === 'mature-pine' ? 'mature-pine'
      : family === 'deciduous' && variant === 'mature' ? 'mature' : family;
    const prototype = this.prototypes.get(key);
    if (!prototype) return undefined;
    const instance = prototype.clone(true);
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
        const foliage = /leaves|twig/i.test(material.name);
        if (foliage && material instanceof THREE.MeshStandardMaterial) {
          material.alphaToCoverage = this.alphaCoverage && material.alphaTest > 0 && !material.transparent;
          const clearance = new FoliageClearance();
          material.userData.foliageClearance = clearance;
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
            shader.uniforms.forestClearanceCamera = clearance.camera;
            shader.uniforms.forestClearanceTarget = clearance.target;
            shader.uniforms.forestClearanceAmount = clearance.amount;
            shader.vertexShader = shader.vertexShader
              .replace('#include <common>', `#include <common>
                uniform float forestTime, forestWind, forestPhase, forestBottom, forestHeight;
                varying vec3 forestWorldPosition;`)
              .replace('#include <begin_vertex>', `#include <begin_vertex>
                float bend = clamp((position.y - forestBottom) / forestHeight, 0.0, 1.0);
                bend *= bend;
                float gust = (0.004 + min(forestWind, 1.6) * 0.012) * forestHeight * bend;
                transformed.x += sin(forestTime * 1.1 + forestPhase + position.y * 1.7) * gust;
                transformed.z += cos(forestTime * 0.8 + forestPhase + position.x * 2.0) * gust * 0.5;`)
              .replace('#include <project_vertex>', `#include <project_vertex>
                forestWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
            shader.fragmentShader = shader.fragmentShader
              .replace('#include <common>', `#include <common>
                varying vec3 forestWorldPosition;
                uniform vec3 forestClearanceCamera, forestClearanceTarget;
                uniform float forestClearanceAmount;`)
              .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
                if (forestClearanceAmount > 0.001) {
                  vec3 sight = forestClearanceTarget - forestClearanceCamera;
                  float along = dot(forestWorldPosition - forestClearanceCamera, sight) / max(dot(sight, sight), 0.001);
                  if (along > 0.0 && along < 1.0) {
                    float distanceToSight = length(forestWorldPosition - (forestClearanceCamera + sight * along));
                    float radius = 1.1 * forestClearanceAmount;
                    float edge = 1.0 - smoothstep(max(0.0, radius - 0.12), radius, distanceToSight);
                    float noise = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
                    if (noise < edge) discard;
                  }
                }`);
          };
          material.customProgramCacheKey = () => 'nature-foliage-wind-clearance-v1';
        }
        return material;
      });
      object.material = Array.isArray(object.material) ? materials : materials[0];
      object.castShadow = !materials.some(material => /leaves|twig/i.test(material.name));
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
