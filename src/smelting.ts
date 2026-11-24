import type { MineralInventory } from './economy';

export type SmeltableOre = 'ironOre' | 'copperOre' | 'sand';
export type Ingots = { iron: number; copper: number; glass: number };
export type SavedIngots = { iron: number; copper: number; glass?: number };
export type SmeltingJob = { ore: SmeltableOre; remaining: number };

export function startSmelting(minerals: MineralInventory, current: SmeltingJob | undefined, ore: SmeltableOre) {
  if (current || minerals[ore] < 2 || minerals.coal < 1) return undefined;
  minerals[ore] -= 2;
  minerals.coal--;
  return { ore, remaining: 8 } satisfies SmeltingJob;
}

export function advanceSmelting(job: SmeltingJob, ingots: Ingots, dt: number) {
  if (job.remaining <= 0) return false;
  job.remaining = Math.max(0, job.remaining - dt);
  if (job.remaining > 0) return false;
  ingots[job.ore === 'ironOre' ? 'iron' : job.ore === 'copperOre' ? 'copper' : 'glass']++;
  return true;
}

export function isIngots(value: unknown, requireGlass = false): value is SavedIngots {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return ['iron', 'copper', ...(requireGlass ? ['glass'] : [])].every(key => {
    const amount = record[key];
    return typeof amount === 'number' && Number.isSafeInteger(amount) && amount >= 0;
  });
}

export function isSmeltingJob(value: unknown): value is SmeltingJob {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (record.ore === 'ironOre' || record.ore === 'copperOre' || record.ore === 'sand')
    && typeof record.remaining === 'number' && Number.isFinite(record.remaining)
    && record.remaining > 0 && record.remaining <= 8;
}
