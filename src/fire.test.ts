import { describe, expect, it } from 'vitest';
import { emptyMinerals } from './economy';
import { craftTorch, isTorchState, nearbyFireLights, togglePostFlame, toggleTorchEquipment, toggleTorchFlame } from './fire';
import { PLANET_WIDTH } from './planet';

describe('fire gameplay', () => {
  it('crafts once using wood and coal without partial spending', () => {
    const inventory = { wood: 3, stone: 0, food: 0, water: 0 };
    const minerals = emptyMinerals();
    const torch = { crafted: false, equipped: false, lit: false };
    expect(craftTorch(torch, inventory, minerals)).toBe(false);
    expect(inventory.wood).toBe(3);
    minerals.coal = 1;
    expect(craftTorch(torch, inventory, minerals)).toBe(true);
    expect(inventory.wood).toBe(1);
    expect(minerals.coal).toBe(0);
    expect(craftTorch(torch, inventory, minerals)).toBe(false);
  });

  it('requires an equipped burning torch to ignite a post, and permits extinguishing', () => {
    const torch = { crafted: true, equipped: false, lit: false };
    const post = { lit: false };
    expect(toggleTorchFlame(torch)).toBe(false);
    expect(togglePostFlame(post, torch)).toBe(false);
    expect(toggleTorchEquipment(torch)).toBe(true);
    expect(toggleTorchFlame(torch)).toBe(true);
    expect(togglePostFlame(post, torch)).toBe(true);
    toggleTorchEquipment(torch);
    expect(torch.lit).toBe(false);
    expect(togglePostFlame(post, torch)).toBe(true);
    expect(togglePostFlame(post, torch)).toBe(false);
  });

  it('validates state and limits nearby lights deterministically', () => {
    expect(isTorchState({ crafted: false, equipped: true, lit: false })).toBe(false);
    expect(isTorchState({ crafted: true, equipped: false, lit: true })).toBe(false);
    expect(isTorchState({ crafted: true, equipped: true, lit: true })).toBe(true);
    const fixtures = [
      { id: 'b', x: 1, z: 0, lit: true }, { id: 'a', x: -1, z: 0, lit: true },
      { id: 'far', x: 20, z: 0, lit: true }, { id: 'off', x: 0, z: 0, lit: false },
    ];
    expect(nearbyFireLights(fixtures, 0, 0, 1, 10).map(fixture => fixture.id)).toEqual(['a']);
    expect(nearbyFireLights([{ id: 'seam', x: -PLANET_WIDTH / 2 + 1, z: 0, lit: true }],
      PLANET_WIDTH / 2 - 1, 0, 1, 3).map(fixture => fixture.id)).toEqual(['seam']);
  });
});
