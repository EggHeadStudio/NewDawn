import { describe, expect, it } from 'vitest';
import { isOnboardingState, onboardingObjective } from './onboarding';

describe('optional introduction', () => {
  it('advances from real gathering and pack state to a modular floor and Mira', () => {
    const state = { mode: 'guide' as const, gathered: false, openedPack: false };
    expect(onboardingObjective(state, 0, false, false)).toContain('Gather a resource');
    state.gathered = true;
    expect(onboardingObjective(state, 0, false, false)).toContain('Open Pack');
    state.openedPack = true;
    expect(onboardingObjective(state, 0, false, false)).toContain('2 wood');
    expect(onboardingObjective(state, 2, false, false)).toContain('modular floor');
    expect(onboardingObjective(state, 0, true, false)).toContain('Mira');
    expect(onboardingObjective(state, 0, true, true)).toBeNull();
    expect(onboardingObjective({ ...state, mode: 'free' }, 0, false, false)).toBeNull();
  });

  it('validates persisted introduction states', () => {
    expect(isOnboardingState({ mode: 'complete', gathered: true, openedPack: true })).toBe(true);
    expect(isOnboardingState({ mode: 'guide', gathered: 'yes', openedPack: false })).toBe(false);
    expect(isOnboardingState({ mode: 'unknown', gathered: false, openedPack: false })).toBe(false);
  });
});
