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
    expect(isSaveData({ ...oldSave(), ...identity, version: 6, wildlife: [], player: { x: 500, z: -200 } })).toBe(true);
  });
  it('rejects malformed, unsafe, and unsupported saves', () => {
    expect(isSaveData({ ...oldSave(), version: 8 })).toBe(false);
    expect(isSaveData({ ...oldSave(), version: 3 })).toBe(false);
    expect(isSaveData({ ...oldSave(), resources: { wood: -2 } })).toBe(false);
    expect(isSaveData({ ...oldSave(), buildings: [{ kind: 'invalid' }] })).toBe(false);
    expect(isSaveData({ ...oldSave(), depleted: [1] })).toBe(false);
  });
  it('validates version 7 structures and preserves legacy prefab buildings', () => {
    const frame = { id: 'frame', kind: 'doorframe', x: 24, z: 1, y: 2, level: 0, rotation: 0, open: false };
    const door = { ...frame, id: 'door', kind: 'door', open: true };
    const save = { ...oldSave(), version: 7, appearance: defaultAppearance(), playerName: 'Survivor',
      npcAppearanceSeed: 53917, wildlife: [], player: { x: 24, y: 2, z: 0 }, structures: [frame, door] };
    expect(isSaveData(save)).toBe(true);
    expect(isSaveData({ ...save, structures: [door] })).toBe(false);
    expect(isSaveData({ ...save, structures: [frame, frame] })).toBe(false);
    expect(isSaveData({ ...save, structures: [{ ...frame, x: 23 }] })).toBe(false);
    expect(isSaveData({ ...save, structures: [{ ...frame, y: NaN }] })).toBe(false);
  });
});
