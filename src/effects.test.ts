import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Precipitation } from './effects';
import { ShelterIndex } from './shelter';
import type { StructuralPiece } from './construction';

describe('precipitation shelter', () => {
  it.each(['Rain', 'Snow'] as const)('suppresses %s below a roof while retaining outside particles', weather => {
    const scene = new THREE.Scene();
    const precipitation = new Precipitation(scene);
    const points = scene.children[0] as THREE.Points;
    const positions = points.geometry.getAttribute('position');
    const visibility = points.geometry.getAttribute('particleVisibility');
    const shelter = new ShelterIndex();
    const roof: StructuralPiece = { id: 'roof', kind: 'roof', x: 0, z: 0, y: 0, level: 0, rotation: 0, open: false };
    shelter.refresh([roof]);
    positions.setXYZ(0, 0, 1, 0);
    positions.setXYZ(1, 4, 1, 4);
    precipitation.update(weather, new THREE.Vector3(), 0, shelter);
    expect(visibility.getX(0)).toBe(0);
    expect(visibility.getX(1)).toBe(1);
    shelter.refresh([]);
    precipitation.update(weather, new THREE.Vector3(), 0, shelter);
    expect(visibility.getX(0)).toBe(1);
  });
});
