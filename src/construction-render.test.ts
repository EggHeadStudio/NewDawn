import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ConstructionRenderer } from './construction-render';
import type { StructuralPiece } from './construction';
import { geographicToPlanetPosition, PlanetTangentFrame } from './planet';
import { resolvePlanetActorMove } from './physics';

describe('construction visibility', () => {
  it('reprojects a wall with its collision query through frame relocation', () => {
    const position = geographicToPlanetPosition(85, 179.99999);
    const wall: StructuralPiece = { id: 'wall', kind: 'wall', ...position, y: 0, level: 0, rotation: 0, open: false };
    const renderer = new ConstructionRenderer();
    renderer.refresh([wall]);
    for (const reference of [position, { x: position.x + 24, z: position.z + 24 }]) {
      const frame = new PlanetTangentFrame(reference);
      renderer.setTangentFrame(frame);
      renderer.group.updateMatrixWorld(true);
      const center = frame.toLocal(wall);
      const ray = new THREE.Raycaster(new THREE.Vector3(center.x, 1, center.z - 2), new THREE.Vector3(0, 0, 1), 0, 4);
      expect(ray.intersectObject(renderer.group, true).length).toBeGreaterThan(0);
      const from = frame.toPlanet({ x: center.x, z: center.z - 1 });
      const next = frame.toPlanet({ x: center.x, z: center.z - 0.3 });
      expect(resolvePlanetActorMove(from.x, from.z, next.x, next.z, 0, [wall], []).blocked).toBe(true);
    }
    renderer.setTangentFrame(null);
  });

  it('fades only walls between the camera and the player and restores them afterwards', () => {
    const wall = (id: string, x: number): StructuralPiece => ({
      id, kind: 'wall', x, z: 1, y: 0, level: 0, rotation: 0, open: false,
    });
    const renderer = new ConstructionRenderer();
    renderer.refresh([wall('blocking', 0), wall('unrelated', 10)]);
    renderer.update(1, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 2, 5));
    const mesh = renderer.group.children.find(child => child instanceof THREE.InstancedMesh
      && child.count === 2 && child.geometry.getAttribute('instanceOpacity')) as THREE.InstancedMesh;
    expect(mesh).toBeDefined();
    const opacity = mesh.geometry.getAttribute('instanceOpacity');
    expect(opacity.getX(0)).toBeLessThan(0.35);
    expect(opacity.getX(1)).toBeCloseTo(1);
    renderer.update(2, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 2, -5));
    expect(opacity.getX(0)).toBeGreaterThan(0.98);
    expect(opacity.getX(1)).toBeCloseTo(1);
  });

  it('clears only upper floors that obstruct the player and restores them when viewed from below', () => {
    const floor = (id: string, x: number, y: number): StructuralPiece => ({
      id, kind: 'floor', x, z: 0, y, level: y === 0 ? 0 : 1, rotation: 0, open: false,
    });
    const renderer = new ConstructionRenderer();
    renderer.refresh([floor('ground', 0, 0), floor('ceiling', 0, 2.4), floor('other', 10, 2.4)]);
    const mesh = renderer.group.children.find(child => child instanceof THREE.InstancedMesh
      && child.userData.constructionKind === 'floor') as THREE.InstancedMesh;
    const faded = renderer.group.children.find(child => child instanceof THREE.InstancedMesh
      && child !== mesh && child.geometry === mesh.geometry) as THREE.InstancedMesh;
    const material = mesh.material as THREE.Material;
    expect(material.transparent).toBe(false);
    expect(material.depthWrite).toBe(true);
    expect(faded.visible).toBe(false);
    expect((faded.material as THREE.Material).transparent).toBe(true);
    expect((faded.material as THREE.Material).depthWrite).toBe(false);
    expect(faded.castShadow).toBe(false);
    renderer.update(1, new THREE.Vector3(0, 0.18, 0), new THREE.Vector3(0, 5, 0));
    expect(faded.visible).toBe(true);
    const opacity = mesh.geometry.getAttribute('instanceOpacity');
    expect(opacity.getX(0)).toBeCloseTo(1);
    expect(opacity.getX(1)).toBeLessThan(0.35);
    expect(opacity.getX(2)).toBeCloseTo(1);
    renderer.update(2, new THREE.Vector3(0, 0.18, 0), new THREE.Vector3(0, 2, 0));
    expect(opacity.getX(0)).toBeCloseTo(1);
    expect(opacity.getX(1)).toBeGreaterThan(0.98);
    expect(opacity.getX(2)).toBeCloseTo(1);
    expect(faded.visible).toBe(false);
  });

  it('preserves floor clearance across refresh and disposes the old shared geometry', () => {
    const piece: StructuralPiece = { id: 'ceiling', kind: 'floor', x: 0, z: 0, y: 2.4, level: 1, rotation: 0, open: false };
    const renderer = new ConstructionRenderer();
    renderer.refresh([piece]);
    renderer.update(1, new THREE.Vector3(0, 0.18, 0), new THREE.Vector3(0, 5, 0));
    const old = renderer.group.children.find(child => child instanceof THREE.InstancedMesh
      && child.userData.constructionKind === 'floor') as THREE.InstancedMesh;
    let disposed = false;
    old.geometry.addEventListener('dispose', () => { disposed = true; });
    renderer.refresh([piece]);
    expect(disposed).toBe(true);
    const opaque = renderer.group.children.find(child => child instanceof THREE.InstancedMesh
      && child.userData.constructionKind === 'floor') as THREE.InstancedMesh;
    const faded = renderer.group.children.find(child => child instanceof THREE.InstancedMesh
      && child !== opaque && child.geometry === opaque.geometry) as THREE.InstancedMesh;
    expect(faded.visible).toBe(true);
    expect(opaque.geometry.getAttribute('instanceOpacity').getX(0)).toBeLessThan(0.35);
    expect(Array.from(faded.instanceMatrix.array)).toEqual(Array.from(opaque.instanceMatrix.array));
    renderer.refresh([]);
    expect(renderer.group.children).toHaveLength(0);
  });

  it('keeps construction occlusion aligned with a translated render origin', () => {
    const renderer = new ConstructionRenderer();
    renderer.refresh([{
      id: 'distant-blocking', kind: 'wall', x: 1024, z: 1, y: 0, level: 0, rotation: 0, open: false,
    }]);
    const renderOrigin = new THREE.Vector3(1024, 0, 0);
    renderer.group.position.copy(renderOrigin).negate();
    renderer.update(1, new THREE.Vector3(1024, 0, 0), new THREE.Vector3(1024, 2, 5), renderOrigin);
    const mesh = renderer.group.children.find(child => child instanceof THREE.InstancedMesh
      && child.geometry.getAttribute('instanceOpacity')) as THREE.InstancedMesh;
    expect(mesh.geometry.getAttribute('instanceOpacity').getX(0)).toBeLessThan(0.35);
  });

  it('retains distant wall, door and roof precision and occlusion across chunk batches', () => {
    const x = 20_000_001;
    const wall: StructuralPiece = { id: 'wall', kind: 'wall', x, z: 1, y: 0, level: 0, rotation: 0, open: false };
    const door: StructuralPiece = { ...wall, id: 'door', kind: 'door', x: x + 24 };
    const roof: StructuralPiece = { ...wall, id: 'roof', kind: 'roof', z: 0,
      roofShape: { style: 'gable', axis: 0, heights: [0, 0.9, 0] } };
    const renderer = new ConstructionRenderer();
    renderer.refresh([wall, door, roof]);
    const instances = renderer.group.children.filter((child): child is THREE.InstancedMesh => child instanceof THREE.InstancedMesh);
    const matrix = new THREE.Matrix4();
    for (const mesh of instances) {
      mesh.getMatrixAt(0, matrix);
      expect(Math.abs(matrix.elements[12])).toBeLessThan(25);
      expect(Math.abs(matrix.elements[14])).toBeLessThan(25);
    }
    const wallMesh = instances.find(mesh => mesh.userData.constructionKind === 'wall')!;
    wallMesh.getMatrixAt(0, matrix);
    expect(matrix.elements[12] + wallMesh.position.x).toBe(x);
    const roofMesh = instances.find(mesh => mesh.userData.constructionKind === 'roof')!;
    roofMesh.getMatrixAt(0, matrix);
    expect(matrix.elements[12] + roofMesh.position.x).toBe(x);

    renderer.group.position.set(-x, 0, 0);
    renderer.update(1, new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, 2, 5), new THREE.Vector3(x, 0, 0));
    expect(wallMesh.geometry.getAttribute('instanceOpacity').getX(0)).toBeLessThan(0.35);
    const doorMesh = instances.find(mesh => mesh.userData.constructionKind === 'door')!;
    door.open = true;
    renderer.update(1, new THREE.Vector3(x, 0, 0));
    doorMesh.getMatrixAt(0, matrix);
    expect(matrix.elements[12] + doorMesh.position.x).toBeCloseTo(door.x - 0.725, 2);
    expect(matrix.elements[14] + doorMesh.position.z).toBeCloseTo(door.z - 0.725, 2);
    expect(doorMesh.frustumCulled).toBe(true);
    expect(doorMesh.boundingSphere?.containsPoint(new THREE.Vector3().setFromMatrixPosition(matrix))).toBe(true);
  });
});
