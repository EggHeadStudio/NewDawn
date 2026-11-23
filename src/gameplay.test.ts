import { describe, expect, it } from 'vitest';
import { canPlace, craftTool, daylightAt, isNight, spend, type Inventory, type Tool } from './gameplay';
import { World } from './world';

describe('playable loop', () => {
  it('spends atomically and refuses unaffordable construction', () => {
    const inventory: Inventory = { wood: 8, stone: 3, food: 0, water: 0 };
    expect(spend(inventory, { wood: 8, stone: 4 })).toBe(false);
    expect(inventory.wood).toBe(8);
    inventory.stone++;
    expect(spend(inventory, { wood: 8, stone: 4 })).toBe(true);
    expect(inventory).toEqual({ wood: 0, stone: 0, food: 0, water: 0 });
  });
  it('rejects water, overlaps and placements on the player', () => {
    expect(canPlace({ x: 4, z: 0 }, 'shelter', -1, [], { x: 0, z: 0 })).toBe(false);
    expect(canPlace({ x: 1, z: 0 }, 'shelter', 1, [], { x: 0, z: 0 })).toBe(false);
    expect(canPlace({ x: 4, z: 0 }, 'shelter', 1, [{ kind: 'storage', x: 5, z: 0 }], { x: 0, z: 0 })).toBe(false);
    expect(canPlace({ x: 4, z: 0 }, 'shelter', 1, [], { x: 0, z: 0 })).toBe(true);
  });
  it('crafts a tool once and consumes its ingredients', () => {
    const inventory: Inventory = { wood: 6, stone: 4, food: 0, water: 0 };
    const tools: Tool[] = [];
    expect(craftTool(inventory, tools, 'axe')).toBe(true);
    expect(inventory.wood).toBe(3);
    expect(inventory.stone).toBe(2);
    expect(craftTool(inventory, tools, 'axe')).toBe(false);
    expect(inventory.wood).toBe(3);
  });
  it('has a dark night and bright midday', () => {
    expect(isNight(0)).toBe(true);
    expect(isNight(720)).toBe(false);
    expect(isNight(1200)).toBe(true);
    expect(daylightAt(0)).toBeLessThan(daylightAt(720));
  });
  it('preserves gathered resources and excavations across regeneration', () => {
    const world = new World(1847);
    const resource = world.group.children.find(item => item.userData.resource);
    expect(resource).toBeDefined();
    const x = resource!.position.x;
    const z = resource!.position.z;
    expect(world.gatherNearest(x, z, 0.1)).toBeDefined();
    world.dig(0, 0);
    const restored = new World(1847);
    restored.restoreDepleted(world.depletedSnapshot());
    restored.restore(world.snapshot());
    expect(restored.gatherNearest(x, z, 0.1)).toBeUndefined();
    expect(restored.heightAt(0, 0)).toBeCloseTo(world.heightAt(0, 0));
  });
});
