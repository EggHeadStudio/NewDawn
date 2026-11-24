import type { MineralInventory } from './economy';

export type SmeltableOre = 'ironOre' | 'copperOre';
export type Ingots = { iron: number; copper: number };
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
  ingots[job.ore === 'ironOre' ? 'iron' : 'copper']++;
  return true;
}

export function isIngots(value: unknown): value is Ingots {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return ['iron', 'copper'].every(key => typeof record[key] === 'number'
    && Number.isSafeInteger(record[key]) && (record[key] as number) >= 0);
}

export function isSmeltingJob(value: unknown): value is SmeltingJob {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (record.ore === 'ironOre' || record.ore === 'copperOre')
    && typeof record.remaining === 'number' && Number.isFinite(record.remaining)
    && record.remaining > 0 && record.remaining <= 8;
}
