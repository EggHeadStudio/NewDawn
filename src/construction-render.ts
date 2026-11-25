import * as THREE from 'three';
import { FLOOR_HEIGHT, type PieceKind, type StructuralPiece } from './construction';
import { ShelterIndex } from './shelter';
import { occludingPieces, type OcclusionBatch } from './construction-occlusion';
import type { SurfacePaint } from './paint';

type Part = { offset: [number, number, number]; size: [number, number, number]; color: string; opacity?: number };
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
  const vertex = (cross: number, along: number, height: number) =>
    axis === 0 ? [cross, height, along] : [along, height, cross];
  const triangle = (a: number[], b: number[], c: number[]) => positions.push(...a, ...b, ...c);
  const quad = (a: number[], b: number[], c: number[], d: number[]) => { triangle(a, b, c); triangle(a, c, d); };
  for (let i = 0; i < 2; i++) {
    const left = i - 1, right = i;
    const a = vertex(left, -1, heights[i]), b = vertex(right, -1, heights[i + 1]);
    const c = vertex(right, 1, heights[i + 1]), d = vertex(left, 1, heights[i]);
    quad(a, d, c, b);
    const underside = (point: number[]) => [point[0], point[1] - 0.12, point[2]];
    quad(underside(a), underside(b), underside(c), underside(d));
    if (sides[0]) quad(vertex(left, -1, -0.12), a, b, vertex(right, -1, -0.12));
    if (sides[1]) quad(vertex(right, 1, -0.12), c, d, vertex(left, 1, -0.12));
  }
  if (sides[2]) quad(vertex(-1, -1, -0.12), vertex(-1, 1, -0.12), vertex(-1, 1, heights[0]), vertex(-1, -1, heights[0]));
  if (sides[3]) quad(vertex(1, 1, -0.12), vertex(1, -1, -0.12), vertex(1, -1, heights[2]), vertex(1, 1, heights[2]));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export class ConstructionRenderer {
  readonly group = new THREE.Group();
  readonly shelter = new ShelterIndex();
  private readonly geometry = new THREE.BoxGeometry(1, 1, 1);
  private roofGeometries: THREE.BufferGeometry[] = [];
  private roofBatches: Array<{ geometry: THREE.BufferGeometry; pieces: StructuralPiece[] }> = [];
  private edgeBatches: OcclusionBatch[] = [];
  private edgeGeometries: THREE.BufferGeometry[] = [];
  private edgeOpacity = new Map<string, number>();
  private occludedEdges = new Set<string>();
  private occlusionTimer = 0;
  private readonly roofMaterial = new THREE.MeshStandardMaterial({ color: '#704c38', roughness: 0.88, transparent: true, depthWrite: false, side: THREE.DoubleSide });
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

  constructor() {
    this.addOpacityShader(this.roofMaterial);
  }

  private addOpacityShader(material: THREE.MeshStandardMaterial) {
    material.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float instanceOpacity;\nvarying float roofOpacity;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nroofOpacity = instanceOpacity;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float roofOpacity;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= roofOpacity;');
    };
  }

  refresh(pieces: readonly StructuralPiece[], paints: readonly SurfacePaint[] = []) {
    this.shelter.refresh(pieces);
    for (const mesh of this.meshes) { this.group.remove(mesh); mesh.dispose(); }
    this.roofGeometries.forEach(geometry => geometry.dispose());
    this.edgeGeometries.forEach(geometry => geometry.dispose());
    this.roofGeometries = [];
    this.edgeGeometries = [];
    this.roofBatches = [];
    this.edgeBatches = [];
    this.occlusionTimer = 0;
    this.meshes = [];
    this.doors = [];
    const activeDoors = new Set(pieces.filter(piece => piece.kind === 'door').map(piece => piece.id));
    for (const id of this.angles.keys()) if (!activeDoors.has(id)) this.angles.delete(id);
    const activeRoofs = new Set(pieces.filter(piece => piece.kind === 'roof').map(piece => piece.id));
    for (const id of this.roofOpacity.keys()) if (!activeRoofs.has(id)) this.roofOpacity.delete(id);
    const activeEdges = new Set(pieces.filter(piece => ['wall', 'doorframe', 'door', 'windowframe', 'window'].includes(piece.kind)).map(piece => piece.id));
    for (const id of this.edgeOpacity.keys()) if (!activeEdges.has(id)) this.edgeOpacity.delete(id);
    for (const kind of Object.keys(parts) as PieceKind[]) {
      const selected = pieces.filter(piece => piece.kind === kind && (kind !== 'roof' || !piece.roofShape));
      if (!selected.length) continue;
      for (const part of parts[kind]) {
        const edge = kind === 'wall' || kind === 'doorframe' || kind === 'door' || kind === 'windowframe' || kind === 'window';
        const paintedGroups = new Map<string, { color: string; pieces: StructuralPiece[] }>();
        for (const piece of selected) {
          const paint = paints.find(item => item.pieceId === piece.id);
          const color = paint?.color ?? part.color;
          const group = paintedGroups.get(color) ?? { color, pieces: [] };
          group.pieces.push(piece);
          paintedGroups.set(color, group);
        }
        for (const group of paintedGroups.values()) {
        const materialKey = `${group.color}:${part.opacity ?? 1}:${edge}`;
        let material = this.materials.get(materialKey);
        if (!material) {
          material = new THREE.MeshStandardMaterial({ color: group.color, roughness: part.opacity ? 0.2 : 0.88,
            transparent: edge || part.opacity !== undefined, opacity: part.opacity ?? 1, depthWrite: !edge && part.opacity === undefined });
          if (edge) this.addOpacityShader(material);
          this.materials.set(materialKey, material);
        }
        let geometry: THREE.BoxGeometry = this.geometry;
        if (kind === 'roof') {
          geometry = this.geometry.clone();
          geometry.setAttribute('instanceOpacity', new THREE.InstancedBufferAttribute(new Float32Array(group.pieces.map(piece => this.roofOpacity.get(piece.id) ?? 1)), 1));
          this.roofGeometries.push(geometry);
          this.roofBatches.push({ geometry, pieces: group.pieces });
          material = this.roofMaterial;
        } else if (edge) {
          geometry = this.geometry.clone();
          geometry.setAttribute('instanceOpacity', new THREE.InstancedBufferAttribute(new Float32Array(group.pieces.map(piece => this.edgeOpacity.get(piece.id) ?? 1)), 1));
          this.edgeGeometries.push(geometry);
        }
        const mesh = new THREE.InstancedMesh(geometry, material, group.pieces.length);
        mesh.userData.constructionKind = kind;
        mesh.castShadow = kind !== 'roof';
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
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
        if (edge) this.edgeBatches.push({ mesh, pieces: group.pieces });
        }
      }
    }
    const pitched = pieces.filter(piece => piece.kind === 'roof' && piece.roofShape);
    const roofSlots = new Map(pieces.filter(piece => piece.kind === 'roof').map(piece => [`${piece.x},${piece.z},${piece.y.toFixed(2)}`, piece]));
    const heightAt = (piece: StructuralPiece, x: number, z: number) => {
      if (!piece.roofShape) return 0;
      const { axis, heights } = piece.roofShape;
      const offset = axis === 0 ? x - piece.x : z - piece.z;
      return offset < 0 ? heights[0] + (heights[1] - heights[0]) * (offset + 1)
        : heights[1] + (heights[2] - heights[1]) * offset;
    };
    const batches = new Map<string, { piece: StructuralPiece; sides: boolean[]; pieces: StructuralPiece[] }>();
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
      const key = `${JSON.stringify(piece.roofShape)}:${sides.join(',')}`;
      const batch = batches.get(key) ?? { piece, sides, pieces: [] };
      batch.pieces.push(piece);
      batches.set(key, batch);
    }
    for (const batch of batches.values()) {
      const geometry = pitchedGeometry(batch.piece, batch.sides);
      geometry.setAttribute('instanceOpacity', new THREE.InstancedBufferAttribute(new Float32Array(batch.pieces.map(piece => this.roofOpacity.get(piece.id) ?? 1)), 1));
      const mesh = new THREE.InstancedMesh(geometry, this.roofMaterial, batch.pieces.length);
      mesh.userData.constructionKind = 'roof';
      batch.pieces.forEach((piece, index) => {
        this.matrix.makeTranslation(piece.x, piece.y + FLOOR_HEIGHT, piece.z);
        mesh.setMatrixAt(index, this.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.meshes.push(mesh);
      this.roofGeometries.push(geometry);
      this.roofBatches.push({ geometry, pieces: batch.pieces });
    }
  }

  update(dt: number, player: THREE.Vector3, camera?: THREE.Vector3, renderOrigin?: THREE.Vector3) {
    for (const { piece, mesh, index } of this.doors) {
      const current = this.angles.get(piece.id) ?? 0;
      const target = piece.open ? Math.PI / 2 : 0;
      const next = THREE.MathUtils.damp(current, target, 8, dt);
      if (Math.abs(current - target) < 0.001) continue;
      this.angles.set(piece.id, next);
      this.setMatrix(mesh, index, piece, parts.door[0], next);
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.occlusionTimer -= dt;
    if (camera && this.occlusionTimer <= 0) {
      this.group.updateMatrixWorld(true);
      this.occlusionPlayer.copy(player);
      this.occlusionCamera.copy(camera);
      if (renderOrigin) {
        this.occlusionPlayer.sub(renderOrigin);
        this.occlusionCamera.sub(renderOrigin);
      }
      this.occludedEdges = occludingPieces(this.edgeBatches, this.occlusionCamera, this.occlusionPlayer);
      this.occlusionTimer = 0.1;
    }
    const nextOpacity = new Map<string, number>();
    for (const batch of this.edgeBatches) {
      const opacity = batch.mesh.geometry.getAttribute('instanceOpacity');
      batch.pieces.forEach((piece, index) => {
        let next = nextOpacity.get(piece.id);
        if (next === undefined) {
          next = THREE.MathUtils.damp(this.edgeOpacity.get(piece.id) ?? 1, this.occludedEdges.has(piece.id) ? 0.16 : 1, 8, dt);
          nextOpacity.set(piece.id, next);
          this.edgeOpacity.set(piece.id, next);
        }
        opacity.setX(index, next);
      });
      opacity.needsUpdate = true;
    }
    const room = this.shelter.roomAt(player.x, player.y, player.z);
    for (const batch of this.roofBatches) {
      const opacity = batch.geometry.getAttribute('instanceOpacity');
      batch.pieces.forEach((piece, index) => {
        const target = room && Math.abs(piece.y - room.y) < 0.05 && room.cells.has(`${piece.x},${piece.z}`)
          && (!camera || camera.y > piece.y + FLOOR_HEIGHT) ? 0.2 : 1;
        const next = THREE.MathUtils.damp(this.roofOpacity.get(piece.id) ?? 1, target, 4, dt);
        this.roofOpacity.set(piece.id, next);
        opacity.setX(index, next);
      });
      opacity.needsUpdate = true;
    }
  }

  private setMatrix(mesh: THREE.InstancedMesh, index: number, piece: StructuralPiece, part: Part, doorAngle: number) {
    const rotation = piece.rotation * Math.PI / 2;
    const offset = new THREE.Vector3(...part.offset);
    if (piece.kind === 'door') {
      offset.x += 0.725;
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), doorAngle);
      offset.x -= 0.725;
    }
    offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation);
    this.position.set(piece.x + offset.x, piece.y + offset.y, piece.z + offset.z);
    this.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotation + doorAngle);
    this.scale.set(...part.size);
    this.matrix.compose(this.position, this.quaternion, this.scale);
    mesh.setMatrixAt(index, this.matrix);
  }
}
