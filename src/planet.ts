import {
  EARTH_RADIUS_METERS, geographicBearing, geographicDistanceMeters, geographicToLocal,
  moveGeographic, normalizeLatitude, normalizeLongitude, regionIdForCoordinates, type GeographicPosition,
} from './geography';

export const CHUNK_SIZE = 24;
export const PLANET_WIDTH = Math.round((2 * Math.PI * EARTH_RADIUS_METERS) / (CHUNK_SIZE * 2)) * CHUNK_SIZE * 2;
export const PLANET_HEIGHT = PLANET_WIDTH / 2;
export const GAMEPLAY_METERS_PER_UNIT = 1;
export const LOCAL_PLANET_TILE_METERS = 24;

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

export function planetPositionToGeographic(x: number, z: number, altitude = 0): GeographicPosition {
  const point = planetCoordinates(x, z);
  const latitude = point.z / PLANET_HEIGHT * 180;
  const longitude = point.x / PLANET_WIDTH * 360;
  return {
    planetId: 'new-dawn-earth',
    latitude,
    longitude,
    altitude,
    regionId: regionIdForCoordinates(latitude, longitude),
  };
}

export function geographicToPlanetPosition(latitude: number, longitude: number) {
  return {
    x: normalizeLongitude(longitude) / 360 * PLANET_WIDTH,
    z: normalizeLatitude(latitude) / 180 * PLANET_HEIGHT,
  };
}

export function planetDistanceMeters(a: { x: number; z: number }, b: { x: number; z: number }) {
  return geographicDistanceMeters(
    planetPositionToGeographic(a.x, a.z),
    planetPositionToGeographic(b.x, b.z),
  );
}

export function planetBearingDegrees(start: { x: number; z: number }, destination: { x: number; z: number }) {
  return geographicBearing(planetPositionToGeographic(start.x, start.z), planetPositionToGeographic(destination.x, destination.z));
}

export function planetOffset(start: { x: number; z: number }, destination: { x: number; z: number }) {
  const offset = geographicToLocal(
    planetPositionToGeographic(start.x, start.z),
    planetPositionToGeographic(destination.x, destination.z),
  );
  return { x: offset.x, z: -offset.z };
}

export function movePlanetPosition(
  position: { x: number; z: number },
  bearingDegrees: number,
  distanceMeters: number,
  origin = planetPositionToGeographic(position.x, position.z),
) {
  const geographic = moveGeographic(origin, bearingDegrees, distanceMeters);
  const projected = geographicToPlanetPosition(geographic.latitude, geographic.longitude);
  return {
    ...nearestPlanetPosition(projected.x, projected.z, position.x, position.z),
    geographic,
  };
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
