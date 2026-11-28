export type OnboardingState = {
  mode: 'guide' | 'free' | 'complete';
  gathered: boolean;
  openedPack: boolean;
};

export function isOnboardingState(value: unknown): value is OnboardingState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  return (state.mode === 'guide' || state.mode === 'free' || state.mode === 'complete')
    && typeof state.gathered === 'boolean' && typeof state.openedPack === 'boolean';
}

export function onboardingObjective(state: OnboardingState, wood: number, hasFloor: boolean, recruited: boolean) {
  if (state.mode !== 'guide') return null;
  if (!state.gathered) return 'Gather a resource · Space / A';
  if (!state.openedPack) return 'Open Pack · I / Tools → Pack';
  if (!hasFloor && wood < 2) return 'Gather 2 wood for a floor';
  if (!hasFloor) return 'Build a modular floor · B / Build';
  if (!recruited) return 'Meet and recruit Taru · E / B';
  return null;
}
