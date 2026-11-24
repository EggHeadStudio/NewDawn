import { describe, expect, it } from 'vitest';
import { emptyMinerals } from './economy';
import { advanceSmelting, startSmelting } from './smelting';

describe('smelting', () => {
  it('reserves ore and coal atomically and produces exactly one ingot after processing', () => {
    const minerals = { ...emptyMinerals(), ironOre: 2, coal: 1 };
    const ingots = { iron: 0, copper: 0, glass: 0 };
    expect(startSmelting(minerals, undefined, 'copperOre')).toBeUndefined();
    expect(minerals).toMatchObject({ ironOre: 2, coal: 1 });
    const job = startSmelting(minerals, undefined, 'ironOre')!;
    expect(minerals).toMatchObject({ ironOre: 0, coal: 0 });
    expect(startSmelting(minerals, job, 'ironOre')).toBeUndefined();
    expect(advanceSmelting(job, ingots, 7)).toBe(false);
    expect(ingots.iron).toBe(0);
    expect(advanceSmelting(job, ingots, 1)).toBe(true);
    expect(ingots).toEqual({ iron: 1, copper: 0, glass: 0 });
    expect(advanceSmelting(job, ingots, 1)).toBe(false);
    expect(ingots.iron).toBe(1);
  });

  it('consumes sand and coal to produce glass only after the job finishes', () => {
    const shortSand = { ...emptyMinerals(), sand: 1, coal: 1 };
    const shortFuel = { ...emptyMinerals(), sand: 2, coal: 0 };
    expect(startSmelting(shortSand, undefined, 'sand')).toBeUndefined();
    expect(shortSand).toMatchObject({ sand: 1, coal: 1 });
    expect(startSmelting(shortFuel, undefined, 'sand')).toBeUndefined();
    expect(shortFuel).toMatchObject({ sand: 2, coal: 0 });
    const minerals = { ...emptyMinerals(), sand: 2, coal: 1 };
    const ingots = { iron: 0, copper: 0, glass: 0 };
    const job = startSmelting(minerals, undefined, 'sand')!;
    expect(minerals).toMatchObject({ sand: 0, coal: 0 });
    expect(advanceSmelting(job, ingots, 7)).toBe(false);
    expect(ingots.glass).toBe(0);
    expect(advanceSmelting(job, ingots, 1)).toBe(true);
    expect(ingots.glass).toBe(1);
    expect(advanceSmelting(job, ingots, 1)).toBe(false);
    expect(ingots.glass).toBe(1);
  });
});
