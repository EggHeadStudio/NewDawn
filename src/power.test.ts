import { describe, expect, it } from 'vitest';
import { updatePower, type PowerNode } from './power';
import { PLANET_WIDTH } from './planet';

function node(kind: PowerNode['kind'], x: number, charge = 0): PowerNode {
  return { kind, x, z: 0, charge, powered: false };
}

describe('electrical network', () => {
  it('requires a connected turbine and generator and transfers power to lamps', () => {
    const turbine = node('turbine', 0);
    const generator = node('generator', 3);
    const cable = node('cable', 6);
    const lamp = node('lamp', 9);
    updatePower([turbine, generator, cable, lamp], 1, 1);
    expect(lamp.powered).toBe(true);
    cable.x = 20;
    updatePower([turbine, generator, cable, lamp], 1, 1);
    expect(lamp.powered).toBe(false);
  });
  it('charges a battery and consumes it when wind stops', () => {
    const turbine = node('turbine', 0);
    const generator = node('generator', 3);
    const battery = node('battery', 6);
    const lamp = node('lamp', 9);
    const nodes = [turbine, generator, battery, lamp];
    updatePower(nodes, 1, 10);
    expect(battery.charge).toBeCloseTo(4);
    expect(lamp.powered).toBe(true);
    updatePower(nodes, 0, 5);
    expect(battery.charge).toBeCloseTo(1);
    expect(lamp.powered).toBe(true);
    updatePower(nodes, 0, 5);
    expect(lamp.powered).toBe(false);
  });
  it('does not generate from a turbine linked only indirectly to a generator', () => {
    const nodes = [node('turbine', 0), node('cable', 3), node('generator', 6), node('lamp', 9)];
    updatePower(nodes, 1, 1);
    expect(nodes[3].powered).toBe(false);
  });
  it('keeps a power network connected across longitude copies', () => {
    const turbine = node('turbine', PLANET_WIDTH / 2 - 1);
    const generator = node('generator', -PLANET_WIDTH / 2 + 1);
    const lamp = node('lamp', -PLANET_WIDTH / 2 + 4);
    updatePower([turbine, generator, lamp], 1, 1);
    expect(lamp.powered).toBe(true);
  });
});
