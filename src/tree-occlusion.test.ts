import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { obstructingTrees } from './tree-occlusion';

describe('tree visibility', () => {
  it('finds trees covering the body rather than only the head-to-camera ray', () => {
    const world = new THREE.Group();
    const tree = new THREE.Group();
    tree.userData.resource = 'wood';
    tree.position.z = 2;
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.2, 0.5), new THREE.MeshBasicMaterial());
    trunk.position.y = 0.6;
    tree.add(trunk);
    const unrelated = tree.clone();
    unrelated.position.x = 8;
    world.add(tree, unrelated);
    world.updateMatrixWorld(true);
    const result = obstructingTrees(world, new THREE.Vector3(0, 1, 4), new THREE.Vector3());
    expect(result.has(tree)).toBe(true);
    expect(result.has(unrelated)).toBe(false);
  });
});
