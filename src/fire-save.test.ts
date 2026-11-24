import { describe, expect, it } from 'vitest';
import { defaultAppearance } from './appearance';
import { emptyMinerals } from './economy';
import { isSaveData } from './save';

const save = {
  version: 9, seed: 1847, outfit: 'ember', appearance: defaultAppearance(), playerName: 'Survivor',
  npcAppearanceSeed: 53917, wildlife: [], player: { x: 0, y: 1, z: 5 }, npc: { x: -4, z: 2 },
  vehicle: { x: 8, z: 4 }, resources: { wood: 3, stone: 2, food: 3, water: 3 },
  buildings: [], structures: [], terrain: {}, minerals: emptyMinerals(), mining: {},
  ingots: { iron: 0, copper: 0, glass: 0 }, ironPickaxe: false, calendar: { minute: 0, day: 1 },
};

describe('saved fire state', () => {
  it('accepts existing version 9 saves and validates equipped and burning state', () => {
    expect(isSaveData(save)).toBe(true);
    expect(isSaveData({ ...save, torch: { crafted: true, equipped: true, lit: true } })).toBe(true);
    expect(isSaveData({ ...save, torch: { crafted: false, equipped: true, lit: false } })).toBe(false);
    expect(isSaveData({ ...save, torch: { crafted: true, equipped: false, lit: true } })).toBe(false);
  });

  it('requires unique persistent IDs and boolean flames on torch posts', () => {
    const post = { kind: 'torchpost', id: 'post-a', x: 4, z: 4, y: 1, rotation: 0, lit: true };
    expect(isSaveData({ ...save, buildings: [post] })).toBe(true);
    expect(isSaveData({ ...save, buildings: [{ ...post, id: undefined }] })).toBe(false);
    expect(isSaveData({ ...save, buildings: [{ ...post, lit: 'yes' }] })).toBe(false);
    expect(isSaveData({ ...save, buildings: [post, { ...post, x: 8 }] })).toBe(false);
    expect(isSaveData({ ...save, version: 8, buildings: [post] })).toBe(false);
  });
});
