import { describe, expect, it } from 'vitest';
import {
  EARTH_RADIUS_METERS, EQUATORIAL_CIRCUMFERENCE_METERS, climateZone, geographicBearing,
  geographicDistanceMeters, geographicToLocal, hierarchicalTileId, localToGeographic, localOriginAt,
  moveGeographic, normalizeLongitude, regionIdForCoordinates, seasonsForLatitude,
  transportBearing,
} from './geography';
import { geographicToPlanetPosition, movePlanetPosition, planetDistanceMeters, planetPositionToGeographic, PlanetTangentFrame } from './planet';

describe('Earth-scale geography', () => {
  it('uses an Earth radius and a roughly 40,030 km equatorial circumference', () => {
    expect(EARTH_RADIUS_METERS).toBe(6371000);
    expect(EQUATORIAL_CIRCUMFERENCE_METERS / 1000).toBeCloseTo(40030.173, 0);
  });

  it('normalizes longitude and reports the international-date-line distance', () => {
    expect(normalizeLongitude(181)).toBe(-179);
    expect(normalizeLongitude(-181)).toBe(179);
    const a = { planetId: 'new-dawn-earth' as const, latitude: 0, longitude: 179, altitude: 0, regionId: '' };
    const b = { planetId: 'new-dawn-earth' as const, latitude: 0, longitude: -179, altitude: 0, regionId: '' };
    expect(geographicDistanceMeters(a, b)).toBeCloseTo(222389.853, -1);
  });

  it('moves forward eastward and wraps at the meridian', () => {
    const start = { planetId: 'new-dawn-earth' as const, latitude: 0, longitude: 179, altitude: 0, regionId: '' };
    const moved = moveGeographic(start, 90, 222638);
    expect(moved.longitude).toBeGreaterThanOrEqual(-180);
    expect(normalizeLongitude(moved.longitude)).toBeGreaterThan(-181);
  });

  it('moves by real local meters at high latitudes and transports heading over a pole', () => {
    const origin = { latitude: 60, longitude: 10, altitude: 0 };
    const movedEast = moveGeographic(origin, 90, 4);
    expect(geographicDistanceMeters(origin, movedEast)).toBeCloseTo(4, 6);
    expect(Math.abs(movedEast.longitude - origin.longitude)).toBeGreaterThan(0.00006);

    const nearPole = { latitude: 89.99, longitude: 0, altitude: 0 };
    const acrossPole = moveGeographic(nearPole, 0, 2000);
    expect(acrossPole.latitude).toBeLessThan(90);
    expect(normalizeLongitude(acrossPole.longitude - 180)).toBeCloseTo(0, 5);
    expect(transportBearing(nearPole, acrossPole, 0)).toBeCloseTo(180, 5);
  });

  it('preserves centimeter-scale steps and tangent offsets at both poles', () => {
    for (const [latitude, bearing] of [[90, 180], [-90, 0]]) {
      const start = { latitude, longitude: 30, altitude: 0 };
      let position = moveGeographic(start, bearing, 0);
      for (let step = 0; step < 40; step++) {
        const next = moveGeographic(position, bearing, 0.05);
        expect(geographicDistanceMeters(position, next)).toBeCloseTo(0.05, 4);
        position = next;
      }
      expect(geographicDistanceMeters(start, position)).toBeCloseTo(2, 3);
      const offset = geographicToLocal(start, localToGeographic(start, 0.05, 0));
      expect(offset.x).toBeCloseTo(0.05, 4);
      expect(offset.z).toBeCloseTo(0, 4);
    }
  });

  it('preserves physical heading when the same pole uses a different longitude basis', () => {
    expect(transportBearing({ latitude: 90, longitude: 0 }, { latitude: 90, longitude: 90 }, 0)).toBeCloseTo(90, 6);
    expect(transportBearing({ latitude: -90, longitude: 0 }, { latitude: -90, longitude: 90 }, 0)).toBeCloseTo(270, 6);
  });

  it('crosses poles and returns stable bearings and hierarchy IDs', () => {
    const north = moveGeographic({ latitude: 89.9, longitude: 0, altitude: 0 }, 0, 20000);
    expect(north.latitude).toBeGreaterThanOrEqual(-90);
    expect(north.latitude).toBeLessThanOrEqual(90);
    expect(geographicBearing({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 })).toBeCloseTo(0, 5);
    expect(hierarchicalTileId(0, 0, 4)).toMatch(/^[0-9]+\/[0-9]+\/[0-9]+$/);
    expect(regionIdForCoordinates(20, 30)).toMatch(/^region-/);
  });

  it('places both poles inside the valid geographic region and tile grids', () => {
    expect(regionIdForCoordinates(-90, 0)).toBe('region-2-0-4');
    expect(regionIdForCoordinates(90, 0)).toBe('region-2-3-4');
    expect(hierarchicalTileId(-90, 0, 4)).toBe('4/8/0');
    expect(hierarchicalTileId(90, 0, 4)).toBe('4/8/15');
  });

  it('converts local tangent offsets and geographic positions in both directions', () => {
    const origin = localOriginAt(0, 0);
    const position = localToGeographic(origin, 1000, -1000);
    expect(position.latitude).toBeGreaterThan(0);
    expect(position.longitude).toBeGreaterThan(0);
    expect(geographicToLocal(origin, position).x).toBeCloseTo(1000, 3);
    expect(geographicToLocal(origin, position).z).toBeCloseTo(-1000, 3);

    const polarOrigin = localOriginAt(89.8, 179.9);
    const polarPosition = localToGeographic(polarOrigin, 1500, -1200);
    const polarOffset = geographicToLocal(polarOrigin, polarPosition);
    expect(polarOffset.x).toBeCloseTo(1500, 3);
    expect(polarOffset.z).toBeCloseTo(-1200, 3);
  });

  it('inverts tangent projection accurately and rejects offsets outside its hemisphere', () => {
    for (const origin of [localOriginAt(0, 0), localOriginAt(89.8, 179.9), localOriginAt(-89.8, -179.9)]) {
      const position = localToGeographic(origin, 1_000_000, -750_000);
      const offset = geographicToLocal(origin, position);
      expect(offset.x).toBeCloseTo(1_000_000, 5);
      expect(offset.z).toBeCloseTo(-750_000, 5);
    }
    expect(() => localToGeographic(localOriginAt(0, 0), EARTH_RADIUS_METERS + 1, 0)).toThrow(RangeError);
    expect(() => localToGeographic(localOriginAt(0, 0), Infinity, 0)).toThrow(RangeError);
  });

  it('moves projected actors by canonical meters across the antimeridian and at high latitude', () => {
    const origin = geographicToPlanetPosition(60, 179.99999);
    const start = planetPositionToGeographic(origin.x, origin.z);
    const moved = movePlanetPosition(origin, 90, 4);
    expect(moved.geographic.longitude).toBeLessThan(-179.99);
    expect(geographicDistanceMeters(start, moved.geographic)).toBeCloseTo(4, 6);
    expect(planetDistanceMeters(origin, moved)).toBeCloseTo(4, 3);
    expect(planetPositionToGeographic(moved.x, moved.z).longitude).toBeCloseTo(moved.geographic.longitude, 5);
  });

  it('round-trips a shared tangent frame across the date line and both poles', () => {
    for (const [latitude, longitude, bearing] of [[60, 179.99999, 90], [89.9999, 20, 0], [-89.9999, -20, 180]]) {
      const start = geographicToPlanetPosition(latitude, longitude);
      const destination = movePlanetPosition(start, bearing, 40);
      const frame = new PlanetTangentFrame(start);
      const offset = frame.toLocal(destination);
      expect(Math.hypot(offset.x, offset.z)).toBeCloseTo(40, 3);
      const restored = frame.toPlanet(offset);
      expect(planetDistanceMeters(restored, destination)).toBeLessThan(0.01);
      expect(Math.hypot(restored.x - destination.x, restored.z - destination.z)).toBeLessThan(0.1);
    }
    const frame = new PlanetTangentFrame(geographicToPlanetPosition(0, 0));
    expect(() => frame.toLocal(geographicToPlanetPosition(0, -180))).toThrow(RangeError);
  });

  it('selects meaningful climate zones and opposite hemispheric seasons', () => {
    expect(climateZone(82, 50, 100, 0.4)).toBe('polar-ice');
    expect(climateZone(20, 100, 1000, 0.1)).toBe('hot-desert');
    expect(climateZone(0, 20, 50, 0.9)).toBe('tropical-rainforest');
    expect(seasonsForLatitude(45, 40)).not.toBe(seasonsForLatitude(-45, 40));
  });
});
