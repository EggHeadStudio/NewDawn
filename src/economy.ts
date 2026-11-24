export const minerals = ['clay', 'sand', 'coal', 'copperOre', 'ironOre', 'limestone'] as const;
export type Mineral = typeof minerals[number];
export const depositKinds = ['stone', ...minerals] as const;
export type DepositKind = typeof depositKinds[number];
export type MineralInventory = Record<Mineral, number>;

export function emptyMinerals(): MineralInventory {
  return { clay: 0, sand: 0, coal: 0, copperOre: 0, ironOre: 0, limestone: 0 };
}

export function requiresPickaxe(mineral: DepositKind) {
  return mineral !== 'clay' && mineral !== 'sand';
}

export function isMineralInventory(value: unknown): value is MineralInventory {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return minerals.every(mineral => typeof record[mineral] === 'number'
    && Number.isSafeInteger(record[mineral]) && (record[mineral] as number) >= 0);
}
