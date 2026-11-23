import type { BuildingKind, Position } from './gameplay';
import { nearestPlanetPosition } from './planet';

export interface PowerNode extends Position {
  kind: BuildingKind;
  charge: number;
  powered: boolean;
}

export const LINK_RANGE = 4;
const electrical = new Set<BuildingKind>(['turbine', 'generator', 'battery', 'cable', 'lamp']);
export function areConnected(a: PowerNode, b: PowerNode) {
  const near = nearestPlanetPosition(b.x, b.z, a.x, a.z);
  return electrical.has(a.kind) && electrical.has(b.kind) && Math.hypot(a.x - near.x, a.z - near.z) <= LINK_RANGE;
}

/** Wind generation needs a turbine directly linked to a generator. Batteries buffer surplus. */
export function updatePower(nodes: PowerNode[], wind: number, dt: number) {
  for (const node of nodes) node.powered = false;
  const remaining = new Set(nodes.filter(node => electrical.has(node.kind)));
  while (remaining.size) {
    const first = remaining.values().next().value as PowerNode;
    remaining.delete(first);
    const network = [first];
    for (let i = 0; i < network.length; i++) {
      for (const candidate of remaining) {
        if (areConnected(network[i], candidate)) {
          remaining.delete(candidate);
          network.push(candidate);
        }
      }
    }
    const generators = network.filter(n => n.kind === 'generator' && network.some(t => t.kind === 'turbine' && areConnected(n, t)));
    const lamps = network.filter(n => n.kind === 'lamp');
    const batteries = network.filter(n => n.kind === 'battery');
    let energy = generators.length * Math.max(0, wind) * dt;
    const need = lamps.length * 0.6 * dt;
    for (const battery of batteries) {
      const taken = Math.min(battery.charge, Math.max(0, need - energy));
      battery.charge -= taken;
      energy += taken;
    }
    for (const lamp of lamps) {
      const consumption = 0.6 * dt;
      if (energy + 1e-8 >= consumption) {
        lamp.powered = true;
        energy -= consumption;
      }
    }
    for (const battery of batteries) {
      const stored = Math.min(20 - battery.charge, Math.max(0, energy));
      battery.charge += stored;
      energy -= stored;
      battery.powered = battery.charge > 0;
    }
    for (const generator of generators) generator.powered = true;
  }
}
