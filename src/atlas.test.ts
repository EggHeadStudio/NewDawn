import { describe, expect, it } from 'vitest';
import { atlasBiomeAtCell } from './atlas';
import { geographicToPlanetPosition } from './planet';
import { biomeAt } from './world';

describe('shared Atlas geography', () => {
  it('uses the world generator biome at each geographic cell and refreshes for another seed', () => {
    const projected = geographicToPlanetPosition(0.5, 0.5);
    expect(atlasBiomeAtCell(0, 0, 1847)).toBe(biomeAt(projected.x, projected.z, 1847));

    const otherSeedBiome = biomeAt(projected.x, projected.z, 42);
    expect(atlasBiomeAtCell(0, 0, 42)).toBe(otherSeedBiome);
  });
});
