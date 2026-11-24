import * as THREE from 'three';

export function obstructingTrees(group: THREE.Group, camera: THREE.Vector3, player: THREE.Vector3) {
  const ray = new THREE.Raycaster();
  const direction = new THREE.Vector3();
  const trees = group.children.filter(object => {
    if (object.userData.resource !== 'wood') return false;
    const dx = player.x - camera.x;
    const dz = player.z - camera.z;
    const length = dx * dx + dz * dz;
    if (length < 0.0001) return Math.hypot(object.position.x - camera.x, object.position.z - camera.z) < 3;
    const along = Math.max(0, Math.min(1, ((object.position.x - camera.x) * dx + (object.position.z - camera.z) * dz) / length));
    return Math.hypot(object.position.x - (camera.x + along * dx), object.position.z - (camera.z + along * dz)) < 2.5;
  });
  trees.forEach(tree => tree.updateWorldMatrix(true, true));
  const result = new Set<THREE.Object3D>();
  for (const height of [0.45, 1.05, 1.7]) {
    direction.set(player.x - camera.x, player.y + height - camera.y, player.z - camera.z);
    const distance = direction.length();
    if (distance < 0.01) continue;
    ray.set(camera, direction.multiplyScalar(1 / distance));
    ray.far = Math.max(0, distance - 0.05);
    for (const hit of ray.intersectObjects(trees, true)) {
      let root: THREE.Object3D | null = hit.object;
      while (root && root.userData.resource !== 'wood') root = root.parent;
      if (root) result.add(root);
    }
  }
  return result;
}
