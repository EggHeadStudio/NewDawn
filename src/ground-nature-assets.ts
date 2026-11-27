import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { computeFullCoverBounds } from './vegetation-lod';

export type GroundAssetKind = 'stone' | 'grass' | 'fern' | 'shrub';
type WindUniforms = { time: { value: number }; wind: { value: number } };

export class GroundNatureAssets {
  private readonly geometries = new Map<GroundAssetKind, THREE.BufferGeometry[]>();
  private readonly materials = new Map<GroundAssetKind, THREE.MeshStandardMaterial>();
  private readonly berryGeometry = new THREE.SphereGeometry(0.022, 6, 4);
  private readonly berryMaterial = new THREE.MeshStandardMaterial({ color: '#852837', roughness: 0.7 });
  private shrubBerryCandidates: number[] = [];
  private disposed = false;

  constructor(private readonly wind: WindUniforms, onReady: (kind: GroundAssetKind) => void, alphaCoverage = false) {
    const loader = new GLTFLoader();
    const assets: Array<[GroundAssetKind, string]> = [['stone', 'rocks.glb'], ['grass', 'grass.glb'], ['fern', 'fern.glb'], ['shrub', 'shrub.glb']];
    for (const [kind, name] of assets) {
      const url = `${import.meta.env.BASE_URL}assets/environment/ground/${name}`;
      void loader.loadAsync(url).then(model => {
        const meshes: THREE.Mesh[] = [];
        model.scene.traverse(object => { if (object instanceof THREE.Mesh) meshes.push(object); });
        if (!meshes.length || !(meshes[0].material instanceof THREE.MeshStandardMaterial)) {
          disposeGroundModel(model.scene);
          throw new Error(`Missing ground asset geometry or material: ${url}`);
        }
        if (this.disposed) { disposeGroundModel(model.scene); return; }
        const material = meshes[0].material;
        if (kind !== 'stone') material.alphaToCoverage = alphaCoverage && material.alphaTest > 0 && !material.transparent;
        const normalized = meshes.map(mesh => {
          const geometry = mesh.geometry;
          geometry.computeBoundingBox();
          const bounds = geometry.boundingBox;
          if (!bounds) throw new Error(`Missing ground asset bounds: ${url}`);
          const size = bounds.getSize(new THREE.Vector3());
          const scale = kind === 'stone' ? 1 / Math.max(size.x, size.y, size.z)
            : (kind === 'grass' ? 0.5 : kind === 'shrub' ? 0.9 : 0.55) / size.y;
          if (!Number.isFinite(scale)) throw new Error(`Invalid ground asset bounds: ${url}`);
          const center = bounds.getCenter(new THREE.Vector3());
          geometry.translate(-center.x, -bounds.min.y, -center.z);
          geometry.scale(scale, scale, scale);
          if (kind === 'grass') geometry.scale(1.6, 1, 1.6);
          geometry.translate(0, -0.12, 0);
          geometry.computeBoundingBox();
          geometry.computeBoundingSphere();
          return geometry;
        });
        if (kind === 'shrub') {
          const positions = normalized[0].getAttribute('position');
          this.shrubBerryCandidates = [];
          for (let i = 0; i < positions.count; i++) {
            if (positions.getY(i) > 0.35) this.shrubBerryCandidates.push(i);
          }
          if (!this.shrubBerryCandidates.length) {
            disposeGroundModel(model.scene);
            throw new Error('Shrub has no upper foliage for berries');
          }
        }
        this.geometries.set(kind, normalized);
        this.materials.set(kind, material);
        onReady(kind);
      }).catch(error => console.error(`Failed to load local ground asset ${url}`, error));
    }
  }

  installStone(mesh: THREE.Mesh, variation: number, deposit = false) {
    const geometries = this.geometries.get('stone');
    const material = this.materials.get('stone');
    if (!geometries || !material || mesh.userData.natureGround) return false;
    mesh.geometry.dispose();
    for (const old of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) old.dispose();
    mesh.geometry = geometries[Math.floor(variation * geometries.length) % geometries.length];
    mesh.material = material;
    mesh.userData.natureSharedGeometry = true;
    mesh.userData.natureSharedMaterial = true;
    mesh.userData.natureGround = true;
    if (deposit) {
      mesh.position.y = 0.12;
      mesh.scale.set(1.4, 1, 1.25);
    } else {
      mesh.scale.setScalar(0.65 + variation * 0.65);
      mesh.rotation.y = variation * Math.PI * 2;
    }
    return true;
  }

