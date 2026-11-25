import { geographicToPlanetPosition } from './planet';
import { biomeAt, type Biome } from './world';

export const atlasBiomeColors: Record<Biome, string> = {
  ocean: '#527b85', beach: '#d3c28b', grass: '#9baa64', forest: '#4f7650',
  rock: '#85867e', desert: '#c5a66f', snow: '#dce5df',
};

const atlasBiomeTypes: Biome[] = ['ocean', 'beach', 'grass', 'forest', 'rock', 'desert', 'snow'];
const atlasBiomeTypeIndices = new Map(atlasBiomeTypes.map((biome, index) => [biome, index]));
const atlasBiomeCache = new Uint8Array(360 * 180);
let atlasBiomeCacheSeed: number | undefined;

export function atlasBiomeAtCell(latIndex: number, lonIndex: number, worldSeed: number): Biome {
  if (atlasBiomeCacheSeed !== worldSeed) {
    for (let latitude = -90; latitude < 90; latitude++) {
      for (let longitude = -180; longitude < 180; longitude++) {
        const projected = geographicToPlanetPosition(latitude + 0.5, longitude + 0.5);
        const biome = biomeAt(projected.x, projected.z, worldSeed);
        const index = (latitude + 90) * 360 + longitude + 180;
        atlasBiomeCache[index] = atlasBiomeTypeIndices.get(biome) ?? 0;
      }
    }
    atlasBiomeCacheSeed = worldSeed;
  }
  const index = (latIndex + 90) * 360 + lonIndex + 180;
  return atlasBiomeTypes[atlasBiomeCache[index]];
}
