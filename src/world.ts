import * as THREE from 'three';
import {
  CHUNK_SIZE, PLANET_HEIGHT, PLANET_WIDTH, nearestPlanetPosition, planetCoordinates, planetDistanceMeters, planetHeight, PlanetTangentFrame,
} from './planet';
import { depositKinds, requiresPickaxe, type DepositKind } from './economy';
import { TreeClearance, obstructingTreeMeshes } from './tree-occlusion';
import { climateZone } from './geography';
import { createTerrainMaterial, TerrainTextures } from './terrain-material';
import { NatureAssets, type NatureTreeVariant } from './nature-assets';
import { GroundNatureAssets, type GroundAssetKind } from './ground-nature-assets';
import { computeFullCoverBounds, coverCount, treeDetail, type TreeDetail, type VegetationQuality } from './vegetation-lod';
import type { StructuralPiece } from './construction';

/** Share of non-adult firs and spruces drawn as full young whorled firs rather than sparse saplings. */
const YOUNG_FIR_SHARE = 0.5;

export type Biome = 'ocean' | 'beach' | 'grass' | 'forest' | 'rock' | 'desert' | 'snow';
export type VegetationFamily = 'none' | 'deciduous' | 'conifer' | 'cactus';
export type TreeSpecies = 'pine' | 'spruce' | 'fir' | 'birch' | 'oak' | 'maple' | 'palm' | 'acacia' | 'tropical';
type Season = 'Spring' | 'Summer' | 'Autumn' | 'Winter';

/** Deterministic visual age class; it never alters resources or saves. */
export function treeAgeClass(species: TreeSpecies, seedX: number, seedZ: number, seed: number): 'mature' | 'young' | 'default' {
  const firLike = species === 'fir' || species === 'spruce';
  if ((species === 'oak' && seededNoise(seedX, seedZ, seed + 791) < 0.12)
    || (species === 'pine' && seededNoise(seedX, seedZ, seed + 792) < 0.16)
    || (firLike && seededNoise(seedX, seedZ, seed + 793) < 0.32)) return 'mature';
  return firLike && seededNoise(seedX, seedZ, seed + 794) < YOUNG_FIR_SHARE ? 'young' : 'default';
}
type Resource = 'wood' | 'stone' | 'food';
type Chunk = { x: number; z: number; objects: THREE.Object3D[]; terrain: THREE.Mesh; water: THREE.Mesh;
  terrainCoordinates: Float32Array; coverCoordinates: Map<THREE.InstancedMesh, Float32Array>;
  hiddenCover: Map<THREE.InstancedMesh, Map<number, number[]>>; baseColors: Float32Array };

export function seededNoise(x: number, z: number, seed: number) {
  const n = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function islandHeight(x: number, z: number, seed: number) {
  const island = 1 - Math.min(1, Math.sqrt(x * x + z * z) / 38);
  const broad = Math.sin(x * 0.055 + seed) * 1.2 + Math.cos(z * 0.047 + seed * 0.7) * 1.1;
  const detail = (seededNoise(Math.floor(x / 3), Math.floor(z / 3), seed) - 0.5) * 1.2;
  return Math.max(-2.5, island * 3.5 + broad + detail);
}

export function terrainHeight(x: number, z: number, seed: number) {
  const point = planetCoordinates(x, z);
  const distance = Math.max(Math.abs(point.x), Math.abs(point.z));
  if (distance <= 48) return islandHeight(point.x, point.z, seed);
  const outside = planetHeight(point.x, point.z, seed);
  if (distance >= 72) return outside;
  const blend = (distance - 48) / 24;
  return THREE.MathUtils.lerp(islandHeight(point.x, point.z, seed), outside, blend * blend * (3 - 2 * blend));
}

export function biomeAt(x: number, z: number, seed: number): Biome {
  const point = planetCoordinates(x, z);
  const h = terrainHeight(x, z, seed);
  if (h < -0.15) return 'ocean';
  if (h < 0.45) return 'beach';
  if (Math.max(Math.abs(point.x), Math.abs(point.z)) > 72) {
    if (Math.abs(point.z) > PLANET_HEIGHT * 0.36 || h > 7) return 'snow';
    const dry = Math.sin(point.x * Math.PI * 4 / PLANET_WIDTH + seed * 0.02) * Math.cos(point.z * Math.PI / PLANET_HEIGHT);
    if (dry > 0.58 && Math.abs(point.z) < PLANET_HEIGHT * 0.22) return 'desert';
  }
  const n = seededNoise(Math.floor(point.x / 5), Math.floor(point.z / 5), seed);
  if (h > 4.4) return 'rock';
  return n > 0.48 ? 'forest' : 'grass';
}

export function vegetationFamilyAt(x: number, z: number, seed: number): VegetationFamily {
  const biome = biomeAt(x, z, seed);
  if (biome === 'desert') return 'cactus';
  if (biome === 'snow') return 'conifer';
  if (biome === 'forest') return Math.abs(planetCoordinates(x, z).z / PLANET_HEIGHT * 180) >= 45 ? 'conifer' : 'deciduous';
  return 'none';
}

export function treeSpeciesAt(x: number, z: number, seed: number, family: 'deciduous' | 'conifer'): TreeSpecies {
  const point = planetCoordinates(x, z);
  const latitude = Math.abs(point.z / PLANET_HEIGHT * 180);
  const variation = seededNoise(point.x, point.z, seed + 311);
  if (family === 'conifer') return variation < 0.5 ? 'pine' : variation < 0.75 ? 'spruce' : 'fir';
  if (latitude < 23.5 && Math.max(Math.abs(point.x), Math.abs(point.z)) > 72) {
    return variation < 0.3 ? 'palm' : variation < 0.55 ? 'acacia' : 'tropical';
  }
  return variation < 0.3 ? 'birch' : variation < 0.65 ? 'oak' : 'maple';
}

export function terrainPalette(biome: Biome, climate: ReturnType<typeof climateZone>) {
  if (biome === 'ocean') return '#287b86';
  if (biome === 'beach') return '#d8c58a';
  if (biome === 'desert' || climate === 'hot-desert' || climate === 'cold-desert') return '#c9ad72';
  if (biome === 'rock') return '#77847b';
  if (biome === 'snow' || climate === 'polar-ice') return '#d7e5df';
  if (climate === 'tundra') return '#9da98b';
  if (climate === 'alpine') return '#718084';
  if (climate === 'tropical-rainforest') return '#356c48';
  if (climate === 'boreal') return '#58745b';
  return biome === 'forest' ? '#4d7d51' : '#70a65a';
}

export function safeSpawn(seed: number) {
  for (let radius = 0; radius <= 30; radius += 2) {
    for (let z = -radius; z <= radius; z += 2) {
      for (let x = -radius; x <= radius; x += 2) {
        if (Math.max(Math.abs(x), Math.abs(z)) !== radius) continue;
        const height = terrainHeight(x, z, seed);
        if (height > 0.8 && Math.abs(terrainHeight(x + 1, z, seed) - height) < 1
          && Math.abs(terrainHeight(x, z + 1, seed) - height) < 1) return { x, z };
      }
    }
  }
  return null;
}

function disposeObject(object: THREE.Object3D) {
  object.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    if (!child.userData.natureSharedGeometry) child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    if (!child.userData.natureSharedMaterial) materials.forEach(material => material.dispose());
    child.customDepthMaterial?.dispose();
  });
}

