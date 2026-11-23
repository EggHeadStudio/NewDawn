import { describe, expect, it } from 'vitest';
import { isSaveData } from './save';
import { defaultAppearance } from './appearance';

function oldSave() {
  return {
    version: 1, seed: 1847, outfit: 'ember',
    player: { x: 0, z: 5 }, npc: { x: -4, z: 2 }, vehicle: { x: 8, z: 4 },
    resources: { wood: 3, stone: 2, food: 3, water: 3 },
    buildings: [{ kind: 'storage', x: 4, z: 4, y: 1, rotation: 0 }],
    terrain: { '0,0': -0.35 }, calendar: { minute: 360, day: 1 },
  };
}

describe('saved worlds', () => {
  it('accepts legacy saves and current state', () => {
    expect(isSaveData(oldSave())).toBe(true);
    expect(isSaveData({ ...oldSave(), version: 2, depleted: ['0,3'], health: 80, tools: ['axe'], npcState: { recruited: true, job: 'wood', carrying: 'wood' } })).toBe(true);
    const identity = { appearance: defaultAppearance(), playerName: 'Survivor', npcAppearanceSeed: 53917 };
    expect(isSaveData({ ...oldSave(), ...identity, version: 3 })).toBe(true);
    expect(isSaveData({ ...oldSave(), ...identity, version: 4, wildlife: [] })).toBe(true);
    expect(isSaveData({ ...oldSave(), ...identity, version: 5, wildlife: [] })).toBe(true);
  });
  it('rejects malformed, unsafe, and unsupported saves', () => {
    expect(isSaveData({ ...oldSave(), version: 6 })).toBe(false);
    expect(isSaveData({ ...oldSave(), version: 3 })).toBe(false);
    expect(isSaveData({ ...oldSave(), resources: { wood: -2 } })).toBe(false);
    expect(isSaveData({ ...oldSave(), buildings: [{ kind: 'invalid' }] })).toBe(false);
    expect(isSaveData({ ...oldSave(), depleted: [1] })).toBe(false);
  });
});
