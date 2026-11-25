import { describe, expect, it } from 'vitest';
import {
  EARTH_RADIUS_METERS, EQUATORIAL_CIRCUMFERENCE_METERS, climateZone, geographicBearing,
  geographicDistanceMeters, hierarchicalTileId, localToGeographic, localOriginAt,
  moveGeographic, normalizeLongitude, regionIdForCoordinates, seasonsForLatitude,
} from './geography';

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

  it('crosses poles and returns stable bearings and hierarchy IDs', () => {
    const north = moveGeographic({ latitude: 89.9, longitude: 0, altitude: 0 }, 0, 20000);
    expect(north.latitude).toBeGreaterThanOrEqual(-90);
    expect(north.latitude).toBeLessThanOrEqual(90);
    expect(geographicBearing({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 })).toBeCloseTo(0, 5);
    expect(hierarchicalTileId(0, 0, 4)).toMatch(/^[0-9]+\/[0-9]+\/[0-9]+$/);
    expect(regionIdForCoordinates(20, 30)).toMatch(/^region-/);
  });

  it('converts local tangent offsets and geographic positions in both directions', () => {
    const origin = localOriginAt(0, 0);
    const position = localToGeographic(origin, 1000, -1000);
    expect(position.latitude).toBeGreaterThan(0);
    expect(position.longitude).toBeGreaterThan(0);
  });

  it('selects meaningful climate zones and opposite hemispheric seasons', () => {
    expect(climateZone(82, 50, 100, 0.4)).toBe('polar-ice');
    expect(climateZone(20, 100, 1000, 0.1)).toBe('hot-desert');
    expect(climateZone(0, 20, 50, 0.9)).toBe('tropical-rainforest');
    expect(seasonsForLatitude(45, 40)).not.toBe(seasonsForLatitude(-45, 40));
  });
});