  installCover(mesh: THREE.InstancedMesh, kind: 'grass' | 'fern') {
    const geometry = this.geometries.get(kind)?.[0];
    const source = this.materials.get(kind);
    if (!geometry || !source || mesh.userData.natureGround) return false;
    mesh.geometry.dispose();
    for (const old of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) old.dispose();
    const material = source.clone();
    material.onBeforeCompile = shader => {
      shader.uniforms.groundWindTime = this.wind.time;
      shader.uniforms.groundWindStrength = this.wind.wind;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          uniform float groundWindTime, groundWindStrength;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float sway = max(position.y + 0.12, 0.0) * min(groundWindStrength, 1.6) * 0.06;
          float phase = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.4;
          transformed.x += sin(groundWindTime * 1.4 + phase) * sway;`);
    };
    material.customProgramCacheKey = () => 'nature-ground-wind-v1';
    mesh.geometry = geometry;
    mesh.material = material;
    computeFullCoverBounds(mesh);
    mesh.userData.natureSharedGeometry = true;
    mesh.userData.natureGround = true;
    return true;
  }

  installBush(root: THREE.Object3D) {
    const geometry = this.geometries.get('shrub')?.[0];
    const material = this.materials.get('shrub');
    const old = root.children.find((child): child is THREE.Mesh =>
      child instanceof THREE.Mesh && child.userData.bushFoliage);
    if (!geometry || !material || !old || old.userData.natureGround) return false;
    const positions = geometry.getAttribute('position');
    const candidates = this.shrubBerryCandidates;
    const mesh = new THREE.InstancedMesh(geometry, material, 3);
    mesh.position.y = 0.12;
    const transform = new THREE.Object3D();
    for (let i = 0; i < mesh.count; i++) {
      const angle = i * Math.PI * 2 / mesh.count;
      transform.position.set(Math.cos(angle) * 0.14, 0, Math.sin(angle) * 0.14);
      transform.rotation.y = angle;
      transform.updateMatrix();
      mesh.setMatrixAt(i, transform.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    const berries = new THREE.InstancedMesh(this.berryGeometry, this.berryMaterial, 12);
    for (let i = 0; i < berries.count; i++) {
      const index = candidates[(i * 193) % candidates.length];
      const angle = (i % mesh.count) * Math.PI * 2 / mesh.count;
      const x = positions.getX(index), z = positions.getZ(index);
      transform.position.set(x * Math.cos(angle) + z * Math.sin(angle) + Math.cos(angle) * 0.14,
        positions.getY(index), -x * Math.sin(angle) + z * Math.cos(angle) + Math.sin(angle) * 0.14);
      transform.rotation.y = 0;
      transform.updateMatrix();
      berries.setMatrixAt(i, transform.matrix);
    }
    berries.instanceMatrix.needsUpdate = true;
    berries.computeBoundingSphere();
    berries.userData.natureSharedGeometry = true;
    berries.userData.natureSharedMaterial = true;
    mesh.add(berries);
    mesh.userData.bushFoliage = true;
    mesh.userData.natureSharedGeometry = true;
    mesh.userData.natureSharedMaterial = true;
    mesh.userData.natureGround = true;
    root.remove(old);
    old.geometry.dispose();
    for (const previous of Array.isArray(old.material) ? old.material : [old.material]) previous.dispose();
    root.add(mesh);
    return true;
  }

  dispose() {
    this.disposed = true;
    const geometries = new Set([...this.geometries.values()].flat());
    geometries.forEach(geometry => geometry.dispose());
    for (const material of this.materials.values()) {
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
      material.dispose();
    }
    this.geometries.clear();
    this.materials.clear();
    this.shrubBerryCandidates = [];
    this.berryGeometry.dispose();
    this.berryMaterial.dispose();
  }
}

function disposeGroundModel(root: THREE.Object3D) {
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
