import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FLOOR_HEIGHT, type PieceKind, type StructuralPiece } from './construction';
import { ShelterIndex } from './shelter';
import { occludingPieces, type OcclusionBatch } from './construction-occlusion';
import type { SurfacePaint } from './paint';
import { CHUNK_SIZE, planetPositionToGeographic, PlanetTangentFrame } from './planet';
import { geographicDistanceMeters, transportBearing } from './geography';

type Part = { offset: [number, number, number]; size: [number, number, number]; color: string; opacity?: number };
// Match the shader's float32 cutoff so neither pass drops a boundary value.
const opaqueThreshold = Math.fround(0.999);
const parts: Record<PieceKind, Part[]> = {
  floor: [{ offset: [0, 0.09, 0], size: [1.96, 0.18, 1.96], color: '#91663e' }],
  wall: [{ offset: [0, 1.15, 0], size: [1.96, 2.3, 0.16], color: '#a6784d' }],
  doorframe: [
    { offset: [-0.88, 1.15, 0], size: [0.24, 2.3, 0.2], color: '#725039' },
    { offset: [0.88, 1.15, 0], size: [0.24, 2.3, 0.2], color: '#725039' },
    { offset: [0, 2.18, 0], size: [1.6, 0.24, 0.2], color: '#725039' },
  ],
  door: [{ offset: [0, 1.02, 0], size: [1.45, 2.04, 0.13], color: '#64412a' }],
  windowframe: [
    { offset: [-0.82, 1.15, 0], size: [0.32, 2.3, 0.18], color: '#a6784d' },
    { offset: [0.82, 1.15, 0], size: [0.32, 2.3, 0.18], color: '#a6784d' },
    { offset: [0, 0.42, 0], size: [1.32, 0.84, 0.18], color: '#a6784d' },
    { offset: [0, 2.06, 0], size: [1.32, 0.48, 0.18], color: '#a6784d' },
    { offset: [0, 0.87, 0], size: [1.34, 0.10, 0.24], color: '#725039' },
  ],
  window: [{ offset: [0, 1.43, 0], size: [1.24, 1.02, 0.06], color: '#99d6dc', opacity: 0.38 }],
  roof: [{ offset: [0, FLOOR_HEIGHT, 0], size: [1.96, 0.16, 1.96], color: '#704c38' }],
  stairs: Array.from({ length: 8 }, (_, index) => {
    const height = (index + 1) * FLOOR_HEIGHT / 8;
    return { offset: [0, height / 2, -0.875 + index * 0.25], size: [1.8, height, 0.25], color: '#91663e' } as Part;
  }),
};

export function createPieceGhost(kind: PieceKind) {
  const group = new THREE.Group();
  for (const part of parts[kind]) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...part.size), new THREE.MeshStandardMaterial({ color: part.color }));
    mesh.position.set(...part.offset);
    group.add(mesh);
  }
  return group;
}

function pitchedGeometry(piece: StructuralPiece, sides: boolean[]) {
  const { axis, heights } = piece.roofShape!;
  const positions: number[] = [];
  const uvs: number[] = [];
  const vertex = (cross: number, along: number, height: number) =>
    axis === 0 ? [cross, height, along] : [along, height, cross];
  const quad = (a: number[], b: number[], c: number[], d: number[], projection: 'roof' | 'cross' | 'along') => {
    // Swapping the horizontal axes reflects the geometry, so its winding must reverse.
    for (const point of axis === 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c]) {
      const cross = axis === 0 ? point[0] : point[2];
      const along = axis === 0 ? point[2] : point[0];
      positions.push(...point);
      if (projection === 'roof') uvs.push((along + 1) / 2, (cross + 1) / 2);
      else uvs.push(((projection === 'cross' ? cross : along) + 1) / 2, (point[1] + 0.12) / 2);
    }
  };
  for (let i = 0; i < 2; i++) {
    const left = i - 1, right = i;
    const a = vertex(left, -1, heights[i]), b = vertex(right, -1, heights[i + 1]);
    const c = vertex(right, 1, heights[i + 1]), d = vertex(left, 1, heights[i]);
    quad(a, d, c, b, 'roof');
    const underside = (point: number[]) => [point[0], point[1] - 0.12, point[2]];
    quad(underside(a), underside(b), underside(c), underside(d), 'roof');
    if (sides[0]) quad(vertex(left, -1, -0.12), a, b, vertex(right, -1, -0.12), 'cross');
    if (sides[1]) quad(vertex(right, 1, -0.12), c, d, vertex(left, 1, -0.12), 'cross');
  }
  if (sides[2]) quad(vertex(-1, -1, -0.12), vertex(-1, 1, -0.12), vertex(-1, 1, heights[0]), vertex(-1, -1, heights[0]), 'along');
  if (sides[3]) quad(vertex(1, 1, -0.12), vertex(1, -1, -0.12), vertex(1, -1, heights[2]), vertex(1, 1, heights[2]), 'along');
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

