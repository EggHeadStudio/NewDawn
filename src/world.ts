import * as THREE from 'three';
import { CHUNK_SIZE, PLANET_HEIGHT, PLANET_WIDTH, nearestPlanetPosition, planetCoordinates, planetHeight } from './planet';
import { depositKinds, requiresPickaxe, type DepositKind } from './economy';
import { obstructingTrees } from './tree-occlusion';
import { climateZone } from './geography';

export type Biome = 'ocean' | 'beach' | 'grass' | 'forest' | 'rock' | 'desert' | 'snow';
type Season = 'Spring' | 'Summer' | 'Autumn' | 'Winter';
type Resource = 'wood' | 'stone' | 'food';
type Chunk = { x: number; z: number; objects: THREE.Object3D[]; terrain: THREE.Mesh; baseColors: Float32Array };

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
    const dry = Math.sin(point.x * Math.PI * 4 / 3072 + seed * 0.02) * Math.cos(point.z * Math.PI / PLANET_HEIGHT);
    if (dry > 0.58 && Math.abs(point.z) < PLANET_HEIGHT * 0.22) return 'desert';
  }
  const n = seededNoise(Math.floor(point.x / 5), Math.floor(point.z / 5), seed);
  if (h > 4.4) return 'rock';
  return n > 0.48 ? 'forest' : 'grass';
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
    child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach(material => material.dispose());
  });
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
  private fadedTrees = new Set<THREE.Object3D>();
  private season: Season = 'Spring';
  private radius: number;
  readonly size = CHUNK_SIZE;
  readonly step = 1;

  constructor(seed: number, renderDistance = 1) {
    this.seed = seed;
    this.radius = Math.max(1, Math.min(3, Math.floor(renderDistance)));
    this.updateChunks(0, 0, true);
  }

  setRenderDistance(radius: number) {
    this.radius = Math.max(1, Math.min(3, Math.floor(radius)));
  }

  get loadedChunkCount() { return this.chunks.size; }

  rebase(dx: number, dz: number) {
    const shifted = new Map<string, Chunk>();
    for (const chunk of this.chunks.values()) {
      chunk.x += dx / CHUNK_SIZE;
      chunk.z += dz / CHUNK_SIZE;
      chunk.terrain.userData.chunk = `${chunk.x},${chunk.z}`;
      chunk.objects.forEach(object => { object.position.x += dx; object.position.z += dz; });
      shifted.set(`${chunk.x},${chunk.z}`, chunk);
    }
    this.chunks = shifted;
  }

  updateChunks(x: number, z: number, immediate = false) {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    for (const [key, chunk] of this.chunks) {
      if (Math.abs(chunk.x - cx) <= this.radius && Math.abs(chunk.z - cz) <= this.radius) continue;
      chunk.objects.forEach(object => { this.group.remove(object); this.fadedTrees.delete(object); disposeObject(object); });
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
    const snow = new THREE.Color('#d7e5df');
    for (let i = 0; i < colors.count; i++) {
      const base = new THREE.Color().setRGB(chunk.baseColors[i * 3], chunk.baseColors[i * 3 + 1], chunk.baseColors[i * 3 + 2]);
      if (this.season === 'Winter' && positions.getY(i) > 0.45) base.lerp(snow, 0.75);
      colors.setXYZ(i, base.r, base.g, base.b);
    }
    colors.needsUpdate = true;
    for (const object of chunk.objects) {
      if (object instanceof THREE.InstancedMesh && object.userData.groundCover) {
        const material = object.material as THREE.MeshStandardMaterial;
        const flower = object.userData.groundCover === 'flower';
        material.color.set(this.season === 'Winter' ? '#c1d5ca' : this.season === 'Autumn' ? '#b7a16b' : flower ? '#ecd9a4' : '#7aa85d');
        object.visible = !(flower && this.season === 'Winter');
      }
      if (object.userData.resource !== 'wood') continue;
      object.children.forEach(child => {
        if (!(child instanceof THREE.Mesh) || !(child.material instanceof THREE.MeshStandardMaterial) || typeof child.userData.foliageTier !== 'number') return;
        const colors = this.season === 'Autumn' ? ['#bb8a4e', '#a96b43', '#c39856']
          : this.season === 'Winter' ? ['#a6c1b6', '#789b91', '#cad8cd']
          : ['#4f8152', '#3f7350', '#668f55'];
        child.material.color.set(colors[child.userData.foliageTier]);
      });
    }
  }

  private createChunk(cx: number, cz: number) {
    const x0 = cx * CHUNK_SIZE;
    const z0 = cz * CHUNK_SIZE;
    const geometry = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(x0 + CHUNK_SIZE / 2, 0, z0 + CHUNK_SIZE / 2);
    const pos = geometry.attributes.position;
    const colors: number[] = [];
    const color = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, this.vertexHeight(x, z));
      const biome = biomeAt(x, z, this.seed);
      const geographic = planetCoordinates(x, z);
      const latitude = geographic.z / PLANET_HEIGHT * 90;
      const longitude = geographic.x / PLANET_WIDTH * 180;
      const climate = climateZone(latitude, pos.getY(i) * 100, 800, 0.5 + seededNoise(x, z, this.seed) * 0.35, this.seed);
      color.set(climate === 'polar-ice' ? '#d7e5df' : climate === 'tundra' ? '#9da98b'
        : climate === 'hot-desert' || climate === 'cold-desert' ? '#d1b877'
        : climate === 'alpine' ? '#718084'
        : climate === 'tropical-rainforest' ? '#356c48'
        : climate === 'boreal' ? '#58745b'
        : biome === 'ocean' ? '#287b86' : biome === 'beach' ? '#d8c58a'
        : biome === 'forest' ? '#4d7d51' : '#70a65a');
      colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const terrain = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }));
    terrain.userData.chunk = `${cx},${cz}`;
    terrain.receiveShadow = true;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE),
      new THREE.MeshPhysicalMaterial({ color: '#56aeb8', transparent: true, opacity: 0.72, roughness: 0.18, metalness: 0.05 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(x0 + CHUNK_SIZE / 2, -0.08, z0 + CHUNK_SIZE / 2);
    water.name = 'water';
    water.receiveShadow = true;
    const chunk: Chunk = { x: cx, z: cz, objects: [terrain, water], terrain, baseColors: new Float32Array(colors) };
    this.chunks.set(`${cx},${cz}`, chunk);
    this.addNature(chunk);
    this.addDeposits(chunk);
    this.addGroundCover(chunk);
    chunk.objects.forEach(object => this.group.add(object));
    this.colorChunk(chunk);
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
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.65, 0),
          new THREE.MeshStandardMaterial({ color: '#727b74', roughness: 1 }));
        rock.position.y = 0.38;
        rock.scale.set(1.15, 0.7, 0.85);
        rock.castShadow = true;
        deposit.add(rock);
        const vein = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 0),
          new THREE.MeshStandardMaterial({ color: colors[mineral], roughness: 0.85 }));
        vein.position.set(0.12, 0.66, 0.06);
        vein.scale.set(1, 0.55, 0.7);
        deposit.add(vein);
        chunk.objects.push(deposit);
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
      if (object.userData.depositId && this.depositBlocked(object.position.x, object.position.z)) this.removeResource(object);
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
      const biome = biomeAt(px, pz, this.seed);
      let object: THREE.Object3D | undefined;
      if (h > 0.35 && biome === 'forest' && seededNoise(point.x, point.z, this.seed + 8) > 0.42) {
        const treePoint = planetCoordinates(px, pz);
        object = this.tree(px, h, pz, treePoint.x, treePoint.z);
      } else if (h > 0.1 && biome !== 'ocean' && seededNoise(point.x + 4, point.z + 9, this.seed) > 0.76) {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.25 + seededNoise(point.x, point.z, this.seed) * 0.45, 0),
          new THREE.MeshStandardMaterial({ color: '#7c8580', roughness: 1 }));
        rock.position.set(px, h + 0.12, pz);
        rock.castShadow = true;
        rock.userData.resource = 'stone';
        object = rock;
      } else if (h > 0.45 && seededNoise(point.x + 12, point.z - 7, this.seed) > 0.8) {
        const bush = new THREE.Group();
        bush.position.set(px, h, pz);
        const foliage = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), new THREE.MeshStandardMaterial({ color: '#487a4a', roughness: 1 }));
        foliage.position.y = 0.4;
        foliage.scale.set(1, 0.7, 0.85);
        bush.add(foliage);
        const berries = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), new THREE.MeshStandardMaterial({ color: '#cd6863' }));
        berries.position.set(0.25, 0.63, 0.24);
        bush.add(berries);
        bush.userData.resource = 'food';
        object = bush;
      }
      if (object) {
        object.userData.resourceId = id;
        object.userData.legacy = legacy;
        chunk.objects.push(object);
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
    const transform = new THREE.Object3D();
    for (let z = chunk.z * CHUNK_SIZE; z < (chunk.z + 1) * CHUNK_SIZE; z += 2) {
      for (let x = chunk.x * CHUNK_SIZE; x < (chunk.x + 1) * CHUNK_SIZE; x += 2) {
        const point = planetCoordinates(x, z);
        const n = seededNoise(point.x, point.z, this.seed + 82);
        const px = x + n - 0.5;
        const pz = z + seededNoise(point.z, point.x, this.seed + 71) - 0.5;
        const y = this.heightAt(px, pz);
        const biome = biomeAt(px, pz, this.seed);
        if (y < 0.5 || biome === 'rock' || biome === 'ocean' || biome === 'desert' || n < 0.45) continue;
        transform.position.set(px, y + 0.13, pz);
        transform.rotation.set(0, n * Math.PI * 2, (n - 0.5) * 0.25);
        transform.scale.setScalar(0.7 + n * 0.7);
        transform.updateMatrix();
        (n > 0.94 ? flowers : grass).push(transform.matrix.clone());
      }
    }
    const addCover = (matrices: THREE.Matrix4[], geometry: THREE.BufferGeometry, color: string, kind: 'grass' | 'flower') => {
      const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 1 }), matrices.length);
      mesh.userData.groundCover = kind;
      matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      chunk.objects.push(mesh);
    };
    addCover(grass, new THREE.ConeGeometry(0.11, 0.35, 3), '#7aa85d', 'grass');
    addCover(flowers, new THREE.IcosahedronGeometry(0.12, 0), '#ecd9a4', 'flower');
  }

  findNearest(x: number, z: number, range: number, resource?: Resource) {
    let nearest: THREE.Object3D | undefined;
    let distance = range;
    for (const object of this.group.children) {
      if (!object.userData.resource || (resource && object.userData.resource !== resource)) continue;
      const d = Math.hypot(object.position.x - x, object.position.z - z);
      if (d < distance) { distance = d; nearest = object; }
    }
    return nearest;
  }

  findNearestDeposit(x: number, z: number, range: number) {
    let nearest: THREE.Object3D | undefined;
    let distance = range;
    for (const object of this.group.children) {
      if (!object.userData.depositId) continue;
      const d = Math.hypot(object.position.x - x, object.position.z - z);
      if (d < distance) { distance = d; nearest = object; }
    }
    return nearest;
  }

  mineDeposit(deposit: THREE.Object3D, hasPickaxe: boolean) {
    if (deposit.parent !== this.group || typeof deposit.userData.depositId !== 'string'
      || !depositKinds.includes(deposit.userData.mineral as DepositKind)) return undefined;
    const mineral = deposit.userData.mineral as DepositKind;
    if (requiresPickaxe(mineral) && !hasPickaxe) return { mineral, needsPickaxe: true as const };
    const id = deposit.userData.depositId as string;
    const progress = (this.mining.get(id) ?? 0) + 1;
    this.mining.set(id, progress);
    const position = deposit.position.clone();
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
    const position = nearest.position.clone();
    this.depleted.add(nearest.userData.resourceId as string);
    this.removeResource(nearest);
    return { resource: kind, position };
  }

  private removeResource(object: THREE.Object3D) {
    this.group.remove(object);
    this.fadedTrees.delete(object);
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
    this.fadedTrees.clear();
  }

  intersectTerrain(ray: THREE.Raycaster) {
    return ray.intersectObjects([...this.chunks.values()].map(chunk => chunk.terrain))[0]?.point;
  }

  updateTreeOcclusion(camera: THREE.Vector3, player: THREE.Vector3) {
    const obstructing = obstructingTrees(this.group, camera, player);
    const updateMaterial = (tree: THREE.Object3D, fade: boolean) => tree.traverse(object => {
      if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshStandardMaterial)) return;
      object.material.transparent = fade;
      object.material.opacity = fade ? 0.18 : 1;
      object.material.depthWrite = !fade;
      object.material.needsUpdate = true;
    });
    for (const tree of this.fadedTrees) if (!obstructing.has(tree)) updateMaterial(tree, false);
    for (const tree of obstructing) if (!this.fadedTrees.has(tree)) updateMaterial(tree, true);
    this.fadedTrees = obstructing;
  }

  private tree(x: number, y: number, z: number, seedX: number, seedZ: number) {
    const root = new THREE.Group();
    root.position.set(x, y, z);
    root.scale.setScalar(0.75 + seededNoise(seedX, seedZ, this.seed) * 0.65);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 1.5, 7),
      new THREE.MeshStandardMaterial({ color: '#806044', roughness: 1 }));
    trunk.position.y = 0.75;
    trunk.castShadow = true;
    root.add(trunk);
    const crownColors = ['#4f8152', '#3f7350', '#668f55'];
    const broadleaf = seededNoise(seedX + 2, seedZ - 5, this.seed) > 0.58;
    for (let i = 0; i < 3; i++) {
      const crown = new THREE.Mesh(broadleaf ? new THREE.IcosahedronGeometry(0.8 - i * 0.12, 1) : new THREE.ConeGeometry(0.95 - i * 0.12, 1.45, 7),
        new THREE.MeshStandardMaterial({ color: crownColors[i], roughness: 0.9 }));
      crown.position.y = 1.55 + i * 0.55;
      if (broadleaf) crown.position.x = (i - 1) * 0.38;
      crown.userData.foliageTier = i;
      crown.castShadow = true;
      root.add(crown);
    }
    root.userData.resource = 'wood';
    return root;
  }

  animate(time: number, wind: number) {
    for (const object of this.group.children) {
      if (object.name === 'water') object.position.y = -0.08 + Math.sin(time * 0.0007) * 0.035;
      if (object.userData.resource === 'wood') object.rotation.z = Math.sin(time * 0.0012 + object.position.x * 0.2 + object.position.z * 0.1) * Math.min(0.025, wind * 0.015);
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
    return (a * (1 - dx) + b * dx) * (1 - dz) + (c * (1 - dx) + d * dx) * dz;
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
    for (const chunk of this.chunks.values()) {
      const geometry = chunk.terrain.geometry;
      const pos = geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setY(i, this.vertexHeight(pos.getX(i), pos.getZ(i)));
      pos.needsUpdate = true;
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();
    }
  }

  snapshot() { return Object.fromEntries(this.terrainMod); }

  restore(modifications: Record<string, number>) {
    this.terrainMod = new Map(Object.entries(modifications));
    this.refreshTerrain();
  }
}
