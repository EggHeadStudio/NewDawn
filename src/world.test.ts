import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { biomeAt, safeSpawn, seededNoise, terrainHeight, World } from './world';

describe('procedural world', () => {
  it('is deterministic for a given seed and coordinate', () => {
    expect(terrainHeight(12.5, -8, 1847)).toBe(terrainHeight(12.5, -8, 1847));
    expect(seededNoise(4, 7, 1847)).toBe(seededNoise(4, 7, 1847));
  });

  it('produces distinguishable playable biomes', () => {
    const biomes = new Set<string>();
    for (let z = -40; z <= 40; z += 4) {
      for (let x = -40; x <= 40; x += 4) biomes.add(biomeAt(x, z, 1847));
    }
    expect(biomes.size).toBeGreaterThanOrEqual(3);
  });

  it('keeps terrain bounded to a navigable range', () => {
    for (let x = -48; x <= 48; x += 8) {
      for (let z = -48; z <= 48; z += 8) {
        expect(terrainHeight(x, z, 1847)).toBeGreaterThanOrEqual(-2.5);
        expect(terrainHeight(x, z, 1847)).toBeLessThan(10);
      }
    }
  });

  it('finds deterministic dry spawn positions for representative seeds', () => {
    for (const seed of [1, 25, 1847, 92301]) {
      const spawn = safeSpawn(seed);
      expect(spawn).toEqual(safeSpawn(seed));
      expect(spawn).not.toBeNull();
      expect(terrainHeight(spawn!.x, spawn!.z, seed)).toBeGreaterThan(0.8);
    }
  });

  it('updates instanced ground cover with the seasons without changing resources', () => {
    const world = new World(1847);
    const countResources = () => world.group.children.filter(child => child.userData.resource).length;
    const initialResources = countResources();
    const flowers = world.group.children.find(child => child.userData.groundCover === 'flower') as THREE.InstancedMesh;
    expect(flowers.count).toBeGreaterThan(0);
    world.setSeason('Winter');
    expect(flowers.visible).toBe(false);
    world.setSeason('Spring');
    expect(flowers.visible).toBe(true);
    expect(countResources()).toBe(initialResources);
    world.dispose();
  });
});
