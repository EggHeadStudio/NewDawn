import { describe, expect, it } from 'vitest';
import { createWildlife, isWildlifeState, updateWildlife, type AnimalState } from './wildlife';
import { biomeAt, safeSpawn } from './world';

function animal(species: AnimalState['species'], x: number, z: number): AnimalState {
  return { id: `${species}-0`, species, x, z, homeX: x, homeZ: z, heading: 0, health: species === 'rabbit' ? 1 : 3, behavior: 'wander', decisionTimer: 1, attackTimer: 0, decisions: 0 };
}

describe('wildlife', () => {
  it('spawns deterministically in suitable habitats away from the player', () => {
    const spawn = safeSpawn(1847)!;
    const animals = createWildlife(1847, spawn);
    expect(animals).toEqual(createWildlife(1847, spawn));
    expect(new Set(animals.map(item => item.species))).toEqual(new Set(['deer', 'rabbit', 'wolf', 'bird']));
    expect(isWildlifeState(animals)).toBe(true);
    for (const item of animals) {
      expect(biomeAt(item.x, item.z, 1847)).not.toBe('ocean');
      expect(Math.hypot(item.x - spawn.x, item.z - spawn.z)).toBeGreaterThanOrEqual(item.species === 'wolf' ? 14 : 6);
    }
  });
  it('flees threats and lets predators attack prey and the player', () => {
    const deer = animal('deer', 0, 0);
    const wolf = animal('wolf', 0, 0.6);
    const animals = [deer, wolf];
    updateWildlife(animals, 0.1, 1847, { x: 30, z: 30 }, () => 1, () => { throw new Error('unexpected player damage'); });
    expect(deer.behavior).toBe('flee');
    expect(deer.health).toBe(2);
    let damage = 0;
    wolf.attackTimer = 0;
    updateWildlife(animals, 0.1, 1847, { x: wolf.x, z: wolf.z }, () => 1, value => { damage += value; });
    expect(damage).toBe(8);
  });
  it('removes prey killed by a predator and rejects malformed save state', () => {
    const wolf = animal('wolf', 0, 0);
    const rabbit = animal('rabbit', 0, 0.1);
    const animals = [wolf, rabbit];
    updateWildlife(animals, 0.1, 1847, { x: 30, z: 30 }, () => 1, () => {});
    expect(animals.map(item => item.species)).toEqual(['wolf']);
    expect(isWildlifeState([{ ...wolf, health: -1 }])).toBe(false);
    expect(isWildlifeState([wolf, wolf])).toBe(false);
  });
});
