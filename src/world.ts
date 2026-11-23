import * as THREE from 'three';

export type Biome = 'ocean' | 'beach' | 'grass' | 'forest' | 'rock';

export function seededNoise(x: number, z: number, seed: number) {
  let n = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

export function terrainHeight(x: number, z: number, seed: number) {
  const island = 1 - Math.min(1, Math.sqrt(x * x + z * z) / 38);
  const broad = Math.sin(x * 0.055 + seed) * 1.2 + Math.cos(z * 0.047 + seed * 0.7) * 1.1;
  const detail = (seededNoise(Math.floor(x / 3), Math.floor(z / 3), seed) - 0.5) * 1.2;
  return Math.max(-2.5, island * 3.5 + broad + detail);
}

export function biomeAt(x: number, z: number, seed: number): Biome {
  const h = terrainHeight(x, z, seed);
  if (h < -0.15) return 'ocean';
  if (h < 0.45) return 'beach';
  const n = seededNoise(Math.floor(x / 5), Math.floor(z / 5), seed);
  if (h > 4.4) return 'rock';
  if (n > 0.48) return 'forest';
  return 'grass';
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

export class World {
  readonly group = new THREE.Group();
  readonly seed: number;
  private terrainMod = new Map<string, number>();
  private depleted = new Set<string>();
  private geometry!: THREE.BufferGeometry;
  private mesh!: THREE.Mesh;
  private season = '';
  private baseColors: Float32Array = new Float32Array();
  readonly size = 96;
  readonly step = 1;

  constructor(seed: number) {
    this.seed = seed;
    this.build();
  }

  setSeason(season: 'Spring' | 'Summer' | 'Autumn' | 'Winter') {
    if (season === this.season) return;
    this.season = season;
    const terrain = this.mesh.material as THREE.MeshStandardMaterial;
    terrain.color.set(season === 'Autumn' ? '#f2d1a6' : '#ffffff');
    const colors = this.geometry.attributes.color;
    const positions = this.geometry.attributes.position;
    const snow = new THREE.Color('#d7e5df');
    for (let i = 0; i < colors.count; i++) {
      const base = new THREE.Color().setRGB(this.baseColors[i * 3], this.baseColors[i * 3 + 1], this.baseColors[i * 3 + 2]);
      if (season === 'Winter' && positions.getY(i) > 0.45) base.lerp(snow, 0.75);
      colors.setXYZ(i, base.r, base.g, base.b);
    }
    colors.needsUpdate = true;
    for (const object of this.group.children) {
      if (object.userData.resource !== 'wood') continue;
      object.children.forEach((child, index) => {
        if (index === 0 || !(child instanceof THREE.Mesh) || !(child.material instanceof THREE.MeshStandardMaterial)) return;
        const colors = season === 'Autumn' ? ['#bb8a4e', '#a96b43', '#c39856']
          : season === 'Winter' ? ['#a6c1b6', '#789b91', '#cad8cd']
          : ['#4f8152', '#3f7350', '#668f55'];
        child.material.color.set(colors[index - 1]);
      });
    }
  }

  private build() {
    const segments = this.size / this.step;
    const geometry = new THREE.PlaneGeometry(this.size, this.size, segments, segments);
    geometry.rotateX(-Math.PI / 2);
    const pos = geometry.attributes.position;
    const colors: number[] = [];
    const color = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      let y = terrainHeight(x, z, this.seed);
      y += this.terrainMod.get(`${Math.round(x)},${Math.round(z)}`) ?? 0;
      pos.setY(i, y);
      const biome = biomeAt(x, z, this.seed);
      if (biome === 'ocean') color.set('#287b86');
      else if (biome === 'beach') color.set('#d8c58a');
      else if (biome === 'rock') color.set('#718084');
      else if (biome === 'forest') color.set(i % 3 ? '#4d7d51' : '#5b8e58');
      else color.set(i % 4 ? '#70a65a' : '#7db064');
      colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.baseColors = new Float32Array(colors);
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.receiveShadow = true;
    this.group.add(this.mesh);
    this.geometry = geometry;

    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(this.size, this.size),
      new THREE.MeshPhysicalMaterial({ color: '#56aeb8', transparent: true, opacity: 0.72, roughness: 0.18, metalness: 0.05 })
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = -0.08;
    water.receiveShadow = true;
    water.name = 'water';
    this.group.add(water);

    this.addNature();
  }

  private addNature() {
    for (let z = -43; z <= 43; z += 3) {
      for (let x = -43; x <= 43; x += 3) {
        const px = x + (seededNoise(x, z, this.seed) - 0.5);
        const pz = z + (seededNoise(z, x, this.seed + 3) - 0.5);
        const h = terrainHeight(px, pz, this.seed);
        const biome = biomeAt(px, pz, this.seed);
        if (h > 0.35 && biome === 'forest' && seededNoise(x, z, this.seed + 8) > 0.42) {
          const tree = this.tree(px, h, pz);
          tree.userData.resourceId = `${x},${z}`;
          this.group.add(tree);
        } else if (h > 0.1 && biome !== 'ocean' && seededNoise(x + 4, z + 9, this.seed) > 0.76) {
          const rock = new THREE.Mesh(
            new THREE.DodecahedronGeometry(0.25 + seededNoise(x, z, this.seed) * 0.45, 0),
            new THREE.MeshStandardMaterial({ color: '#7c8580', roughness: 1 })
          );
          rock.position.set(px, h + 0.12, pz);
          rock.castShadow = true;
          rock.userData.resource = 'stone';
          rock.userData.resourceId = `${x},${z}`;
          this.group.add(rock);
        } else if (h > 0.45 && seededNoise(x + 12, z - 7, this.seed) > 0.8) {
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
          bush.userData.resourceId = `${x},${z}`;
          this.group.add(bush);
        }
      }
    }
  }

  findNearest(x: number, z: number, range: number, resource?: 'wood' | 'stone' | 'food') {
    let nearest: THREE.Object3D | undefined;
    let distance = range;
    for (const object of this.group.children) {
      if (!object.userData.resource) continue;
      if (resource && object.userData.resource !== resource) continue;
      const d = Math.hypot(object.position.x - x, object.position.z - z);
      if (d < distance) { distance = d; nearest = object; }
    }
    return nearest;
  }

  gatherNearest(x: number, z: number, range: number, resource?: 'wood' | 'stone' | 'food') {
    const nearest = this.findNearest(x, z, range, resource);
    if (!nearest) return undefined;
    const kind = nearest.userData.resource as 'wood' | 'stone' | 'food';
    const position = nearest.position.clone();
    this.depleted.add(nearest.userData.resourceId as string);
    this.group.remove(nearest);
    disposeObject(nearest);
    return { resource: kind, position };
  }

  depletedSnapshot() {
    return [...this.depleted];
  }

  restoreDepleted(ids: string[]) {
    this.depleted = new Set(ids);
    for (const object of [...this.group.children]) {
      if (object.userData.resourceId && this.depleted.has(object.userData.resourceId as string)) {
        this.group.remove(object);
        disposeObject(object);
      }
    }
  }

  dispose() {
    disposeObject(this.group);
  }

  private tree(x: number, y: number, z: number) {
    const root = new THREE.Group();
    root.position.set(x, y, z);
    root.scale.setScalar(0.75 + seededNoise(x, z, this.seed) * 0.65);
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.28, 1.5, 7),
      new THREE.MeshStandardMaterial({ color: '#806044', roughness: 1 })
    );
    trunk.position.y = 0.75;
    trunk.castShadow = true;
    root.add(trunk);
    const crownColors = ['#4f8152', '#3f7350', '#668f55'];
    for (let i = 0; i < 3; i++) {
      const crown = new THREE.Mesh(
        new THREE.ConeGeometry(0.95 - i * 0.12, 1.45, 7),
        new THREE.MeshStandardMaterial({ color: crownColors[i], roughness: 0.9 })
      );
      crown.position.y = 1.55 + i * 0.55;
      crown.castShadow = true;
      root.add(crown);
    }
    root.userData.resource = 'wood';
    return root;
  }

  heightAt(x: number, z: number) {
    const x0 = Math.floor(x);
    const z0 = Math.floor(z);
    const dx = x - x0;
    const dz = z - z0;
    const vertex = (vx: number, vz: number) => terrainHeight(vx, vz, this.seed) + (this.terrainMod.get(`${vx},${vz}`) ?? 0);
    const a = vertex(x0, z0);
    const b = vertex(x0 + 1, z0);
    const c = vertex(x0, z0 + 1);
    const d = vertex(x0 + 1, z0 + 1);
    return (a * (1 - dx) + b * dx) * (1 - dz) + (c * (1 - dx) + d * dx) * dz;
  }

  dig(x: number, z: number) {
    const key = `${Math.round(x)},${Math.round(z)}`;
    const current = this.terrainMod.get(key) ?? 0;
    this.terrainMod.set(key, Math.max(-1.8, current - 0.35));
    this.refreshTerrain();
  }

  private refreshTerrain() {
    const pos = this.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, terrainHeight(x, z, this.seed) + (this.terrainMod.get(`${Math.round(x)},${Math.round(z)}`) ?? 0));
    }
    pos.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }

  snapshot() {
    return Object.fromEntries(this.terrainMod);
  }

  restore(modifications: Record<string, number>) {
    this.terrainMod = new Map(Object.entries(modifications));
    this.refreshTerrain();
  }
}
