export const PLANET_WIDTH = 3072;
export const PLANET_HEIGHT = 1536;
export const CHUNK_SIZE = 24;

function modulo(value: number, period: number) {
  return ((value % period) + period) % period;
}

export function planetCoordinates(x: number, z: number) {
  const phase = modulo(z + PLANET_HEIGHT / 2, PLANET_HEIGHT * 2);
  const reflected = phase > PLANET_HEIGHT;
  const latitude = reflected ? PLANET_HEIGHT * 1.5 - phase : phase - PLANET_HEIGHT / 2;
  const longitude = modulo(x + (reflected ? PLANET_WIDTH / 2 : 0) + PLANET_WIDTH / 2, PLANET_WIDTH) - PLANET_WIDTH / 2;
  return { x: longitude, z: latitude, reflected };
}

export function nearestPlanetPosition(x: number, z: number, referenceX: number, referenceZ: number) {
  const point = planetCoordinates(x, z);
  const candidates = [false, true].map(reflected => {
    const baseZ = reflected ? PLANET_HEIGHT - point.z : point.z;
    const baseX = point.x - (reflected ? PLANET_WIDTH / 2 : 0);
    return {
      x: baseX + Math.round((referenceX - baseX) / PLANET_WIDTH) * PLANET_WIDTH,
      z: baseZ + Math.round((referenceZ - baseZ) / (PLANET_HEIGHT * 2)) * PLANET_HEIGHT * 2,
    };
  });
  return candidates.reduce((nearest, candidate) =>
    Math.hypot(candidate.x - referenceX, candidate.z - referenceZ) < Math.hypot(nearest.x - referenceX, nearest.z - referenceZ)
      ? candidate : nearest);
}

export function planetHeight(x: number, z: number, seed: number) {
  const point = planetCoordinates(x, z);
  const longitude = point.x / PLANET_WIDTH * Math.PI * 2;
  const latitude = point.z / PLANET_HEIGHT * Math.PI;
  const cosLatitude = Math.cos(latitude);
  const sx = Math.cos(longitude) * cosLatitude;
  const sy = Math.sin(latitude);
  const sz = Math.sin(longitude) * cosLatitude;
  const phase = seed * 0.017;
  const continents = Math.sin(sx * 4.1 + sy * 2.2 + phase) * Math.cos(sz * 4.7 - sy * 1.7 + phase * 0.7);
  const hills = Math.sin(sx * 12 + sz * 7 + phase) * Math.sin(sy * 13 + sz * 9 - phase);
  const mountains = Math.max(0, Math.sin(sx * 8 - sz * 5 + phase) * Math.cos(sy * 9 + phase)) ** 4;
  const starter = Math.max(0, 1 - Math.hypot(point.x, point.z) / 220) * 4;
  return Math.max(-2.5, continents * 4.5 + hills * 1.1 + mountains * 5 + starter);
}
