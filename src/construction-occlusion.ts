import * as THREE from 'three';
import type { StructuralPiece } from './construction';

export interface OcclusionBatch {
  mesh: THREE.InstancedMesh;
  pieces: readonly StructuralPiece[];
}

export function occludingPieces(batches: readonly OcclusionBatch[], camera: THREE.Vector3, player: THREE.Vector3) {
  const result = new Set<string>();
  const ray = new THREE.Raycaster();
  const target = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const meshes = batches.map(batch => batch.mesh);
  const byMesh = new Map(batches.map(batch => [batch.mesh, batch.pieces]));
  for (const height of [0.45, 1.05, 1.7]) {
    target.copy(player).y += height;
    direction.subVectors(target, camera);
    const distance = direction.length();
    if (distance < 0.01) continue;
    ray.set(camera, direction.multiplyScalar(1 / distance));
    ray.far = Math.max(0, distance - 0.05);
    for (const hit of ray.intersectObjects(meshes, false)) {
      if (!(hit.object instanceof THREE.InstancedMesh) || hit.instanceId === undefined) continue;
      const piece = byMesh.get(hit.object)?.[hit.instanceId];
      if (piece) result.add(piece.id);
    }
  }
  return result;
}
