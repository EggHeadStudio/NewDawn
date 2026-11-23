import { describe, expect, it } from 'vitest';
import { chooseNpcActivity, stepToward, type NpcState } from './npc';

describe('survivor tasks', () => {
  const state: NpcState = { recruited: true, job: 'wood', carrying: null };
  it('requires recruitment and storage, then gathers and delivers', () => {
    expect(chooseNpcActivity({ ...state, recruited: false }, true, false)).toBe('resting');
    expect(chooseNpcActivity(state, false, false)).toBe('seeking storage');
    expect(chooseNpcActivity(state, true, false)).toBe('gathering');
    expect(chooseNpcActivity({ ...state, carrying: 'wood' }, true, false)).toBe('delivering');
    expect(chooseNpcActivity(state, true, true)).toBe('taking cover');
  });
  it('moves toward a target without overshooting', () => {
    expect(stepToward({ x: 0, z: 0 }, { x: 3, z: 0 }, 1, 1)).toEqual({ x: 1, z: 0 });
    expect(stepToward({ x: 0, z: 0 }, { x: 3, z: 0 }, 10, 1)).toEqual({ x: 3, z: 0 });
  });
});
