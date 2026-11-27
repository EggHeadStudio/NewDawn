import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Effects, Precipitation } from './effects';
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

  describe('material impacts', () => {
    it('reuses a bounded pool and clears active particles', () => {
      const scene = new THREE.Scene();
      const effects = new Effects(scene);
      effects.update(0, new THREE.Vector3(), 0, 'high');
      for (let i = 0; i < 10; i++) effects.burst(new THREE.Vector3(), 'wood');
      expect(effects.activeCount).toBe(64);
      const meshes = [...scene.children];
      effects.update(2);
      expect(effects.activeCount).toBe(0);
      effects.burst(new THREE.Vector3(), 'stone');
      expect(scene.children).toEqual(meshes);
      effects.reset();
      expect(effects.activeCount).toBe(0);
      effects.dispose();
      expect(scene.children).toHaveLength(0);
    });

    it('limits distant and low-quality effects and gives materials distinct fragments', () => {
      const scene = new THREE.Scene();
      const effects = new Effects(scene);
      effects.update(0, new THREE.Vector3(), 1, 'low');
      effects.burst(new THREE.Vector3(50, 0, 0), 'wood');
      expect(effects.activeCount).toBe(0);
      effects.burst(new THREE.Vector3(), 'wood');
      expect(effects.activeCount).toBe(4);
      const wood = scene.children.filter(child => child.visible) as THREE.Mesh[];
      const woodFragment = wood.find(mesh => mesh.geometry.type === 'BoxGeometry');
      expect(woodFragment).toBeDefined();
      const woodGeometry = woodFragment!.geometry;
      effects.reset();
      effects.burst(new THREE.Vector3(), 'stone');
      const stone = scene.children.filter(child => child.visible) as THREE.Mesh[];
      expect(stone.some(mesh => mesh.geometry.type === 'DodecahedronGeometry')).toBe(true);
      expect(stone.every(mesh => mesh.geometry !== woodGeometry)).toBe(true);
      effects.dispose();
    });
  });
});
