import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { StructuralPiece } from './construction';
import { ConstructionRenderer } from './construction-render';
import { ShelterIndex } from './shelter';
import { Precipitation } from './effects';

function house(): StructuralPiece[] {
  const piece = (id: string, kind: StructuralPiece['kind'], x: number, z: number, rotation: 0 | 1): StructuralPiece =>
    ({ id, kind, x, z, y: 2, level: 0, rotation, open: false });
  return [piece('n', 'wall', 0, -1, 0), piece('s', 'doorframe', 0, 1, 0),
    piece('w', 'windowframe', -1, 0, 1), piece('e', 'wall', 1, 0, 1),
    { ...piece('r', 'roof', 0, 0, 0), automatic: true, roofShape: { style: 'gable', axis: 0, heights: [0, 0.9, 0] } }];
}

describe('cached shelter', () => {
  it('separates room enclosure and overhead cover, including after removal and upper floors', () => {
    const pieces = house();
    const index = new ShelterIndex();
    index.refresh(pieces);
    expect(index.status(0, 2.2, 0)).toBe('sheltered');
    expect(index.coverAt(0, 4.8, 0)).toBe(true);
    expect(index.coverAt(0, 5.4, 0)).toBe(false);
    expect(index.coverAt(4, 3, 0)).toBe(false);
    pieces.pop();
    index.refresh(pieces);
    expect(index.status(0, 2.2, 0)).toBe('open room');
    pieces.push({ id: 'upper', kind: 'floor', x: 0, z: 0, y: 4.4, level: 1, rotation: 0, open: false });
    index.refresh(pieces);
    expect(index.status(0, 2.2, 0)).toBe('sheltered');
    expect(index.status(0, 4.6, 0)).toBe('outside');
    pieces.splice(0, 1);
    index.refresh(pieces);
    expect(index.status(0, 2.2, 0)).toBe('under cover');
  });

  it('fades only the occupied room when the camera is above, and restores opacity', () => {
    const renderer = new ConstructionRenderer();
    renderer.refresh(house());
    const mesh = renderer.group.children.find(child => child instanceof THREE.InstancedMesh
      && child.userData.constructionKind === 'roof') as THREE.InstancedMesh;
    const opacity = mesh.geometry.getAttribute('instanceOpacity');
    renderer.update(1, new THREE.Vector3(0, 2.2, 0), new THREE.Vector3(0, 8, 5));
    expect(opacity.getX(0)).toBeLessThan(0.3);
    renderer.update(2, new THREE.Vector3(4, 2.2, 0), new THREE.Vector3(4, 8, 5));
    expect(opacity.getX(0)).toBeGreaterThan(0.99);
    renderer.refresh([]);
    expect(renderer.group.children).toHaveLength(0);
  });

  it('keeps an adjacent room opaque and does not fade a roof when the camera is below it', () => {
    const pieces = house();
    pieces.push(
      { id: 'n2', kind: 'wall', x: 2, z: -1, y: 2, level: 0, rotation: 0, open: false },
      { id: 's2', kind: 'wall', x: 2, z: 1, y: 2, level: 0, rotation: 0, open: false },
      { id: 'e2', kind: 'wall', x: 3, z: 0, y: 2, level: 0, rotation: 1, open: false },
      { ...pieces[4], id: 'r2', x: 2 },
    );
    const renderer = new ConstructionRenderer();
    renderer.refresh(pieces);
    renderer.update(2, new THREE.Vector3(0, 2.2, 0), new THREE.Vector3(0, 3, 0));
    const roofOpacity = () => {
      const entries: Array<{ x: number; opacity: number }> = [];
      const matrix = new THREE.Matrix4();
      for (const child of renderer.group.children) {
        if (!(child instanceof THREE.InstancedMesh) || child.userData.constructionKind !== 'roof') continue;
        const opacity = child.geometry.getAttribute('instanceOpacity');
        if (!opacity) continue;
        for (let i = 0; i < child.count; i++) {
          child.getMatrixAt(i, matrix);
          entries.push({ x: matrix.elements[12], opacity: opacity.getX(i) });
        }
      }
      return entries.sort((a, b) => a.x - b.x);
    };
    expect(roofOpacity().every(entry => entry.opacity > 0.99)).toBe(true);
    renderer.update(2, new THREE.Vector3(0, 2.2, 0), new THREE.Vector3(0, 8, 0));
    expect(roofOpacity()[0].opacity).toBeLessThan(0.21);
    expect(roofOpacity()[1].opacity).toBeGreaterThan(0.99);
  });

  it('masks rain and snow only below local cover while retaining exterior weather', () => {
    const scene = new THREE.Scene();
    const precipitation = new Precipitation(scene);
    const points = scene.children[0] as THREE.Points;
    const position = points.geometry.getAttribute('position');
    position.setXYZ(0, 0, 1, 0);
    position.setXYZ(1, 5, 1, 0);
    position.setXYZ(2, 0, 6, 0);
    const index = new ShelterIndex();
    index.refresh(house());
    for (const weather of ['Rain', 'Snow'] as const) {
      precipitation.update(weather, new THREE.Vector3(0, 2.2, 0), 0, index);
      const visibility = points.geometry.getAttribute('particleVisibility');
      expect(points.visible).toBe(true);
      expect([visibility.getX(0), visibility.getX(1), visibility.getX(2)]).toEqual([0, 1, 1]);
    }
  });
});
