import type { Inventory } from './gameplay';
import type { MineralInventory } from './economy';
import { nearestPlanetPosition } from './planet';

export interface TorchState {
  crafted: boolean;
  equipped: boolean;
  lit: boolean;
}

export function isTorchState(value: unknown): value is TorchState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  return typeof state.crafted === 'boolean' && typeof state.equipped === 'boolean' && typeof state.lit === 'boolean'
    && (!state.equipped || state.crafted) && (!state.lit || state.equipped);
}

export function craftTorch(state: TorchState, inventory: Inventory, minerals: MineralInventory) {
  if (state.crafted || inventory.wood < 2 || minerals.coal < 1) return false;
  inventory.wood -= 2;
  minerals.coal--;
  state.crafted = true;
  return true;
}

export function toggleTorchEquipment(state: TorchState) {
  if (!state.crafted) return false;
  state.equipped = !state.equipped;
  if (!state.equipped) state.lit = false;
  return true;
}

export function toggleTorchFlame(state: TorchState) {
  if (!state.equipped) return false;
  state.lit = !state.lit;
  return true;
}

export function togglePostFlame(post: { lit: boolean }, torch: TorchState) {
  if (!post.lit && !torch.lit) return false;
  post.lit = !post.lit;
  return true;
}

export interface FireFixture { id: string; x: number; z: number; lit: boolean }

export function nearbyFireLights<T extends FireFixture>(fixtures: readonly T[], x: number, z: number, limit: number, range: number) {
  return fixtures.filter(fixture => fixture.lit).map(fixture => {
    const position = nearestPlanetPosition(fixture.x, fixture.z, x, z);
    return { fixture, distance: Math.hypot(position.x - x, position.z - z) };
  }).filter(entry => entry.distance <= range)
    .sort((a, b) => a.distance - b.distance || a.fixture.id.localeCompare(b.fixture.id))
    .slice(0, limit).map(entry => entry.fixture);
}
