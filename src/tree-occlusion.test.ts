import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { TreeClearance, obstructingTreeMeshes } from './tree-occlusion';
import { World } from './world';

describe('tree visibility', () => {
  it.each([false, true])('includes shoulder-edge branches without clearing unrelated meshes (foliage=%s)', foliage => {
    const world = new THREE.Group();
    world.position.set(-10000, 0, -20000);
    const tree = new THREE.Group();
    tree.userData.resource = 'wood';
    tree.position.set(10000, 0, 20002);
    const material = new THREE.MeshStandardMaterial();
    if (foliage) material.userData.treeClearance = new TreeClearance();
    const branch = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.2), material);
    branch.position.set(0.2, 1.05, 0);
    tree.add(branch);
    world.add(tree);
    const camera = new THREE.Vector3(10000, 1.05, 20004);
    const player = new THREE.Vector3(10000, 0, 20000);
    expect(obstructingTreeMeshes(world, camera, player).has(branch)).toBe(true);
    branch.position.x = 1.2;
    expect(obstructingTreeMeshes(world, camera, player).has(branch)).toBe(false);
    branch.position.set(0.2, 1.05, -4);
    expect(obstructingTreeMeshes(world, camera, player).has(branch)).toBe(false);
  });

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
    const result = obstructingTreeMeshes(world, new THREE.Vector3(0, 1, 4), new THREE.Vector3());
    expect(result.has(trunk)).toBe(true);
    expect(result.has(unrelated.children[0] as THREE.Mesh)).toBe(false);
  });

  it('finds obstructions after the scene has been rebased', () => {
    const scene = new THREE.Group();
    scene.position.set(-10000, 0, -20000);
    const world = new THREE.Group();
    const tree = new THREE.Group();
    tree.userData.resource = 'wood';
    tree.position.set(10000, 0, 20002);
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.2, 0.5), new THREE.MeshBasicMaterial());
    trunk.position.y = 0.6;
    tree.add(trunk);
    world.add(tree);
    scene.add(world);
    const result = obstructingTreeMeshes(world, new THREE.Vector3(10000, 1, 20004), new THREE.Vector3(10000, 0, 20000));
    expect(result.has(trunk)).toBe(true);
  });

  it('includes a wide crown whose trunk is outside the normal corridor', () => {
    const world = new THREE.Group();
    const tree = new THREE.Group();
    tree.userData.resource = 'wood';
    tree.userData.treeOcclusionRadius = 5;
    tree.position.set(4, 0, 2);
    const foliage = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshBasicMaterial());
    foliage.position.set(-4, 1, 0);
    tree.add(foliage);
    world.add(tree);
    expect(obstructingTreeMeshes(world, new THREE.Vector3(0, 1, 4), new THREE.Vector3()).has(foliage)).toBe(true);
  });

  it('uses transformed foliage bounds rather than triangle raycasts, limited to the sightline', () => {
    const world = new THREE.Group();
    world.position.set(-10000, 0, -20000);
    const tree = new THREE.Group();
    tree.userData.resource = 'wood';
    tree.position.set(10000, 0, 20002);
    tree.rotation.y = Math.PI / 4;
    tree.scale.setScalar(1.5);
    const material = new THREE.MeshStandardMaterial();
    material.userData.treeClearance = new TreeClearance();
    const foliage = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), material);
    foliage.position.y = 1;
    const raycast = vi.spyOn(foliage, 'raycast');
    tree.add(foliage);
    world.add(tree);
    const camera = new THREE.Vector3(10000, 1, 20004);
    const player = new THREE.Vector3(10000, 0, 20000);
    expect(obstructingTreeMeshes(world, camera, player).has(foliage)).toBe(true);
    expect(raycast).not.toHaveBeenCalled();
    tree.position.z = 19995;
    expect(obstructingTreeMeshes(world, camera, player).has(foliage)).toBe(false);
    tree.position.z = 20004;
    expect(obstructingTreeMeshes(world, camera, player).has(foliage)).toBe(true);
    foliage.layers.set(1);
    expect(obstructingTreeMeshes(world, camera, player).has(foliage)).toBe(false);
  });

  it('clears a local authored branch sightline and restores it without transparent materials', () => {
    const scene = new THREE.Group();
    scene.position.set(-10000, 0, -20000);
    const world = new World(1847, 1);
    scene.add(world.group);
    const tree = new THREE.Group();
    tree.userData.resource = 'wood';
    tree.position.set(10000, 0, 20002);
    const material = new THREE.MeshStandardMaterial();
    const clearance = new TreeClearance();
    material.userData.treeClearance = clearance;
    const foliage = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), material);
    foliage.position.y = 1;
    tree.add(foliage);
    world.group.add(tree);
    const camera = new THREE.Vector3(10000, 1, 20004);
    const player = new THREE.Vector3(10000, 0, 20000);
    world.updateTreeOcclusion(camera, player, 1 / 30);
    expect(clearance.amount.value).toBeGreaterThan(0);
    expect(clearance.camera.value.toArray()).toEqual([0, 1, 4]);
    expect(clearance.target.value.toArray()).toEqual([0, 1.05, 0]);
    expect(material.opacity).toBe(1);
    expect(material.transparent).toBe(false);
    expect(material.depthWrite).toBe(true);
    for (let i = 0; i < 30; i++) world.updateTreeOcclusion(new THREE.Vector3(10010, 1, 20004), player, 1 / 30);
    expect(clearance.amount.value).toBe(0);
    world.dispose();
  });

  it('fades only intersecting meshes smoothly and restores their material', () => {
    const world = new World(1847, 1);
    const tree = new THREE.Group();
    tree.userData.resource = 'wood';
    tree.position.set(100, 0, 102);
    const material = new THREE.MeshStandardMaterial();
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.2, 0.5), material);
    trunk.position.y = 0.6;
    const branch = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.2, 0.5), new THREE.MeshStandardMaterial());
    branch.position.set(2, 0.6, 0);
    tree.add(trunk, branch);
    world.group.add(tree);
    const camera = new THREE.Vector3(100, 1, 104);
    const player = new THREE.Vector3(100, 0, 100);
    world.updateTreeOcclusion(camera, player, 1 / 30);
    expect(material.opacity).toBeGreaterThan(0.18);
    expect(material.opacity).toBeLessThan(1);
    expect(branch.material.opacity).toBe(1);
    for (let i = 0; i < 30; i++) world.updateTreeOcclusion(new THREE.Vector3(110, 1, 104), player, 1 / 30);
    expect(material.opacity).toBe(1);
    expect(material.transparent).toBe(false);
    expect(material.depthWrite).toBe(true);
    world.dispose();
  });
});