function wildflowerGeometry() {
  const vertices: number[] = [];
  const colors: number[] = [];
  const petal = new THREE.Color('#eee9d5');
  const center = new THREE.Color('#c4a44b');
  const stem = new THREE.Color('#647a43');
  const leaf = new THREE.Color('#6d814b');
  const triangle = (a: number[], b: number[], c: number[], color: THREE.Color) => {
    for (const point of [a, b, c]) {
      vertices.push(...point);
      colors.push(color.r, color.g, color.b);
    }
  };
  for (const [cx, cz, height, size] of [[0, 0, 0.13, 1], [0.055, 0.025, 0.06, 0.8], [-0.045, -0.035, 0.035, 0.72]]) {
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI * 2 / 8;
      const radial = (r: number, t: number, y: number) =>
        [cx + (Math.cos(angle) * r - Math.sin(angle) * t) * size, y,
          cz + (Math.sin(angle) * r + Math.cos(angle) * t) * size];
      const base = radial(0.008, 0, height);
      const left = radial(0.027, 0.009, height + 0.002);
      const right = radial(0.027, -0.009, height + 0.002);
      const tip = radial(0.038, 0, height - 0.002);
      triangle(base, left, tip, petal);
      triangle(base, tip, right, petal);
      triangle([cx, height + 0.004, cz], radial(0.009, 0, height + 0.003),
        radial(0.009 * Math.cos(Math.PI / 4), 0.009 * Math.sin(Math.PI / 4), height + 0.003), center);
    }
    triangle([-0.008, -0.13, 0], [0.008, -0.13, 0], [cx, height, cz], stem);
    triangle([0, -0.13, -0.008], [0, -0.13, 0.008], [cx, height, cz], stem);
  }
  triangle([0, -0.04, 0], [0.06, -0.02, 0], [0, 0.02, 0], leaf);
  triangle([0, -0.06, 0], [0, -0.03, -0.06], [0, 0.015, 0], leaf);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function coordinateKey(x: number, z: number) {
  const point = planetCoordinates(x, z);
  return `${Math.round(point.x)},${Math.round(point.z)}`;
}

export class World {
  readonly group = new THREE.Group();
  readonly seed: number;
  private terrainMod = new Map<string, number>();
  private depleted = new Set<string>();
  private mining = new Map<string, number>();
  private depositExclusions: Array<{ x: number; z: number; radius: number }> = [];
  private chunks = new Map<string, Chunk>();
  private readonly resourceCoordinates = new WeakMap<THREE.Object3D, { x: number; z: number }>();
  private tangentFrame: PlanetTangentFrame | null = null;
  private fadedTreeMeshes = new Map<THREE.Mesh, number>();
  private season: Season = 'Spring';
  private readonly waterTime = { value: 0 };
  private readonly waterWind = { value: 0 };
  private readonly terrainTextures = typeof document === 'undefined' ? null : new TerrainTextures();
  private readonly natureAssets: NatureAssets | null;
  private readonly groundAssets: GroundNatureAssets | null;
  private radius: number;
  private vegetationQuality: VegetationQuality = 'medium';
  private coverFloorBuckets = new Map<string, Array<Pick<StructuralPiece, 'x' | 'z' | 'y'>>>();
  private treeFocus = { x: 0, z: 0 };
  private lastTreeDetailFocus: { x: number; z: number } | null = null;
  readonly size = CHUNK_SIZE;
  readonly step = 1;

  constructor(seed: number, renderDistance = 1, alphaCoverage = false) {
    this.seed = seed;
    this.radius = Math.max(1, Math.min(3, Math.floor(renderDistance)));
    this.natureAssets = typeof document === 'undefined' ? null : new NatureAssets(family => {
      for (const chunk of this.chunks.values()) {
        for (const object of chunk.objects) {
          if (object.userData.resource === 'wood' && object.userData.vegetationFamily === family) {
            this.installTreeVisual(object);
          }
        }
        this.colorChunk(chunk);
      }
      this.updateTreeDetail(true);
    }, alphaCoverage);
    this.groundAssets = this.natureAssets ? new GroundNatureAssets(this.natureAssets.wind, kind => {
      for (const chunk of this.chunks.values()) {
        chunk.objects.forEach(object => this.installGroundVisual(object, kind));
        this.colorChunk(chunk);
      }
    }, alphaCoverage) : null;
    this.updateChunks(0, 0, true);
  }

  setRenderDistance(radius: number) {
    this.radius = Math.max(1, Math.min(3, Math.floor(radius)));
  }

  setVegetationQuality(quality: VegetationQuality) {
    this.vegetationQuality = quality;
    this.updateTreeDetail(true);
  }

  get loadedChunkCount() { return this.chunks.size; }
  get terrainReady() { return this.terrainTextures?.ready ?? false; }

  get hiddenFloorCoverCount() {
    let count = 0;
    for (const chunk of this.chunks.values()) {
      for (const hidden of chunk.hiddenCover.values()) count += hidden.size;
    }
    return count;
  }

  vegetationStats() {
    let near = 0;
    let mid = 0;
    let cover = 0;
    for (const chunk of this.chunks.values()) {
      for (const object of chunk.objects) {
        if (object.userData.natureAuthored) {
          if (object.userData.natureDetail === 'mid') mid++;
          else near++;
        }
        if (object instanceof THREE.InstancedMesh && chunk.coverCoordinates.has(object)) cover += object.count;
      }
    }
    return { near, mid, cover };
  }

  rebase(dx: number, dz: number) {
    const shifted = new Map<string, Chunk>();
    for (const chunk of this.chunks.values()) {
      chunk.x += dx / CHUNK_SIZE;
      chunk.z += dz / CHUNK_SIZE;
      chunk.terrain.userData.chunk = `${chunk.x},${chunk.z}`;
      chunk.objects.forEach(object => {
        const coordinates = this.resourceCoordinates.get(object);
        if (coordinates) { coordinates.x += dx; coordinates.z += dz; }
        if (!this.tangentFrame) { object.position.x += dx; object.position.z += dz; }
      });
      if (this.tangentFrame) this.projectChunk(chunk);
      shifted.set(`${chunk.x},${chunk.z}`, chunk);
    }
    this.chunks = shifted;
  }

  updateChunks(x: number, z: number, immediate = false) {
    this.treeFocus = { x, z };
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    for (const [key, chunk] of this.chunks) {
      if (Math.abs(chunk.x - cx) <= this.radius && Math.abs(chunk.z - cz) <= this.radius) continue;
      chunk.objects.forEach(object => { this.group.remove(object); this.forgetFadedMeshes(object); disposeObject(object); });
      this.chunks.delete(key);
    }
    const missing: Array<{ x: number; z: number; distance: number }> = [];
    for (let dz = -this.radius; dz <= this.radius; dz++) {
      for (let dx = -this.radius; dx <= this.radius; dx++) {
        if (!this.chunks.has(`${cx + dx},${cz + dz}`)) missing.push({ x: cx + dx, z: cz + dz, distance: dx * dx + dz * dz });
      }
    }
    missing.sort((a, b) => a.distance - b.distance);
    for (const candidate of immediate ? missing : missing.slice(0, 1)) this.createChunk(candidate.x, candidate.z);
    this.updateTreeDetail(missing.length > 0);
  }

  private updateTreeDetail(force: boolean) {
    if (!this.natureAssets) return;
    if (!force && this.lastTreeDetailFocus && planetDistanceMeters(this.treeFocus, this.lastTreeDetailFocus) < 1) return;
    this.lastTreeDetailFocus = { ...this.treeFocus };
    for (const chunk of this.chunks.values()) for (const object of chunk.objects) {
      if (object.userData.natureAuthored) {
        const current: TreeDetail = object.userData.natureDetail === 'mid' ? 'mid' : 'near';
        const detail = treeDetail(planetDistanceMeters(this.resourceLocation(object), this.treeFocus), current, this.vegetationQuality);
        if (detail !== current) this.natureAssets.setDetail(object, detail);
        object.userData.natureDetail = detail;
      } else if (object instanceof THREE.InstancedMesh
        && (object.userData.groundCover === 'grass' || object.userData.groundCover === 'fern')) {
        const coordinates = chunk.coverCoordinates.get(object);
        if (!coordinates) throw new Error('Missing ground-cover ownership coordinates');
        const current: TreeDetail = object.userData.coverDetail === 'mid' ? 'mid' : 'near';
        const center = { x: chunk.x * CHUNK_SIZE + CHUNK_SIZE / 2, z: chunk.z * CHUNK_SIZE + CHUNK_SIZE / 2 };
        const detail = treeDetail(planetDistanceMeters(center, this.treeFocus), current, this.vegetationQuality);
        object.count = coverCount(coordinates.length / 2, detail, this.vegetationQuality);
        object.userData.coverDetail = detail;
      }
    }
  }

