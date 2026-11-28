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
    const rain = scene.children[1] as THREE.LineSegments;
    const positions = points.geometry.getAttribute('position');
    const visibility = points.geometry.getAttribute('particleVisibility');
    const rainOpacity = rain.geometry.getAttribute('rainOpacity');
    const shelter = new ShelterIndex();
    const roof: StructuralPiece = { id: 'roof', kind: 'roof', x: 0, z: 0, y: 0, level: 0, rotation: 0, open: false };
    shelter.refresh([roof]);
    positions.setXYZ(0, 0, 1, 0);
    positions.setXYZ(1, 4, 1, 4);
    precipitation.update(weather, new THREE.Vector3(), 0, shelter);
    expect(visibility.getX(0)).toBe(0);
    expect(visibility.getX(1)).toBe(1);
    expect(points.visible).toBe(weather === 'Snow');
    expect(rain.visible).toBe(weather === 'Rain');
    if (weather === 'Rain') {
      expect([rainOpacity.getX(0), rainOpacity.getX(1), rainOpacity.getX(2), rainOpacity.getX(3)])
        .toEqual([0, 0, 1, 0]);
    }
    shelter.refresh([]);
    precipitation.update(weather, new THREE.Vector3(), 0, shelter);
    expect(visibility.getX(0)).toBe(1);
    if (weather === 'Rain') expect(rainOpacity.getX(0)).toBe(1);
  });

  it('moves and tilts rain with wind, wraps its local pool, and leaves snow independent of wind', () => {
    const scene = new THREE.Scene();
    const precipitation = new Precipitation(scene);
    const points = scene.children[0] as THREE.Points;
    const rain = scene.children[1] as THREE.LineSegments;
    const positions = points.geometry.getAttribute('position');
    const streaks = rain.geometry.getAttribute('position');
    positions.setXYZ(0, 11.99, 8, 0);

    precipitation.update('Rain', new THREE.Vector3(2, 3, 4), 0.1, undefined, 1);
    expect(positions.getX(0)).toBeCloseTo(-11.9);
    expect(positions.getY(0)).toBeCloseTo(7);
    expect(streaks.getX(0)).toBeCloseTo(positions.getX(0));
    expect(streaks.getY(1)).toBeGreaterThan(streaks.getY(0));
    expect(streaks.getX(1)).toBeLessThan(streaks.getX(0));
    expect(rain.position.toArray()).toEqual([2, 3, 4]);

    precipitation.update('Snow', new THREE.Vector3(), 0.1, undefined, 1);
    expect(positions.getX(0)).toBeCloseTo(-11.9);
    expect(positions.getY(0)).toBeCloseTo(6.85);
    expect(points.visible).toBe(true);
    expect(rain.visible).toBe(false);

    precipitation.update('Storm', new THREE.Vector3(), 0, undefined, 0);
    expect(streaks.getX(1)).toBeCloseTo(streaks.getX(0));
    expect(points.visible).toBe(false);
    expect(rain.visible).toBe(true);
    precipitation.update('Clear', new THREE.Vector3(), 0);
    expect(points.visible || rain.visible).toBe(false);
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
