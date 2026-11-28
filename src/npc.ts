import type { Position } from './gameplay';

export type NpcJob = 'idle' | 'wood' | 'stone';
export type NpcActivity = 'resting' | 'seeking storage' | 'gathering' | 'delivering' | 'taking cover';
export interface NpcState {
  recruited: boolean;
  job: NpcJob;
  carrying: 'wood' | 'stone' | null;
  carryingAmount?: number;
}

export function chooseNpcActivity(state: NpcState, hasStorage: boolean, enemyNearby: boolean): NpcActivity {
  if (!state.recruited || state.job === 'idle') return 'resting';
  if (enemyNearby) return 'taking cover';
  if (!hasStorage) return 'seeking storage';
  return state.carrying ? 'delivering' : 'gathering';
}

export function stepToward(from: Position, to: Position, speed: number, dt: number): Position {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const distance = Math.hypot(dx, dz);
  if (distance === 0) return { ...from };
  const step = Math.min(distance, speed * dt) / distance;
  return { x: from.x + dx * step, z: from.z + dz * step };
}
