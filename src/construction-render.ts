import * as THREE from 'three';
import { FLOOR_HEIGHT, type PieceKind, type StructuralPiece } from './construction';

type Part = { offset: [number, number, number]; size: [number, number, number]; color: string };
const parts: Record<PieceKind, Part[]> = {
  floor: [{ offset: [0, 0.09, 0], size: [1.96, 0.18, 1.96], color: '#91663e' }],
  wall: [{ offset: [0, 1.15, 0], size: [1.96, 2.3, 0.16], color: '#a6784d' }],
  doorframe: [
    { offset: [-0.88, 1.15, 0], size: [0.24, 2.3, 0.2], color: '#725039' },
    { offset: [0.88, 1.15, 0], size: [0.24, 2.3, 0.2], color: '#725039' },
    { offset: [0, 2.18, 0], size: [1.6, 0.24, 0.2], color: '#725039' },
  ],
  door: [{ offset: [0, 1.02, 0], size: [1.45, 2.04, 0.13], color: '#64412a' }],
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

export class ConstructionRenderer {
  readonly group = new THREE.Group();
  private readonly geometry = new THREE.BoxGeometry(1, 1, 1);
  private roofGeometry: THREE.BoxGeometry | null = null;
  private readonly roofMaterial = new THREE.MeshStandardMaterial({ color: '#704c38', roughness: 0.88, transparent: true, depthWrite: false });
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>();
  private meshes: THREE.InstancedMesh[] = [];
  private doors: Array<{ piece: StructuralPiece; mesh: THREE.InstancedMesh; index: number }> = [];
  private angles = new Map<string, number>();
  private roofOpacity = new Map<string, number>();
  private roofs: StructuralPiece[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly quaternion = new THREE.Quaternion();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();

  constructor() {
    this.roofMaterial.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float instanceOpacity;\nvarying float roofOpacity;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nroofOpacity = instanceOpacity;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float roofOpacity;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= roofOpacity;');
    };
  }

  refresh(pieces: readonly StructuralPiece[]) {
    for (const mesh of this.meshes) { this.group.remove(mesh); mesh.dispose(); }
    this.roofGeometry?.dispose();
    this.roofGeometry = null;
    this.meshes = [];
    this.doors = [];
    this.roofs = [];
    const activeDoors = new Set(pieces.filter(piece => piece.kind === 'door').map(piece => piece.id));
    for (const id of this.angles.keys()) if (!activeDoors.has(id)) this.angles.delete(id);
    const activeRoofs = new Set(pieces.filter(piece => piece.kind === 'roof').map(piece => piece.id));
    for (const id of this.roofOpacity.keys()) if (!activeRoofs.has(id)) this.roofOpacity.delete(id);
    for (const kind of Object.keys(parts) as PieceKind[]) {
      const selected = pieces.filter(piece => piece.kind === kind);
      if (!selected.length) continue;
      for (const part of parts[kind]) {
        let material = this.materials.get(part.color);
        if (!material) {
          material = new THREE.MeshStandardMaterial({ color: part.color, roughness: 0.88 });
          this.materials.set(part.color, material);
        }
        let geometry: THREE.BoxGeometry = this.geometry;
        if (kind === 'roof') {
          this.roofGeometry = this.geometry.clone();
          this.roofGeometry.setAttribute('instanceOpacity', new THREE.InstancedBufferAttribute(new Float32Array(selected.map(piece => this.roofOpacity.get(piece.id) ?? 1)), 1));
          this.roofs = selected;
          geometry = this.roofGeometry;
          material = this.roofMaterial;
        }
        const mesh = new THREE.InstancedMesh(geometry, material, selected.length);
        mesh.castShadow = kind !== 'roof';
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        selected.forEach((piece, index) => {
          if (kind === 'door') {
            if (!this.angles.has(piece.id)) this.angles.set(piece.id, piece.open ? Math.PI / 2 : 0);
            this.doors.push({ piece, mesh, index });
          }
          this.setMatrix(mesh, index, piece, part, this.angles.get(piece.id) ?? 0);
        });
        mesh.instanceMatrix.needsUpdate = true;
        this.group.add(mesh);
        this.meshes.push(mesh);
      }
    }
  }

  update(dt: number, player: THREE.Vector3) {
    for (const { piece, mesh, index } of this.doors) {
      const current = this.angles.get(piece.id) ?? 0;
      const target = piece.open ? Math.PI / 2 : 0;
      const next = THREE.MathUtils.damp(current, target, 8, dt);
      if (Math.abs(current - target) < 0.001) continue;
      this.angles.set(piece.id, next);
      this.setMatrix(mesh, index, piece, parts.door[0], next);
      mesh.instanceMatrix.needsUpdate = true;
    }
    const opacity = this.roofGeometry?.getAttribute('instanceOpacity');
    if (opacity) {
      this.roofs.forEach((piece, index) => {
        const height = piece.y + FLOOR_HEIGHT - player.y;
        const target = Math.abs(piece.x - player.x) < 3 && Math.abs(piece.z - player.z) < 3 && height > 1 && height < 4 ? 0.2 : 1;
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