  setSeason(season: Season) {
    if (season === this.season) return;
    this.season = season;
    for (const chunk of this.chunks.values()) this.colorChunk(chunk);
  }

  private colorChunk(chunk: Chunk) {
    const terrain = chunk.terrain.material as THREE.MeshStandardMaterial;
    terrain.color.set(this.season === 'Autumn' ? '#f2d1a6' : '#ffffff');
    const geometry = chunk.terrain.geometry;
    const colors = geometry.attributes.color;
    const positions = geometry.attributes.position;
    const blends = geometry.attributes.terrainBlend;
    const snow = new THREE.Color('#d7e5df');
    for (let i = 0; i < colors.count; i++) {
      const base = new THREE.Color().setRGB(chunk.baseColors[i * 3], chunk.baseColors[i * 3 + 1], chunk.baseColors[i * 3 + 2]);
      if (this.season === 'Winter' && positions.getY(i) > 0.45) base.lerp(snow, 0.75);
      colors.setXYZ(i, base.r, base.g, base.b);
      const x = chunk.x * CHUNK_SIZE + CHUNK_SIZE / 2 + chunk.terrainCoordinates[i * 2];
      const z = chunk.z * CHUNK_SIZE + CHUNK_SIZE / 2 + chunk.terrainCoordinates[i * 2 + 1];
      const biome = biomeAt(x, z, this.seed);
      blends.setY(i, biome === 'desert' ? 1 : THREE.MathUtils.clamp((0.7 - positions.getY(i)) / 0.7, 0, 1));
      blends.setZ(i, biome === 'snow' || (this.season === 'Winter' && positions.getY(i) > 0.45) ? 1 : 0);
      blends.setW(i, biome === 'rock' ? 1 : 0);
    }
    colors.needsUpdate = true;
    blends.needsUpdate = true;
    for (const object of chunk.objects) {
      if (object instanceof THREE.InstancedMesh && object.userData.groundCover) {
        const material = object.material as THREE.MeshStandardMaterial;
        const flower = object.userData.groundCover === 'flower';
        material.color.set(object.userData.natureGround
          ? this.season === 'Winter' ? '#c1d5ca' : this.season === 'Autumn' ? '#d2c3a2' : '#ffffff'
          : this.season === 'Winter' ? '#c1d5ca' : this.season === 'Autumn' ? '#b7a16b' : flower ? '#ecd9a4' : '#7aa85d');
        object.visible = !(flower && this.season === 'Winter');
      }
      if (object.userData.resource !== 'wood') continue;
      object.traverse(child => {
        if (!(child instanceof THREE.Mesh) || !(child.material instanceof THREE.MeshStandardMaterial) || typeof child.userData.foliageTier !== 'number') return;
        const base = child.userData.foliageBase;
        if (typeof base !== 'string') return;
        child.material.color.set(base);
        const species = object.userData.treeSpecies;
        if (this.season === 'Autumn' && ['birch', 'oak', 'maple'].includes(species)) {
          child.material.color.lerp(new THREE.Color('#b57a3e'), 0.7);
        } else if (this.season === 'Winter') {
          child.material.color.lerp(new THREE.Color('#b4c9bd'), 0.48);
        }
      });
    }
  }

