export type TreeHarvestState =
  | { phase: 'standing'; progress: 1 | 2 }
  | { phase: 'fallen'; progress: 0 | 1; total: number; direction: number }
  | { phase: 'logs'; remaining: number; total: number; direction: number };

export type TreeHarvestRecord = Record<string, TreeHarvestState>;

const MAX_TREE_YIELD = 24;
export const MAX_ACTIVE_TREES = 100000;
export const TREE_WORK_REACH = 1.5;

export function treeYield(height: number, scale: number) {
  return Math.max(3, Math.min(MAX_TREE_YIELD, Math.round(height * scale * 1.5)));
}

export function isTreeHarvestRecord(value: unknown): value is TreeHarvestRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  if (entries.length > MAX_ACTIVE_TREES) return false;
  return entries.every(([id, entry]) => {
    if (!/^-?\d+,-?\d+$/.test(id) || id.length > 32
      || typeof entry !== 'object' || entry === null || Array.isArray(entry)) return false;
    const state = entry as Record<string, unknown>;
    if (state.phase === 'standing') return state.progress === 1 || state.progress === 2;
    if (state.phase !== 'fallen' && state.phase !== 'logs') return false;
    if (typeof state.total !== 'number' || !Number.isInteger(state.total)
      || state.total < 3 || state.total > MAX_TREE_YIELD
      || typeof state.direction !== 'number' || !Number.isFinite(state.direction)
      || Math.abs(state.direction) > Math.PI) return false;
    if (state.phase === 'fallen') return state.progress === 0 || state.progress === 1;
    return typeof state.remaining === 'number' && Number.isInteger(state.remaining)
      && state.remaining >= 1 && state.remaining <= state.total;
  });
}