function framedWallGeometry() {
  const panel = new THREE.BoxGeometry(1, 1, 1);
  const pieces = [panel];
  for (const [x, y, width, height] of [
    [-0.475, 0, 0.05, 1], [0.475, 0, 0.05, 1],
    [0, -0.475, 0.9, 0.05], [0, 0.475, 0.9, 0.05],
  ]) {
    const trim = new THREE.BoxGeometry(width, height, 1.15);
    trim.translate(x, y, 0);
    const uv = trim.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.12 + uv.getY(i) * 0.7, 0.15 + uv.getX(i) * 0.045);
    pieces.push(trim);
  }
  pieces.forEach((geometry, index) => {
    const shade = index ? 0.67 : 1;
    const colors = new Float32Array(geometry.getAttribute('position').count * 3).fill(shade);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  });
  const merged = mergeGeometries(pieces);
  pieces.forEach(geometry => geometry.dispose());
  if (!merged) throw new Error('Unable to build framed wall geometry');
  return merged;
}

function constructionTexture(name: string, fallback: string, color = false) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to create construction fallback texture');
  context.fillStyle = fallback;
  context.fillRect(0, 0, 1, 1);
  const texture = new THREE.CanvasTexture(canvas);
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  const path = `${import.meta.env.BASE_URL}assets/environment/construction/weathered-wood-${name}.jpg`;
  const pending = new THREE.TextureLoader().load(path, loaded => {
    texture.dispose();
    texture.image = loaded.image;
    texture.needsUpdate = true;
    loaded.dispose();
  }, undefined, error => {
    console.error(`Failed to load construction texture ${path}`, error);
    pending.dispose();
  });
  return texture;
}

export class ConstructionRenderer {
  readonly group = new THREE.Group();
  readonly shelter = new ShelterIndex();
  private readonly geometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly wallGeometry = framedWallGeometry();
  private woodTextures: { color: THREE.Texture; normal: THREE.Texture } | null = null;
  private roofGeometries: THREE.BufferGeometry[] = [];
  private roofBatches: Array<{ geometry: THREE.BufferGeometry; pieces: StructuralPiece[]; opaque: THREE.InstancedMesh; faded: THREE.InstancedMesh }> = [];
  private occlusionBatches: OcclusionBatch[] = [];
  private fadedFloorBatches: OcclusionBatch[] = [];
  private occlusionGeometries: THREE.BufferGeometry[] = [];
  private occlusionOpacity = new Map<string, number>();
  private occludedPieces = new Set<string>();
  private occlusionTimer = 0;
  private readonly roofMaterial = new THREE.MeshStandardMaterial({ color: '#704c38', roughness: 0.88 });
  private readonly fadedRoofMaterial = new THREE.MeshStandardMaterial({ color: '#704c38', roughness: 0.88, transparent: true, depthWrite: false });
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>();
  private meshes: THREE.InstancedMesh[] = [];
  private doors: Array<{ piece: StructuralPiece; mesh: THREE.InstancedMesh; index: number }> = [];
  private angles = new Map<string, number>();
  private roofOpacity = new Map<string, number>();
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly occlusionPlayer = new THREE.Vector3();
  private readonly occlusionCamera = new THREE.Vector3();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private tangentFrame: PlanetTangentFrame | null = null;
  private pieces: readonly StructuralPiece[] = [];
  private paints: readonly SurfacePaint[] = [];

  constructor() {
    this.addOpacityShader(this.roofMaterial, 'opaque');
    this.addOpacityShader(this.fadedRoofMaterial, 'faded');
  }

  setTangentFrame(frame: PlanetTangentFrame | null) {
    this.tangentFrame = frame;
    this.refresh(this.pieces, this.paints);
  }