  private createChunk(cx: number, cz: number) {
    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;
    const geometry = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE);
    geometry.rotateX(-Math.PI / 2);
    if (planetCoordinates(x0, z0 + CHUNK_SIZE / 2).reflected) {
      const indices = geometry.getIndex()!;
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const a = z * (CHUNK_SIZE + 1) + x;
          const b = a + 1;
          const c = a + CHUNK_SIZE + 1;
          const d = c + 1;
          const offset = (z * CHUNK_SIZE + x) * 6;
          indices.setX(offset, a);
          indices.setX(offset + 1, c);
          indices.setX(offset + 2, d);
          indices.setX(offset + 3, a);
          indices.setX(offset + 4, d);
          indices.setX(offset + 5, b);
        }
      }
    }
    const pos = geometry.attributes.position;
    const terrainCoordinates = new Float32Array(pos.count * 2);
    const colors: number[] = [];
    const blends: number[] = [];
    const color = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      terrainCoordinates[i * 2] = pos.getX(i);
      terrainCoordinates[i * 2 + 1] = pos.getZ(i);
      const x = pos.getX(i) + x0 + CHUNK_SIZE / 2;
      const z = pos.getZ(i) + z0 + CHUNK_SIZE / 2;
      pos.setY(i, this.vertexHeight(x, z));
      const biome = biomeAt(x, z, this.seed);
      const geographic = planetCoordinates(x, z);
      const latitude = geographic.z / PLANET_HEIGHT * 180;
      const climate = climateZone(latitude, pos.getY(i) * 100, 800,
        0.5 + seededNoise(geographic.x, geographic.z, this.seed) * 0.35, this.seed);
      color.set(terrainPalette(biome, climate));
      const variation = Math.sin(geographic.x * 0.31 + this.seed) * Math.cos(geographic.z * 0.27 - this.seed);
      color.multiplyScalar(0.94 + variation * 0.06);
      colors.push(color.r, color.g, color.b);
      const forest = 0.45 + 0.3 * Math.sin(geographic.x * 0.09 + this.seed)
        * Math.cos(geographic.z * 0.11 - this.seed);
      const sand = biome === 'desert' ? 1 : THREE.MathUtils.clamp((0.7 - pos.getY(i)) / 0.7, 0, 1);
      blends.push(forest, sand, biome === 'snow' ? 1 : 0, biome === 'rock' ? 1 : 0);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('terrainBlend', new THREE.Float32BufferAttribute(blends, 4));
    geometry.computeVertexNormals();
    const center = planetCoordinates(x0 + CHUNK_SIZE / 2, z0 + CHUNK_SIZE / 2);
    const terrainOrigin = new THREE.Vector2(center.x % 48, center.z % 48);
    const terrainMaterial = this.terrainTextures
      ? createTerrainMaterial(this.terrainTextures, terrainOrigin, center.reflected)
      : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
    if (!this.terrainTextures) terrainMaterial.onBeforeCompile = shader => {
      shader.uniforms.terrainOrigin = { value: terrainOrigin };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform vec2 terrainOrigin;\nvarying vec2 terrainCoordinate;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nterrainCoordinate = position.xz + terrainOrigin;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 terrainCoordinate;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float detail = sin(terrainCoordinate.x * 2.094395) * sin(terrainCoordinate.y * 1.570796);
          detail += sin((terrainCoordinate.x + terrainCoordinate.y) * 4.188790) * 0.35;
          diffuseColor.rgb *= 0.96 + detail * 0.045;`);
    };
    const terrain = new THREE.Mesh(geometry, terrainMaterial);
    terrain.position.set(x0 + CHUNK_SIZE / 2, 0, z0 + CHUNK_SIZE / 2);
    terrain.userData.chunk = `${cx},${cz}`;
    terrain.receiveShadow = true;
    const waterMaterial = new THREE.MeshPhysicalMaterial({
      color: '#4e9daa', transparent: true, opacity: 0.76, roughness: 0.24, metalness: 0.05, depthWrite: false,
    });
    const waterOrigin = { value: new THREE.Vector2((x0 + CHUNK_SIZE / 2) % 48, (z0 + CHUNK_SIZE / 2) % 48) };
    waterMaterial.onBeforeCompile = shader => {
      shader.uniforms.waterTime = this.waterTime;
      shader.uniforms.waterWind = this.waterWind;
      shader.uniforms.waterOrigin = waterOrigin;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform vec2 waterOrigin;\nattribute float waterDepth;\nvarying vec2 waterCoordinate;\nvarying float shoreDepth;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nwaterCoordinate = vec2(position.x, -position.y) + waterOrigin;\nshoreDepth = waterDepth;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float waterTime;\nuniform float waterWind;\nvarying vec2 waterCoordinate;\nvarying float shoreDepth;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          float wave = sin(waterCoordinate.x * 0.392699 + waterCoordinate.y * 0.261799 + waterTime * 0.8);
          wave += sin(waterCoordinate.x * 0.261799 - waterCoordinate.y * 0.392699 - waterTime * 0.55);
          float glint = smoothstep(0.9, 1.7, wave) * (0.18 + 0.12 * waterWind);
          diffuseColor.rgb *= 0.9 + wave * 0.09;
          diffuseColor.rgb += vec3(0.25, 0.31, 0.28) * glint;
          diffuseColor.a *= smoothstep(0.0, 0.35, shoreDepth);`);
    };
    const waterGeometry = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE);
    waterGeometry.setIndex(geometry.getIndex()!.clone());
    const waterDepth = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) waterDepth[i] = -0.08 - pos.getY(i);
    waterGeometry.setAttribute('waterDepth', new THREE.BufferAttribute(waterDepth, 1));
    const water = new THREE.Mesh(waterGeometry, waterMaterial);
    water.userData.waterOrigin = waterOrigin;
    water.rotation.x = -Math.PI / 2;
    water.position.set(x0 + CHUNK_SIZE / 2, -0.08, z0 + CHUNK_SIZE / 2);
    water.name = 'water';
    water.receiveShadow = true;
    const chunk: Chunk = { x: cx, z: cz, objects: [terrain, water], terrain, water, terrainCoordinates,
      coverCoordinates: new Map(), hiddenCover: new Map(), baseColors: new Float32Array(colors) };
    this.chunks.set(`${cx},${cz}`, chunk);
    this.addNature(chunk);
    this.addDeposits(chunk);
    this.addGroundCover(chunk);
    this.updateFloorCover(chunk);
    if (this.tangentFrame) this.projectChunk(chunk);
    chunk.objects.forEach(object => this.group.add(object));
    this.colorChunk(chunk);
  }

  setTangentFrame(frame: PlanetTangentFrame | null) {
    this.tangentFrame = frame;
    for (const chunk of this.chunks.values()) this.projectChunk(chunk);
  }

  private projectChunk(chunk: Chunk) {
    const x0 = chunk.x * CHUNK_SIZE;
    const z0 = chunk.z * CHUNK_SIZE;
    const project = (x: number, z: number) => this.tangentFrame?.toLocal({ x, z }) ?? { x, z };
    const center = project(x0 + CHUNK_SIZE / 2, z0 + CHUNK_SIZE / 2);
    chunk.terrain.position.set(center.x, 0, center.z);
    const geometry = chunk.terrain.geometry;
    const positions = geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const point = project(x0 + CHUNK_SIZE / 2 + chunk.terrainCoordinates[i * 2],
        z0 + CHUNK_SIZE / 2 + chunk.terrainCoordinates[i * 2 + 1]);
      positions.setX(i, point.x - center.x);
      positions.setZ(i, point.z - center.z);
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    chunk.water.position.x = center.x;
    chunk.water.position.z = center.z;
    const waterPositions = chunk.water.geometry.getAttribute('position');
    for (let i = 0; i < waterPositions.count; i++) {
      const x = x0 + CHUNK_SIZE / 2 + chunk.terrainCoordinates[i * 2];
      const z = z0 + CHUNK_SIZE / 2 + chunk.terrainCoordinates[i * 2 + 1];
      const point = project(x, z);
      waterPositions.setX(i, point.x - center.x);
      waterPositions.setY(i, center.z - point.z);
    }
    waterPositions.needsUpdate = true;
    chunk.water.geometry.computeBoundingBox();
    chunk.water.geometry.computeBoundingSphere();

    const matrix = new THREE.Matrix4();
    for (const object of chunk.objects) {
      const coordinates = this.resourceCoordinates.get(object);
      if (coordinates) {
        const point = project(coordinates.x, coordinates.z);
        object.position.x = point.x;
        object.position.z = point.z;
      } else if (object instanceof THREE.InstancedMesh && chunk.coverCoordinates.has(object)) {
        const origin = project(x0, z0);
        object.position.x = origin.x;
        object.position.z = origin.z;
        const cover = chunk.coverCoordinates.get(object)!;
        for (let i = 0; i < cover.length / 2; i++) {
          const point = project(x0 + cover[i * 2], z0 + cover[i * 2 + 1]);
          object.getMatrixAt(i, matrix);
          matrix.elements[12] = point.x - origin.x;
          matrix.elements[14] = point.z - origin.z;
          object.setMatrixAt(i, matrix);
        }
        object.instanceMatrix.needsUpdate = true;
        computeFullCoverBounds(object);
      }
    }
  }

  private addDeposits(chunk: Chunk) {
    const colors: Record<DepositKind, string> = {
      stone: '#a8aaa0',
      clay: '#ad735d', sand: '#d8bd79', coal: '#383d3b',
      copperOre: '#b67a4d', ironOre: '#9b5b4b', limestone: '#c4c1a8',
    };
    for (let z = chunk.z * CHUNK_SIZE + 6; z < (chunk.z + 1) * CHUNK_SIZE; z += 12) {
      for (let x = chunk.x * CHUNK_SIZE + 6; x < (chunk.x + 1) * CHUNK_SIZE; x += 12) {
        const point = planetCoordinates(x, z);
        const id = coordinateKey(x, z);
        if ((this.mining.get(id) ?? 0) >= 3 || this.depositBlocked(x, z) || terrainHeight(x, z, this.seed) <= 0.45) continue;
        const mineral = depositKinds[Math.floor(seededNoise(point.x, point.z, this.seed + 937) * depositKinds.length)];
        const deposit = new THREE.Group();
        deposit.position.set(x, this.heightAt(x, z), z);
        deposit.userData.depositId = id;
        deposit.userData.mineral = mineral;
        this.resourceCoordinates.set(deposit, { x, z });
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.65, 0),
          new THREE.MeshStandardMaterial({ color: '#727b74', roughness: 1 }));
        rock.position.y = 0.38;
        rock.scale.set(1.15, 0.7, 0.85);
        rock.castShadow = true;
        rock.userData.depositRock = true;
        deposit.add(rock);
        const vein = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 0),
          new THREE.MeshStandardMaterial({ color: colors[mineral], roughness: 0.85 }));
        vein.position.set(0.12, 0.66, 0.06);
        vein.scale.set(1, 0.55, 0.7);
        deposit.add(vein);
        chunk.objects.push(deposit);
        this.installGroundVisual(deposit, 'stone');
      }
    }
  }

  private depositBlocked(x: number, z: number) {
    return this.depositExclusions.some(exclusion => {
      const position = nearestPlanetPosition(exclusion.x, exclusion.z, x, z);
      return Math.hypot(position.x - x, position.z - z) < exclusion.radius;
    });
  }

  setDepositExclusions(exclusions: Array<{ x: number; z: number; radius: number }>) {
    this.depositExclusions = exclusions.map(exclusion => ({ ...exclusion }));
    for (const object of [...this.group.children]) {
      if (object.userData.depositId) {
        const position = this.resourceLocation(object);
        if (this.depositBlocked(position.x, position.z)) this.removeResource(object);
      }
    }
  }

  private addNature(chunk: Chunk) {
    const x0 = chunk.x * CHUNK_SIZE;
    const z0 = chunk.z * CHUNK_SIZE;
    const createAt = (x: number, z: number, legacy: boolean) => {
      const point = planetCoordinates(x, z);
      const id = coordinateKey(x, z);
      if (this.depleted.has(id)) return;
      const px = x + seededNoise(point.x, point.z, this.seed) - 0.5;
      const pz = z + (seededNoise(point.z, point.x, this.seed + 3) - 0.5) * (point.reflected ? -1 : 1);
      const h = legacy ? terrainHeight(px, pz, this.seed) : this.heightAt(px, pz);
      const surface = legacy ? this.heightAt(px, pz) : h;
      const biome = biomeAt(px, pz, this.seed);
      const family = vegetationFamilyAt(px, pz, this.seed);
      let object: THREE.Object3D | undefined;
      if (h > 0.35 && (family === 'deciduous' || family === 'conifer')
        && seededNoise(point.x, point.z, this.seed + 8) > (family === 'conifer' ? 0.52 : 0.42)) {
        const treePoint = planetCoordinates(px, pz);
        object = this.tree(px, surface, pz, treePoint.x, treePoint.z, family);
      } else if (h > 0.45 && family === 'cactus' && seededNoise(point.x, point.z, this.seed + 8) > 0.91) {
        object = this.cactus(px, surface, pz, point.x, point.z);
      } else if (h > 0.1 && biome !== 'ocean' && seededNoise(point.x + 4, point.z + 9, this.seed) > 0.76) {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.25 + seededNoise(point.x, point.z, this.seed) * 0.45, 0),
          new THREE.MeshStandardMaterial({ color: '#7c8580', roughness: 1 }));
        rock.position.set(px, surface + 0.12, pz);
        rock.castShadow = true;
        rock.userData.resource = 'stone';
        object = rock;
      } else if (h > 0.45 && seededNoise(point.x + 12, point.z - 7, this.seed) > 0.8) {
        const bush = new THREE.Group();
        bush.position.set(px, surface, pz);
        const foliage = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), new THREE.MeshStandardMaterial({ color: '#487a4a', roughness: 1 }));
        foliage.userData.bushFoliage = true;
        foliage.position.y = 0.4;
        foliage.scale.set(1, 0.7, 0.85);
        bush.add(foliage);
        const berries = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), new THREE.MeshStandardMaterial({ color: '#cd6863' }));
        berries.userData.bushBerries = true;
        berries.position.set(0.25, 0.63, 0.24);
        bush.add(berries);
        bush.userData.resource = 'food';
        object = bush;
      }
      if (object) {
        object.userData.resourceId = id;
        object.userData.legacy = legacy;
        this.resourceCoordinates.set(object, { x: px, z: pz });
        chunk.objects.push(object);
        this.installGroundVisual(object, 'stone');
        this.installGroundVisual(object, 'fern');
        this.installGroundVisual(object, 'shrub');
      }
    };
    for (let z = z0; z < z0 + CHUNK_SIZE; z++) {
      for (let x = x0; x < x0 + CHUNK_SIZE; x++) {
        const point = planetCoordinates(x, z);
        const legacy = Math.abs(point.x) <= 43 && Math.abs(point.z) <= 43;
        if (legacy && ((point.x + 43) % 3 === 0) && ((point.z + 43) % 3 === 0)) createAt(x, z, true);
        else if (Math.max(Math.abs(point.x), Math.abs(point.z)) > 48 && x % 3 === 0 && z % 3 === 0) createAt(x, z, false);
      }
    }
  }

  private addGroundCover(chunk: Chunk) {
    const grass: THREE.Matrix4[] = [];
    const flowers: THREE.Matrix4[] = [];
    const ferns: THREE.Matrix4[] = [];
    const transform = new THREE.Object3D();
    const x0 = chunk.x * CHUNK_SIZE;
    const z0 = chunk.z * CHUNK_SIZE;
    for (let z = chunk.z * CHUNK_SIZE; z < (chunk.z + 1) * CHUNK_SIZE; z++) {
      for (let x = chunk.x * CHUNK_SIZE; x < (chunk.x + 1) * CHUNK_SIZE; x++) {
        const point = planetCoordinates(x, z);
        const n = seededNoise(point.x, point.z, this.seed + 82);
        const px = x + n - 0.5;
        const pz = z + (seededNoise(point.z, point.x, this.seed + 71) - 0.5) * (point.reflected ? -1 : 1);
        const y = this.heightAt(px, pz);
        const biome = biomeAt(px, pz, this.seed);
        if (y < 0.5 || biome === 'rock' || biome === 'ocean' || biome === 'desert'
          || n < (biome === 'grass' ? 0.5 : 0.58)) continue;
        transform.position.set(px - x0, y + 0.13, pz - z0);
        const rotation = n > 0.97 ? seededNoise(point.x, point.z, this.seed + 199) : n;
        transform.rotation.set(0, rotation * Math.PI * 2, (n - 0.5) * 0.25);
        transform.scale.setScalar(0.7 + n * 0.7);
        transform.updateMatrix();
        (n > 0.97 ? flowers : biome === 'forest' && n > 0.92 ? ferns : grass).push(transform.matrix.clone());
      }

    }
    const addCover = (matrices: THREE.Matrix4[], geometry: THREE.BufferGeometry, color: string, kind: 'grass' | 'flower' | 'fern') => {
      if (kind !== 'flower') {
        const ranked = matrices.map(matrix => {
          const point = planetCoordinates(matrix.elements[12] + x0, matrix.elements[14] + z0);
          return { matrix, rank: seededNoise(point.x, point.z, this.seed + 197) };
        });
        ranked.sort((a, b) => a.rank - b.rank);
        matrices.splice(0, matrices.length, ...ranked.map(item => item.matrix));
      }
      const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 1 }), matrices.length);
      if (kind === 'flower') {
        mesh.material.vertexColors = true;
        mesh.material.side = THREE.DoubleSide;
      }
      mesh.position.set(x0, 0, z0);
      mesh.userData.groundCover = kind;
      const coordinates = new Float32Array(matrices.length * 2);
      matrices.forEach((matrix, index) => {
        coordinates[index * 2] = matrix.elements[12];
        coordinates[index * 2 + 1] = matrix.elements[14];
      });
      chunk.coverCoordinates.set(mesh, coordinates);
      matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      chunk.objects.push(mesh);
      if (kind !== 'flower') this.installGroundVisual(mesh, kind);
    };
    addCover(grass, new THREE.ConeGeometry(0.11, 0.35, 3), '#7aa85d', 'grass');
    addCover(flowers, wildflowerGeometry(), '#ffffff', 'flower');
    addCover(ferns, new THREE.ConeGeometry(0.11, 0.35, 3), '#7aa85d', 'fern');
  }

  setFloorCover(pieces: readonly StructuralPiece[]) {
    this.coverFloorBuckets.clear();
    const bucket = (x: number, z: number) => {
      const wrap = (value: number, period: number) => ((value % period) + period) % period;
      return `${wrap(Math.floor(x / CHUNK_SIZE), PLANET_WIDTH / CHUNK_SIZE)},${wrap(Math.floor(z / CHUNK_SIZE), PLANET_HEIGHT * 2 / CHUNK_SIZE)}`;
    };
    for (const piece of pieces) {
      if (piece.kind !== 'floor') continue;
      const canonical = planetCoordinates(piece.x, piece.z);
      for (const point of [canonical, { x: canonical.x - PLANET_WIDTH / 2, z: PLANET_HEIGHT - canonical.z }]) {
        const key = bucket(point.x, point.z);
        const floors = this.coverFloorBuckets.get(key) ?? [];
        floors.push({ x: point.x, z: point.z, y: piece.y });
        this.coverFloorBuckets.set(key, floors);
      }
    }
    for (const chunk of this.chunks.values()) this.updateFloorCover(chunk);
  }

  private updateFloorCover(chunk: Chunk) {
    const x0 = chunk.x * CHUNK_SIZE, z0 = chunk.z * CHUNK_SIZE;
    const wrap = (value: number, period: number) => ((value % period) + period) % period;
    const floors = new Map<string, Array<Pick<StructuralPiece, 'x' | 'z' | 'y'>>>();
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const key = `${wrap(chunk.x + dx, PLANET_WIDTH / CHUNK_SIZE)},${wrap(chunk.z + dz, PLANET_HEIGHT * 2 / CHUNK_SIZE)}`;
      for (const floor of this.coverFloorBuckets.get(key) ?? []) {
        const x = floor.x + Math.round((x0 + CHUNK_SIZE / 2 - floor.x) / PLANET_WIDTH) * PLANET_WIDTH;
        const z = floor.z + Math.round((z0 + CHUNK_SIZE / 2 - floor.z) / (PLANET_HEIGHT * 2)) * PLANET_HEIGHT * 2;
        if (x < x0 - 1 || x > x0 + CHUNK_SIZE + 1 || z < z0 - 1 || z > z0 + CHUNK_SIZE + 1) continue;
        const slot = `${x},${z}`;
        const list = floors.get(slot) ?? [];
        list.push({ x, z, y: floor.y });
        floors.set(slot, list);
      }
    }
    const matrix = new THREE.Matrix4();
    const basis = [0, 1, 2, 4, 5, 6, 8, 9, 10];
    for (const [mesh, coordinates] of chunk.coverCoordinates) {
      let hidden = chunk.hiddenCover.get(mesh);
      if (!hidden && !floors.size) continue;
      if (!hidden) { hidden = new Map(); chunk.hiddenCover.set(mesh, hidden); }
      let changed = false;
      for (let i = 0; i < coordinates.length / 2; i++) {
        const x = x0 + coordinates[i * 2], z = z0 + coordinates[i * 2 + 1];
        mesh.getMatrixAt(i, matrix);
        const ground = matrix.elements[13] - 0.13;
        const centerX = Math.round(x / 2) * 2, centerZ = Math.round(z / 2) * 2;
        const xs = Math.abs(x - centerX) === 1 ? [centerX, centerX - 2] : [centerX];
        const zs = Math.abs(z - centerZ) === 1 ? [centerZ, centerZ - 2] : [centerZ];
        const covered = xs.some(fx => zs.some(fz => (floors.get(`${fx},${fz}`) ?? []).some(floor =>
            Math.abs(floor.x - x) <= 1 && Math.abs(floor.z - z) <= 1
            && ground <= floor.y + 0.18 && ground >= floor.y - 0.85)));
        const old = hidden.get(i);
        if (covered === Boolean(old)) continue;
        if (covered) {
          hidden.set(i, basis.map(index => matrix.elements[index]));
          for (const index of basis) matrix.elements[index] *= 0.00001;
        } else {
          basis.forEach((index, element) => { matrix.elements[index] = old![element]; });
          hidden.delete(i);
        }
        mesh.setMatrixAt(i, matrix);
        changed = true;
      }
      if (changed) {
        mesh.instanceMatrix.needsUpdate = true;
        computeFullCoverBounds(mesh);
      }
      if (!hidden.size) chunk.hiddenCover.delete(mesh);
    }
  }

  private installGroundVisual(object: THREE.Object3D, kind: GroundAssetKind) {
    if (!this.groundAssets) return;
    if (kind === 'stone' && (object.userData.resource === 'stone' || object.userData.depositId)) {
      const location = this.resourceLocation(object);
      const point = planetCoordinates(location.x, location.z);
      const variation = seededNoise(point.x, point.z, this.seed + 659);
      if (object instanceof THREE.Mesh) this.groundAssets.installStone(object, variation);
      else {
        const rock = object.children.find((child): child is THREE.Mesh =>
          child instanceof THREE.Mesh && child.userData.depositRock);
        if (rock) this.groundAssets.installStone(rock, variation, true);
      }
    } else if (object instanceof THREE.InstancedMesh && object.userData.groundCover === kind
      && (kind === 'grass' || kind === 'fern')) {
      this.groundAssets.installCover(object, kind);
    } else if (kind === 'shrub' && object.userData.resource === 'food') {
      if (this.groundAssets.installBush(object)) {
        const placeholder = object.children.find(child => child.userData.bushBerries);
        if (placeholder) { object.remove(placeholder); disposeObject(placeholder); }
      }
    }
  }

  findNearest(x: number, z: number, range: number, resource?: Resource) {
    let nearest: THREE.Object3D | undefined;
    let distance = range;
    for (const object of this.group.children) {
      if (!object.userData.resource || (resource && object.userData.resource !== resource)) continue;
      const d = planetDistanceMeters(this.resourceLocation(object), { x, z });
      if (d < distance) { distance = d; nearest = object; }
    }
    return nearest;
  }

  findNearestDeposit(x: number, z: number, range: number) {
    let nearest: THREE.Object3D | undefined;
    let distance = range;
    for (const object of this.group.children) {
      if (!object.userData.depositId) continue;
      const d = planetDistanceMeters(this.resourceLocation(object), { x, z });
      if (d < distance) { distance = d; nearest = object; }
    }
    return nearest;
  }

  resourceLocation(object: THREE.Object3D): Readonly<{ x: number; z: number }> {
    const position = this.resourceCoordinates.get(object);
    if (!position) throw new Error('Missing resource ownership coordinates');
    return position;
  }

  resourcePosition(object: THREE.Object3D) {
    const position = this.resourceLocation(object);
    return new THREE.Vector3(position.x, object.position.y, position.z);
  }

  mineDeposit(deposit: THREE.Object3D, hasPickaxe: boolean) {
    if (deposit.parent !== this.group || typeof deposit.userData.depositId !== 'string'
      || !depositKinds.includes(deposit.userData.mineral as DepositKind)) return undefined;
    const mineral = deposit.userData.mineral as DepositKind;
    if (requiresPickaxe(mineral) && !hasPickaxe) return { mineral, needsPickaxe: true as const };
    const id = deposit.userData.depositId as string;
    const progress = (this.mining.get(id) ?? 0) + 1;
    this.mining.set(id, progress);
    const position = this.resourcePosition(deposit);
    if (progress === 3) this.removeResource(deposit);
    return { mineral, needsPickaxe: false as const, progress, position };
  }

  miningSnapshot() { return Object.fromEntries(this.mining); }

  restoreMining(progress: Record<string, number>) {
    this.mining = new Map(Object.entries(progress));
    for (const object of [...this.group.children]) {
      if (object.userData.depositId && (this.mining.get(object.userData.depositId as string) ?? 0) >= 3) this.removeResource(object);
    }
  }

  gatherNearest(x: number, z: number, range: number, resource?: Resource) {
    const nearest = this.findNearest(x, z, range, resource);
    if (!nearest) return undefined;
    const kind = nearest.userData.resource as Resource;
    const position = this.resourcePosition(nearest);
    this.depleted.add(nearest.userData.resourceId as string);
    this.removeResource(nearest);
    return { resource: kind, position };
  }

  private removeResource(object: THREE.Object3D) {
    this.group.remove(object);
    this.forgetFadedMeshes(object);
    for (const chunk of this.chunks.values()) {
      const index = chunk.objects.indexOf(object);
      if (index >= 0) { chunk.objects.splice(index, 1); break; }
    }
    disposeObject(object);
  }

  depletedSnapshot() { return [...this.depleted]; }

  restoreDepleted(ids: string[]) {
    this.depleted = new Set(ids);
    for (const object of [...this.group.children]) {
      if (object.userData.resourceId && this.depleted.has(object.userData.resourceId as string)) this.removeResource(object);
    }
  }

  dispose() {
    this.group.children.forEach(disposeObject);
    this.group.clear();
    this.chunks.clear();
    this.fadedTreeMeshes.clear();
    this.terrainTextures?.dispose();
    this.groundAssets?.dispose();
    this.natureAssets?.dispose();
  }

  intersectTerrain(ray: THREE.Raycaster) {
    return ray.intersectObjects([...this.chunks.values()].map(chunk => chunk.terrain))[0]?.point;
  }

  private forgetFadedMeshes(root: THREE.Object3D) {
    root.traverse(object => {
      if (object instanceof THREE.Mesh) this.fadedTreeMeshes.delete(object);
    });
  }

  updateTreeOcclusion(camera: THREE.Vector3, player: THREE.Vector3, dt: number) {
    const obstructing = obstructingTreeMeshes(this.group, camera, player);
    const worldCamera = this.group.localToWorld(camera.clone());
    const worldTarget = this.group.localToWorld(player.clone().add(new THREE.Vector3(0, 1.05, 0)));
    for (const mesh of obstructing) {
      if (!this.fadedTreeMeshes.has(mesh)) this.fadedTreeMeshes.set(mesh, 1);
    }
    for (const [mesh, opacity] of this.fadedTreeMeshes) {
      const target = obstructing.has(mesh) ? 0.18 : 1;
      const next = THREE.MathUtils.damp(opacity, target, 12, dt);
      const restored = target === 1 && next > 0.995;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        const clearance: unknown = material.userData.treeClearance;
        if (clearance instanceof TreeClearance) {
          clearance.camera.value.copy(worldCamera);
          clearance.target.value.copy(worldTarget);
          clearance.amount.value = restored ? 0 : (1 - next) / 0.82;
          continue;
        }
        if (typeof material.userData.natureOpacity !== 'number') {
          material.userData.natureOpacity = material.opacity;
          material.userData.natureTransparent = material.transparent;
          material.userData.natureDepthWrite = material.depthWrite;
        }
        const transparent = !restored || material.userData.natureTransparent === true;
        const depthWrite = restored ? material.userData.natureDepthWrite !== false : false;
        if (material.transparent !== transparent || material.depthWrite !== depthWrite) {
          material.transparent = transparent;
          material.depthWrite = depthWrite;
          material.needsUpdate = true;
        }
        material.opacity = material.userData.natureOpacity * (restored ? 1 : next);
      }
      if (restored) this.fadedTreeMeshes.delete(mesh);
      else this.fadedTreeMeshes.set(mesh, next);
    }
  }

  private tree(x: number, y: number, z: number, seedX: number, seedZ: number, family: 'deciduous' | 'conifer') {
    const root = new THREE.Group();
    root.position.set(x, y, z);
    root.scale.setScalar(0.75 + seededNoise(seedX, seedZ, this.seed) * 0.65);
    root.userData.vegetationFamily = family;
    const species = treeSpeciesAt(seedX, seedZ, this.seed, family);
    root.userData.treeSpecies = species;
    const age = treeAgeClass(species, seedX, seedZ, this.seed);
    root.userData.natureMature = age === 'mature';
    root.userData.natureYoung = age === 'young';
    root.rotation.y = seededNoise(seedX, seedZ, this.seed + 481) * Math.PI * 2;
    const height = species === 'palm' ? 2.8 : species === 'birch' ? 2.5
      : species === 'pine' ? 2.35 : species === 'acacia' ? 2.1 : 1.8;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(species === 'birch' ? 0.11 : 0.16, 0.26, height, 7),
      new THREE.MeshStandardMaterial({ color: species === 'birch' ? '#d2c9b0' : '#806044', roughness: 1 }));
    trunk.position.y = height / 2;
    trunk.castShadow = true;
    root.add(trunk);
    const foliage = (geometry: THREE.BufferGeometry, color: string, tier: number) => {
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
      mesh.userData.foliageTier = tier;
      mesh.userData.foliageBase = color;
      mesh.castShadow = true;
      root.add(mesh);
      return mesh;
    };
    if (species === 'pine' || species === 'spruce' || species === 'fir') {
      const pine = species === 'pine';
      for (let i = 0; i < 3; i++) {
        const crown = foliage(new THREE.ConeGeometry((pine ? 0.65 : 0.95) - i * 0.13, pine ? 1.4 : 1.25, 7),
          ['#315a4b', '#396b54', '#46785b'][i], i);
        crown.position.y = (pine ? 1.5 : 1.0) + i * (pine ? 0.65 : 0.48);
      }
    } else if (species === 'palm') {
      for (let i = 0; i < 5; i++) {
        const leaf = foliage(new THREE.ConeGeometry(0.2, 1.45, 4), i % 2 ? '#447c4a' : '#609058', i % 3);
        const angle = i * Math.PI * 2 / 5;
        leaf.position.set(Math.cos(angle) * 0.52, height + 0.12, Math.sin(angle) * 0.52);
        leaf.rotation.set(Math.sin(angle) * 1.12, 0, -Math.cos(angle) * 1.12);
      }
    } else if (species === 'acacia') {
      for (let i = 0; i < 3; i++) {
        const crown = foliage(new THREE.IcosahedronGeometry(0.78, 1), ['#627e4d', '#76915b', '#54754b'][i], i);
        crown.position.set((i - 1) * 0.6, height + (i === 1 ? 0.28 : 0), i === 1 ? -0.22 : 0.1);
        crown.scale.set(1.05, 0.32, 0.8);
      }
    } else {
      const colors = species === 'birch' ? ['#7b9d65', '#8bab70', '#6d955f']
        : species === 'maple' ? ['#497c49', '#649052', '#52854c']
          : species === 'tropical' ? ['#286c46', '#378052', '#4b8b55'] : ['#47774b', '#588655', '#3d7049'];
      for (let i = 0; i < 3; i++) {
        const crown = foliage(new THREE.IcosahedronGeometry(species === 'oak' ? 0.85 : 0.7, species === 'maple' ? 0 : 1), colors[i], i);
        crown.position.set((i - 1) * (species === 'birch' ? 0.25 : 0.55),
          height + (i === 1 ? 0.5 : 0), i === 1 ? -0.15 : 0.12);
        if (species === 'birch') crown.scale.set(0.75, 1.35, 0.75);
        if (species === 'tropical') crown.scale.set(1.2, 0.65, 1);
      }
    }
    root.userData.resource = 'wood';
    this.installTreeVisual(root);
    return root;
  }

  private installTreeVisual(root: THREE.Object3D) {
    const family: unknown = root.userData.vegetationFamily;
    if (family !== 'deciduous' && family !== 'conifer') return;
    if (family === 'deciduous' && !['birch', 'oak', 'maple'].includes(root.userData.treeSpecies)) return;
    const desired: NatureTreeVariant = root.userData.natureMature
      ? root.userData.treeSpecies === 'pine' ? 'mature-pine'
        : root.userData.treeSpecies === 'fir' || root.userData.treeSpecies === 'spruce' ? 'mature-fir' : 'mature'
      : root.userData.treeSpecies === 'pine' ? 'pine' : root.userData.natureYoung ? 'young-fir' : 'default';
    if (root.userData.natureVariant === desired) return;
    let variant = desired;
    let visual = this.natureAssets?.create(family, root.rotation.y, desired);
    if (!visual && (desired === 'mature' || desired === 'mature-pine' || desired === 'mature-fir' || desired === 'young-fir')
      && !root.userData.natureAuthored) {
      variant = desired === 'mature-pine' ? 'pine' : 'default';
      visual = this.natureAssets?.create(family, root.rotation.y, variant);
    }
    if (!visual) return;
    this.forgetFadedMeshes(root);
    for (const child of [...root.children]) {
      root.remove(child);
      disposeObject(child);
    }
    root.rotation.z = 0;
    root.add(visual);
    root.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(root);
    const size = bounds.getSize(new THREE.Vector3());
    root.userData.treeOcclusionRadius = Math.max(2.5, Math.hypot(size.x, size.z) * 0.5);
    root.userData.natureAuthored = true;
    root.userData.natureVariant = variant;
  }

  private cactus(x: number, y: number, z: number, seedX: number, seedZ: number) {
    const plant = new THREE.Group();
    plant.position.set(x, y, z);
    plant.scale.setScalar(0.75 + seededNoise(seedX, seedZ, this.seed) * 0.5);
    plant.userData.vegetationFamily = 'cactus';
    const material = new THREE.MeshStandardMaterial({ color: '#558653', roughness: 1 });
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.45, 6), material);
    stem.position.y = 0.72;
    stem.castShadow = true;
    plant.add(stem);
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.4, 5), material);
      arm.rotation.z = Math.PI / 2;
      arm.position.set(side * 0.22, 0.65, 0);
      plant.add(arm);
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.48, 5), material);
      branch.position.set(side * 0.4, 0.88, 0);
      branch.castShadow = true;
      plant.add(branch);
    }
    return plant;
  }

  animate(time: number, wind: number, dt: number) {
    this.waterTime.value = (this.waterTime.value + dt) % (Math.PI * 40);
    this.waterWind.value = Math.max(0, Math.min(1.6, wind));
    if (this.natureAssets) {
      this.natureAssets.wind.time.value = time * 0.001;
      this.natureAssets.wind.wind.value = this.waterWind.value;
    }
    for (const object of this.group.children) {
      if (object.userData.resource === 'wood' && !object.userData.natureAuthored) {
        object.rotation.z = Math.sin(time * 0.0012 + object.position.x * 0.2 + object.position.z * 0.1) * Math.min(0.025, wind * 0.015);
      }
    }
  }

  private vertexHeight(x: number, z: number) {
    return terrainHeight(x, z, this.seed) + (this.terrainMod.get(coordinateKey(x, z)) ?? 0);
  }

  heightAt(x: number, z: number) {
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const dx = x - x0;
    const dz = z - z0;
    const a = this.vertexHeight(x0, z0);
    const b = this.vertexHeight(x0 + 1, z0);
    const c = this.vertexHeight(x0, z0 + 1);
    const d = this.vertexHeight(x0 + 1, z0 + 1);
    if (planetCoordinates(x0, z0 + 0.5).reflected) {
      return dx <= dz
        ? a + (c - a) * dz + (d - c) * dx
        : a + (b - a) * dx + (d - b) * dz;
    }
    // Match PlaneGeometry's (x + 1, z) to (x, z + 1) diagonal.
    return dx + dz <= 1
      ? a + (b - a) * dx + (c - a) * dz
      : d + (c - d) * (1 - dx) + (b - d) * (1 - dz);
  }

  dig(x: number, z: number) {
    const key = coordinateKey(Math.round(x), Math.round(z));
    const current = this.terrainMod.get(key) ?? 0;
    this.terrainMod.set(key, Math.max(-1.8, current - 0.35));
    this.refreshTerrain();
  }

  editTerrain(x: number, z: number, radius: number, operation: 'lower' | 'raise' | 'flatten' | 'smooth', targetHeight?: number) {
    const modifications: Array<{ key: string; previous: number; next: number }> = [];
    const px = Math.floor(x);
    const pz = Math.floor(z);
    const baseRadius = Math.max(1, Math.ceil(radius));
    for (let dz = -baseRadius; dz <= baseRadius; dz++) {
      for (let dx = -baseRadius; dx <= baseRadius; dx++) {
        if (Math.hypot(dx, dz) > radius) continue;
        const gx = px + dx;
        const gz = pz + dz;
        const key = coordinateKey(gx, gz);
        const previous = this.terrainMod.get(key) ?? 0;
        let next = previous;
        const edge = Math.max(0, 1 - Math.hypot(dx, dz) / (radius + 0.01));
        const original = terrainHeight(gx, gz, this.seed);
        if (operation === 'lower') next = previous - 0.28 * edge;
        if (operation === 'raise') next = previous + 0.28 * edge;
        if (operation === 'flatten' && targetHeight !== undefined) next = targetHeight - original;
        if (operation === 'smooth') {
          const average = [
            this.vertexHeight(gx - 1, gz),
            this.vertexHeight(gx + 1, gz),
            this.vertexHeight(gx, gz - 1),
            this.vertexHeight(gx, gz + 1),
            this.vertexHeight(gx, gz),
          ].reduce((sum, height) => sum + height, 0) / 5;
          next = previous + (average - original - previous) * 0.35 * edge;
        }
        next = THREE.MathUtils.clamp(next, -1.8, 8);
        if (Math.abs(next - previous) > 0.001) modifications.push({ key, previous, next });
      }
    }
    for (const change of modifications) this.terrainMod.set(change.key, change.next);
    this.refreshTerrain();
    return modifications.map(change => ({ key: change.key, previous: change.previous, next: change.next }));
  }

  undoTerrain(changes: Array<{ key: string; previous: number; next: number }>) {
    for (const change of changes) this.terrainMod.set(change.key, change.previous);
    this.refreshTerrain();
  }

  private refreshTerrain() {
    const matrix = new THREE.Matrix4();
    for (const chunk of this.chunks.values()) {
      const geometry = chunk.terrain.geometry;
      const pos = geometry.attributes.position;
      const waterDepth = chunk.water.geometry.getAttribute('waterDepth');
      for (let i = 0; i < pos.count; i++) {
        const x = chunk.x * CHUNK_SIZE + CHUNK_SIZE / 2 + chunk.terrainCoordinates[i * 2];
        const z = chunk.z * CHUNK_SIZE + CHUNK_SIZE / 2 + chunk.terrainCoordinates[i * 2 + 1];
        pos.setY(i, this.vertexHeight(x, z));
        waterDepth.setX(i, -0.08 - pos.getY(i));
      }
      pos.needsUpdate = true;
      waterDepth.needsUpdate = true;
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
      this.colorChunk(chunk);
      for (const object of chunk.objects) {
        if (object.userData.resource || object.userData.depositId) {
          const position = this.resourceLocation(object);
          object.position.y = this.heightAt(position.x, position.z)
            + (object.userData.resource === 'stone' ? 0.12 : 0);
        } else if (object instanceof THREE.InstancedMesh && object.userData.groundCover) {
          const coordinates = chunk.coverCoordinates.get(object);
          if (!coordinates) throw new Error('Missing ground-cover ownership coordinates');
          for (let i = 0; i < coordinates.length / 2; i++) {
            object.getMatrixAt(i, matrix);
            const x = chunk.x * CHUNK_SIZE + coordinates[i * 2];
            const z = chunk.z * CHUNK_SIZE + coordinates[i * 2 + 1];
            matrix.elements[13] = this.heightAt(x, z) + 0.13;
            object.setMatrixAt(i, matrix);
          }
          object.instanceMatrix.needsUpdate = true;
          computeFullCoverBounds(object);
        }
      }
      this.updateFloorCover(chunk);
    }
  }

  snapshot() { return Object.fromEntries(this.terrainMod); }

  restore(modifications: Record<string, number>) {
    this.terrainMod = new Map(Object.entries(modifications));
    this.refreshTerrain();
  }
}
