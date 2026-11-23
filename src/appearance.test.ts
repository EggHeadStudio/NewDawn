import { describe, expect, it } from 'vitest';
import { appearanceFromSeed, defaultAppearance, isAppearance } from './appearance';
import { createCharacter } from './assets';
import { isSaveData } from './save';

describe('character appearance', () => {
  it('creates stable, valid NPC appearances from saved seeds', () => {
    expect(appearanceFromSeed(81234)).toEqual(appearanceFromSeed(81234));
    expect(isAppearance(appearanceFromSeed(81234))).toBe(true);
    expect(appearanceFromSeed(81234)).not.toEqual(appearanceFromSeed(91235));
    expect(appearanceFromSeed(1)).toEqual({
      body: 'masculine', face: 'angular', skin: 'brown', hair: 'long', hairColor: 'blond',
      facialHair: 'beard', hat: 'none', clothing: 'jacket', outfit: 'ember', height: 'medium',
    });
  });
  it('creates a model with articulated limbs for custom appearances', () => {
    const appearance = { ...defaultAppearance('sage'), hair: 'curly' as const, hat: 'beanie' as const };
    const model = createCharacter(appearance);
    expect(model.getObjectByName('legL')?.children.length).toBeGreaterThan(0);
    expect(model.getObjectByName('armR')?.children.length).toBeGreaterThan(0);
    expect(model.getObjectByName('torso')).toBeDefined();
    expect(model.getObjectByName('kneeL')).toBeDefined();
    expect(model.getObjectByName('elbowR')).toBeDefined();
    expect(model.getObjectByName('tool-chop')?.visible).toBe(false);
  });
  it('rejects invalid appearance options and validates the new save schema', () => {
    expect(isAppearance({ ...defaultAppearance(), hair: 'unknown' })).toBe(false);
    const save = {
      version: 3, seed: 1847, outfit: 'azure', appearance: defaultAppearance('azure'),
      playerName: 'Aino', npcAppearanceSeed: 1123,
      player: { x: 0, z: 0 }, npc: { x: 1, z: 1 }, vehicle: { x: 2, z: 2 },
      resources: { wood: 0, stone: 0, food: 3, water: 3 }, buildings: [], terrain: {},
      calendar: { minute: 360, day: 1 },
    };
    expect(isSaveData(save)).toBe(true);
    expect(isSaveData({ ...save, appearance: { ...save.appearance, hat: 'invalid' } })).toBe(false);
    expect(isSaveData({ ...save, playerName: '' })).toBe(false);
    expect(isSaveData({ ...save, version: 5, wildlife: [], appearance: { ...save.appearance, clothing: 'fur', hair: 'braided', hat: 'helmet' } })).toBe(true);
  });
});
