import * as THREE from 'three';

export class TreeClearance {
  readonly camera = { value: new THREE.Vector3() };
  readonly target = { value: new THREE.Vector3() };
  readonly amount = { value: 0 };
}

export function installTreeClearance(material: THREE.MeshStandardMaterial) {
  const clearance = new TreeClearance();
  material.userData.treeClearance = clearance;
  const compile = material.onBeforeCompile;
  const cacheKey = material.customProgramCacheKey();
  material.onBeforeCompile = function (shader, renderer) {
    compile.call(this, shader, renderer);
    shader.uniforms.treeClearanceCamera = clearance.camera;
    shader.uniforms.treeClearanceTarget = clearance.target;
    shader.uniforms.treeClearanceAmount = clearance.amount;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        varying vec3 treeWorldPosition;`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        treeWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 treeWorldPosition;
        uniform vec3 treeClearanceCamera, treeClearanceTarget;
        uniform float treeClearanceAmount;`)
      .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
        if (treeClearanceAmount > 0.001) {
          vec3 sight = treeClearanceTarget - treeClearanceCamera;
          float along = dot(treeWorldPosition - treeClearanceCamera, sight) / max(dot(sight, sight), 0.001);
          if (along > 0.0 && along < 1.0) {
            float distanceToSight = length(treeWorldPosition - (treeClearanceCamera + sight * along));
            float radius = 1.1 * treeClearanceAmount;
            float edge = 1.0 - smoothstep(max(0.0, radius - 0.12), radius, distanceToSight);
            float noise = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
            if (noise < edge) discard;
          }
        }`);
  };
  material.customProgramCacheKey = () => `${cacheKey}-tree-clearance-v1`;
}

export function obstructingTreeMeshes(group: THREE.Group, camera: THREE.Vector3, player: THREE.Vector3) {
  group.updateWorldMatrix(true, false);
  const worldCamera = group.localToWorld(camera.clone());
  const worldPlayer = group.localToWorld(player.clone());
  const worldUp = new THREE.Vector3().setFromMatrixColumn(group.matrixWorld, 1);
  const right = new THREE.Vector3(player.z - camera.z, 0, camera.x - player.x);
  if (right.lengthSq() < 0.0001) right.set(1, 0, 0);
  right.normalize().multiplyScalar(0.4);
  const worldRight = group.localToWorld(player.clone().add(right)).sub(worldPlayer);
  const ray = new THREE.Raycaster();
  const direction = new THREE.Vector3();
  const trees = group.children.filter(object => {
    if (object.userData.resource !== 'wood') return false;
    const radius = (typeof object.userData.treeOcclusionRadius === 'number' ? object.userData.treeOcclusionRadius : 2.5) + 0.4;
    const dx = player.x - camera.x;
    const dz = player.z - camera.z;
    const length = dx * dx + dz * dz;
    if (length < 0.0001) return Math.hypot(object.position.x - camera.x, object.position.z - camera.z) < radius;
    const along = Math.max(0, Math.min(1, ((object.position.x - camera.x) * dx + (object.position.z - camera.z) * dz) / length));
    return Math.hypot(object.position.x - (camera.x + along * dx), object.position.z - (camera.z + along * dz)) < radius;
  });
  trees.forEach(tree => tree.updateWorldMatrix(true, true));
  const localized: THREE.Mesh[] = [];
  const solid: THREE.Mesh[] = [];
  for (const tree of trees) tree.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    if (materials.some(material => material.userData.treeClearance instanceof TreeClearance)) localized.push(object);
    else solid.push(object);
  });
  const result = new Set<THREE.Mesh>();
  const inverse = new THREE.Matrix4();
  const localRay = new THREE.Ray();
  const intersection = new THREE.Vector3();
  for (const [height, side] of [[0.45, 0], [1.05, 0], [1.7, 0], [1.05, -1], [1.05, 1]]) {
    direction.copy(worldPlayer).addScaledVector(worldUp, height).addScaledVector(worldRight, side).sub(worldCamera);
    const distance = direction.length();
    if (distance < 0.01) continue;
    ray.set(worldCamera, direction.multiplyScalar(1 / distance));
    ray.far = Math.max(0, distance - 0.05);
    for (const hit of ray.intersectObjects(solid, false)) {
      if (hit.object instanceof THREE.Mesh) result.add(hit.object);
    }
    for (const mesh of localized) {
      if (!mesh.layers.test(ray.layers)) continue;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const bounds = mesh.geometry.boundingBox;
      if (!bounds) continue;
      inverse.copy(mesh.matrixWorld).invert();
      localRay.copy(ray.ray).applyMatrix4(inverse);
      // Conservative bounds avoid authored-tree raycasts; the shader limits the cleared area.
      if (bounds.containsPoint(localRay.origin)) {
        result.add(mesh);
      } else if (localRay.intersectBox(bounds, intersection)
          && intersection.applyMatrix4(mesh.matrixWorld).distanceTo(worldCamera) <= ray.far) {
        result.add(mesh);
      }
    }
  }
  return result;
}
