import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ConstructionRenderer } from './construction-render';
import type { StructuralPiece } from './construction';

describe('construction visibility', () => {
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
});
