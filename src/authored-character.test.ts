import { describe, expect, it } from 'vitest';
import { authoredAnimation } from './authored-character';

describe('authored character animation selection', () => {
  it('selects locomotion and action clips without changing movement rules', () => {
    expect(authoredAnimation(0, false, undefined, false)).toBe('Idle_Loop');
    expect(authoredAnimation(1, false, undefined, false)).toBe('Walk_Loop');
    expect(authoredAnimation(1, true, undefined, false)).toBe('Sprint_Loop');
    expect(authoredAnimation(1, false, 'attack', false)).toBe('Sword_Attack');
    expect(authoredAnimation(0, false, 'hurt', false)).toBe('Hit_Chest');
    expect(authoredAnimation(0, false, 'build', false)).toBe('PickUp_Table');
  });
});
