import { describe, expect, it } from 'vitest';
import { emptyMinerals } from './economy';
import { advanceSmelting, startSmelting } from './smelting';

describe('smelting', () => {
  it('reserves ore and coal atomically and produces exactly one ingot after processing', () => {
    const minerals = { ...emptyMinerals(), ironOre: 2, coal: 1 };
    const ingots = { iron: 0, copper: 0 };
    expect(startSmelting(minerals, undefined, 'copperOre')).toBeUndefined();
    expect(minerals).toMatchObject({ ironOre: 2, coal: 1 });
    const job = startSmelting(minerals, undefined, 'ironOre')!;
    expect(minerals).toMatchObject({ ironOre: 0, coal: 0 });
    expect(startSmelting(minerals, job, 'ironOre')).toBeUndefined();
    expect(advanceSmelting(job, ingots, 7)).toBe(false);
    expect(ingots.iron).toBe(0);
    expect(advanceSmelting(job, ingots, 1)).toBe(true);
    expect(ingots).toEqual({ iron: 1, copper: 0 });
    expect(advanceSmelting(job, ingots, 1)).toBe(false);
    expect(ingots.iron).toBe(1);
  });
});
