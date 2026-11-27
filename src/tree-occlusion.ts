import * as THREE from 'three';

export class FoliageClearance {
  readonly camera = { value: new THREE.Vector3() };
  readonly target = { value: new THREE.Vector3() };
  readonly amount = { value: 0 };
}

export function obstructingTreeMeshes(group: THREE.Group, camera: THREE.Vector3, player: THREE.Vector3) {
  group.updateWorldMatrix(true, false);
  const worldCamera = group.localToWorld(camera.clone());
  const worldPlayer = group.localToWorld(player.clone());
  const worldUp = new THREE.Vector3().setFromMatrixColumn(group.matrixWorld, 1);
  const ray = new THREE.Raycaster();
  const direction = new THREE.Vector3();
  const trees = group.children.filter(object => {
    if (object.userData.resource !== 'wood') return false;
    const radius = typeof object.userData.treeOcclusionRadius === 'number' ? object.userData.treeOcclusionRadius : 2.5;
    const dx = player.x - camera.x;
    const dz = player.z - camera.z;
    const length = dx * dx + dz * dz;
    if (length < 0.0001) return Math.hypot(object.position.x - camera.x, object.position.z - camera.z) < radius;
    const along = Math.max(0, Math.min(1, ((object.position.x - camera.x) * dx + (object.position.z - camera.z) * dz) / length));
    return Math.hypot(object.position.x - (camera.x + along * dx), object.position.z - (camera.z + along * dz)) < radius;
  });
  trees.forEach(tree => tree.updateWorldMatrix(true, true));
  const result = new Set<THREE.Mesh>();
  for (const height of [0.45, 1.05, 1.7]) {
    direction.copy(worldPlayer).addScaledVector(worldUp, height).sub(worldCamera);
    const distance = direction.length();
    if (distance < 0.01) continue;
    ray.set(worldCamera, direction.multiplyScalar(1 / distance));
    ray.far = Math.max(0, distance - 0.05);
    for (const hit of ray.intersectObjects(trees, true)) {
      if (hit.object instanceof THREE.Mesh) result.add(hit.object);
    }
  }
  return result;
}