  private positionInFrame(x: number, z: number) {
    return this.tangentFrame?.toLocal({ x, z }) ?? { x, z };
  }

  private rotationInFrame(piece: StructuralPiece) {
    const rotation = piece.rotation * Math.PI / 2;
    if (!this.tangentFrame) return rotation;
    const geographic = planetPositionToGeographic(piece.x, piece.z);
    return THREE.MathUtils.degToRad(transportBearing(geographic, this.tangentFrame.origin, piece.rotation * 90 + 90) - 90);
  }

  private addOpacityShader(material: THREE.MeshStandardMaterial, mode: 'transparent' | 'opaque' | 'faded' = 'transparent') {
    material.customProgramCacheKey = () => `construction-${mode}`;
    material.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float instanceOpacity;\nvarying float roofOpacity;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nroofOpacity = instanceOpacity;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float roofOpacity;')
        .replace('#include <color_fragment>', mode === 'opaque'
          ? '#include <color_fragment>\nif (roofOpacity < 0.999) discard;'
          : mode === 'faded'
            ? '#include <color_fragment>\nif (roofOpacity >= 0.999) discard;\ndiffuseColor.a *= roofOpacity;'
            : '#include <color_fragment>\ndiffuseColor.a *= roofOpacity;');
    };
  }

  refresh(pieces: readonly StructuralPiece[], paints: readonly SurfacePaint[] = []) {
    this.pieces = pieces;
    this.paints = paints;
    this.shelter.refresh(pieces);
    const visiblePieces = this.tangentFrame
      ? pieces.filter(piece => geographicDistanceMeters(this.tangentFrame!.origin, planetPositionToGeographic(piece.x, piece.z)) < 1000)
      : pieces;
    if (!this.woodTextures && typeof document !== 'undefined'
        && visiblePieces.some(piece => ['floor', 'wall', 'door', 'roof'].includes(piece.kind))) {
      this.woodTextures = {
        color: constructionTexture('color', '#ffffff', true),
        normal: constructionTexture('normal', '#8080ff'),
      };
      for (const material of [this.roofMaterial, this.fadedRoofMaterial]) {
        material.map = this.woodTextures.color;
        material.normalMap = this.woodTextures.normal;
        material.normalScale.set(0.55, 0.55);
        material.needsUpdate = true;
      }
    }
    for (const mesh of this.meshes) { this.group.remove(mesh); mesh.dispose(); }
    this.roofGeometries.forEach(geometry => geometry.dispose());
    this.occlusionGeometries.forEach(geometry => geometry.dispose());
    this.roofGeometries = [];
    this.occlusionGeometries = [];
    this.roofBatches = [];
    this.occlusionBatches = [];
    this.fadedFloorBatches = [];
    this.occlusionTimer = 0;
    this.meshes = [];
    this.doors = [];
    const activeDoors = new Set(pieces.filter(piece => piece.kind === 'door').map(piece => piece.id));
    for (const id of this.angles.keys()) if (!activeDoors.has(id)) this.angles.delete(id);
    const activeRoofs = new Set(pieces.filter(piece => piece.kind === 'roof').map(piece => piece.id));
    for (const id of this.roofOpacity.keys()) if (!activeRoofs.has(id)) this.roofOpacity.delete(id);
    const activeOccluders = new Set(pieces.filter(piece => ['floor', 'wall', 'doorframe', 'door', 'windowframe', 'window'].includes(piece.kind)).map(piece => piece.id));
    for (const id of this.occlusionOpacity.keys()) if (!activeOccluders.has(id)) this.occlusionOpacity.delete(id);
    for (const kind of Object.keys(parts) as PieceKind[]) {
      const selected = visiblePieces.filter(piece => piece.kind === kind && (kind !== 'roof' || !piece.roofShape));
      if (!selected.length) continue;
      for (const part of parts[kind]) {
        const occluder = kind === 'floor' || kind === 'wall' || kind === 'doorframe' || kind === 'door' || kind === 'windowframe' || kind === 'window';
        const paintedGroups = new Map<string, { color: string; x: number; z: number; pieces: StructuralPiece[] }>();
        for (const piece of selected) {
          const paint = paints.find(item => item.pieceId === piece.id);
          const color = paint?.color ?? part.color;
          const x = Math.floor(piece.x / CHUNK_SIZE) * CHUNK_SIZE;
          const z = Math.floor(piece.z / CHUNK_SIZE) * CHUNK_SIZE;
          const key = `${color}:${x}:${z}`;
          const group = paintedGroups.get(key) ?? { color, x, z, pieces: [] };
          group.pieces.push(piece);
          paintedGroups.set(key, group);
        }
        for (const group of paintedGroups.values()) {
        const textured = kind === 'floor' || kind === 'wall' || kind === 'door';
        const framed = kind === 'wall';
        const materialKey = `${group.color}:${part.opacity ?? 1}:${occluder}:${kind === 'floor'}:${textured}:${framed}`;
        let material = this.materials.get(materialKey);
        if (!material) {
          const floor = kind === 'floor';
          material = new THREE.MeshStandardMaterial({ color: group.color, roughness: part.opacity ? 0.2 : 0.88,
            map: textured ? this.woodTextures?.color ?? null : null, normalMap: textured ? this.woodTextures?.normal ?? null : null,
            normalScale: new THREE.Vector2(0.55, 0.55), vertexColors: framed,
            transparent: (occluder && !floor) || part.opacity !== undefined, opacity: part.opacity ?? 1,
            depthWrite: floor || (!occluder && part.opacity === undefined) });
          if (occluder) this.addOpacityShader(material, floor ? 'opaque' : 'transparent');
          this.materials.set(materialKey, material);
        }
        const sourceGeometry = framed ? this.wallGeometry : this.geometry;
        let geometry: THREE.BufferGeometry = sourceGeometry;
        if (kind === 'roof') {
          geometry = this.geometry.clone();
          geometry.setAttribute('instanceOpacity', new THREE.InstancedBufferAttribute(new Float32Array(group.pieces.map(piece => this.roofOpacity.get(piece.id) ?? 1)), 1));
          this.roofGeometries.push(geometry);
          material = this.roofMaterial;
        } else if (occluder) {
          geometry = sourceGeometry.clone();
          geometry.setAttribute('instanceOpacity', new THREE.InstancedBufferAttribute(new Float32Array(group.pieces.map(piece => this.occlusionOpacity.get(piece.id) ?? 1)), 1));
          this.occlusionGeometries.push(geometry);
        }
        const mesh = new THREE.InstancedMesh(geometry, material, group.pieces.length);
        const origin = this.positionInFrame(group.x, group.z);
        mesh.position.set(origin.x, 0, origin.z);
        mesh.userData.constructionKind = kind;
        mesh.castShadow = kind !== 'roof';
        mesh.receiveShadow = true;
        group.pieces.forEach((piece, index) => {
          if (kind === 'door') {
            if (!this.angles.has(piece.id)) this.angles.set(piece.id, piece.open ? Math.PI / 2 : 0);
            this.doors.push({ piece, mesh, index });
          }
          this.setMatrix(mesh, index, piece, part, this.angles.get(piece.id) ?? 0);
        });
        mesh.instanceMatrix.needsUpdate = true;
        this.group.add(mesh);
        this.meshes.push(mesh);
        if (kind === 'roof') this.addRoofBatch(mesh, group.pieces);
        if (occluder) this.occlusionBatches.push({ mesh, pieces: group.pieces });
        if (kind === 'floor') {
          const fadeKey = `${group.color}:floor-faded`;
          let fadedMaterial = this.materials.get(fadeKey);
          if (!fadedMaterial) {
            fadedMaterial = new THREE.MeshStandardMaterial({ color: group.color, roughness: 0.88,
              map: this.woodTextures?.color ?? null, normalMap: this.woodTextures?.normal ?? null, normalScale: new THREE.Vector2(0.55, 0.55),
              transparent: true, depthWrite: false });
            this.addOpacityShader(fadedMaterial, 'faded');
            this.materials.set(fadeKey, fadedMaterial);
          }
          const faded = new THREE.InstancedMesh(geometry, fadedMaterial, group.pieces.length);
          faded.position.copy(mesh.position);
          faded.instanceMatrix.copy(mesh.instanceMatrix);
          faded.instanceMatrix.needsUpdate = true;
          faded.receiveShadow = true;
          faded.visible = group.pieces.some(piece => (this.occlusionOpacity.get(piece.id) ?? 1) < 0.999);
          this.group.add(faded);
          this.meshes.push(faded);
          this.fadedFloorBatches.push({ mesh: faded, pieces: group.pieces });
        }
        }
      }
    }
    const pitched = visiblePieces.filter(piece => piece.kind === 'roof' && piece.roofShape);
    const roofSlots = new Map(pieces.filter(piece => piece.kind === 'roof').map(piece => [`${piece.x},${piece.z},${piece.y.toFixed(2)}`, piece]));
    const heightAt = (piece: StructuralPiece, x: number, z: number) => {
      if (!piece.roofShape) return 0;
      const { axis, heights } = piece.roofShape;
      const offset = axis === 0 ? x - piece.x : z - piece.z;
      return offset < 0 ? heights[0] + (heights[1] - heights[0]) * (offset + 1)
        : heights[1] + (heights[2] - heights[1]) * offset;
    };
    const batches = new Map<string, { piece: StructuralPiece; sides: boolean[]; x: number; z: number; pieces: StructuralPiece[] }>();
    for (const piece of pitched) {
      const alongX = piece.roofShape!.axis === 1;
      const neighbors = alongX ? [[-2, 0], [2, 0], [0, -2], [0, 2]] : [[0, -2], [0, 2], [-2, 0], [2, 0]];
      const sides = neighbors.map(([dx, dz]) => {
        const neighbor = roofSlots.get(`${piece.x + dx},${piece.z + dz},${piece.y.toFixed(2)}`);
        if (!neighbor) return true;
        return [-1, 0, 1].some(offset => {
          const x = piece.x + dx / 2 + (dz ? offset : 0);
          const z = piece.z + dz / 2 + (dx ? offset : 0);
          return Math.abs(heightAt(piece, x, z) - heightAt(neighbor, x, z)) > 0.0001;
        });
      });
      const x = Math.floor(piece.x / CHUNK_SIZE) * CHUNK_SIZE;
      const z = Math.floor(piece.z / CHUNK_SIZE) * CHUNK_SIZE;
      const key = `${JSON.stringify(piece.roofShape)}:${sides.join(',')}:${x}:${z}`;
      const batch = batches.get(key) ?? { piece, sides, x, z, pieces: [] };
      batch.pieces.push(piece);
      batches.set(key, batch);
    }
    for (const batch of batches.values()) {
      const geometry = pitchedGeometry(batch.piece, batch.sides);
      geometry.setAttribute('instanceOpacity', new THREE.InstancedBufferAttribute(new Float32Array(batch.pieces.map(piece => this.roofOpacity.get(piece.id) ?? 1)), 1));
      const mesh = new THREE.InstancedMesh(geometry, this.roofMaterial, batch.pieces.length);
      const origin = this.positionInFrame(batch.x, batch.z);
      mesh.position.set(origin.x, 0, origin.z);
      mesh.userData.constructionKind = 'roof';
      batch.pieces.forEach((piece, index) => {
        const point = this.positionInFrame(piece.x, piece.z);
        this.position.set(point.x - origin.x, piece.y + FLOOR_HEIGHT, point.z - origin.z);
        this.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.rotationInFrame({ ...piece, rotation: 0 }));
        this.matrix.compose(this.position, this.quaternion, new THREE.Vector3(1, 1, 1));
        mesh.setMatrixAt(index, this.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.meshes.push(mesh);
      this.roofGeometries.push(geometry);
      this.addRoofBatch(mesh, batch.pieces);
    }
  }

  private addRoofBatch(mesh: THREE.InstancedMesh, pieces: StructuralPiece[]) {
    const faded = new THREE.InstancedMesh(mesh.geometry, this.fadedRoofMaterial, pieces.length);
    faded.position.copy(mesh.position);
    faded.quaternion.copy(mesh.quaternion);
    faded.scale.copy(mesh.scale);
    faded.instanceMatrix.copy(mesh.instanceMatrix);
    faded.instanceMatrix.needsUpdate = true;
    faded.receiveShadow = true;
    const opacity = mesh.geometry.getAttribute('instanceOpacity');
    mesh.visible = pieces.some((_, index) => opacity.getX(index) >= opaqueThreshold);
    faded.visible = pieces.some((_, index) => opacity.getX(index) < opaqueThreshold);
    this.group.add(faded);
    this.meshes.push(faded);
    this.roofBatches.push({ geometry: mesh.geometry, pieces, opaque: mesh, faded });
  }

  update(dt: number, player: THREE.Vector3, camera?: THREE.Vector3, renderOrigin?: THREE.Vector3) {
    const changedDoors = new Set<THREE.InstancedMesh>();
    for (const { piece, mesh, index } of this.doors) {
      const current = this.angles.get(piece.id) ?? 0;
      const target = piece.open ? Math.PI / 2 : 0;
      const next = THREE.MathUtils.damp(current, target, 8, dt);
      if (Math.abs(current - target) < 0.001) continue;
      this.angles.set(piece.id, next);
      this.setMatrix(mesh, index, piece, parts.door[0], next);
      mesh.instanceMatrix.needsUpdate = true;
      changedDoors.add(mesh);
    }
    for (const mesh of changedDoors) mesh.computeBoundingSphere();
    this.occlusionTimer -= dt;
    if (camera && this.occlusionTimer <= 0) {
      this.group.updateMatrixWorld(true);
      this.occlusionPlayer.copy(player);
      this.occlusionCamera.copy(camera);
      if (this.tangentFrame) {
        const playerPoint = this.positionInFrame(player.x, player.z);
        const cameraPoint = this.positionInFrame(camera.x, camera.z);
        this.occlusionPlayer.set(playerPoint.x, player.y, playerPoint.z);
        this.occlusionCamera.set(cameraPoint.x, camera.y, cameraPoint.z);
      } else if (renderOrigin) {
        this.occlusionPlayer.sub(renderOrigin);
        this.occlusionCamera.sub(renderOrigin);
      }
      this.occludedPieces = occludingPieces(this.occlusionBatches, this.occlusionCamera, this.occlusionPlayer);
      this.occlusionTimer = 0.1;
    }
    const nextOpacity = new Map<string, number>();
    for (const batch of this.occlusionBatches) {
      const opacity = batch.mesh.geometry.getAttribute('instanceOpacity');
      batch.pieces.forEach((piece, index) => {
        let next = nextOpacity.get(piece.id);
        if (next === undefined) {
          next = THREE.MathUtils.damp(this.occlusionOpacity.get(piece.id) ?? 1, this.occludedPieces.has(piece.id) ? 0.16 : 1, 8, dt);
          nextOpacity.set(piece.id, next);
          this.occlusionOpacity.set(piece.id, next);
        }
        opacity.setX(index, next);
      });
      opacity.needsUpdate = true;
    }
    for (const batch of this.fadedFloorBatches) {
      batch.mesh.visible = batch.pieces.some(piece => (this.occlusionOpacity.get(piece.id) ?? 1) < 0.999);
    }
    const room = this.shelter.roomAt(player.x, player.y, player.z);
    for (const batch of this.roofBatches) {
      const opacity = batch.geometry.getAttribute('instanceOpacity');
      let opaque = false;
      let faded = false;
      batch.pieces.forEach((piece, index) => {
        const target = room && Math.abs(piece.y - room.y) < 0.05 && room.cells.has(`${piece.x},${piece.z}`)
          && (!camera || camera.y > piece.y + FLOOR_HEIGHT) ? 0.2 : 1;
        const next = THREE.MathUtils.damp(this.roofOpacity.get(piece.id) ?? 1, target, 4, dt);
        this.roofOpacity.set(piece.id, next);
        opacity.setX(index, next);
        const stored = opacity.getX(index);
        opaque ||= stored >= opaqueThreshold;
        faded ||= stored < opaqueThreshold;
      });
      opacity.needsUpdate = true;
      batch.opaque.visible = opaque;
      batch.faded.visible = faded;
    }
  }

  private setMatrix(mesh: THREE.InstancedMesh, index: number, piece: StructuralPiece, part: Part, doorAngle: number) {
    const rotation = this.rotationInFrame(piece);
    const offset = new THREE.Vector3(...part.offset);
    if (piece.kind === 'door') {
      offset.x += 0.725;
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), doorAngle);
      offset.x -= 0.725;
    }
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation);
    const point = this.positionInFrame(piece.x, piece.z);
    this.position.set(point.x - mesh.position.x + offset.x, piece.y + offset.y, point.z - mesh.position.z + offset.z);
    this.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotation + doorAngle);
    this.scale.set(...part.size);
    this.matrix.compose(this.position, this.quaternion, this.scale);
    mesh.setMatrixAt(index, this.matrix);
  }
}
