import { describe, expect, it } from 'vitest';
import { geographicToPlanetPosition, movePlanetPosition, planetDistanceMeters, PlanetTangentFrame } from './planet';
import { PlanetaryProjectile } from './planetary-projectile';

describe('planetary projectile', () => {
  it('keeps ballistic speed in local meters at distant latitudes and across the seam', () => {
    for (const [latitude, longitude] of [[0, 0], [60, 179.99999], [-60, -179.99999], [85, 40], [-85, -40], [89.99999, 0], [-89.99999, 0]]) {
      const start = { ...geographicToPlanetPosition(latitude, longitude), y: 10 };
      const projectile = new PlanetaryProjectile(start, { x: 8.8, y: 2.4, z: 6.6 });
      let point = start;
      for (let i = 0; i < 30; i++) point = projectile.step(1 / 30);
      expect(planetDistanceMeters(start, point)).toBeCloseTo(11, 3);
      expect(point.y).toBeCloseTo(10 + 2.4 - 9.8 * 31 / 60, 5);
      expect(projectile.velocity.y).toBeCloseTo(-7.4, 5);
    }
  });

  it('keeps the projected copy continuous when flight crosses either pole', () => {
    for (const sign of [-1, 1]) {
      const start = { ...geographicToPlanetPosition(sign * 89.99999, 0), y: 10 };
      const projectile = new PlanetaryProjectile(start, { x: 0, y: 0, z: sign * 11 });
      let previous = start;
      for (let i = 0; i < 30; i++) {
        const point = projectile.step(1 / 30);
        expect(Math.hypot(point.x - previous.x, point.z - previous.z)).toBeLessThan(0.5);
        previous = point;
      }
      expect(planetDistanceMeters(start, previous)).toBeCloseTo(11, 3);
    }
  });

  it('preserves an in-flight trajectory when the shared frame relocates', () => {
    for (const [latitude, longitude] of [[0, 0], [60, 179.99999], [85, 40], [-85, -40], [89.99999, 0]]) {
      const start = { ...geographicToPlanetPosition(latitude, longitude), y: 10 };
      const a = new PlanetaryProjectile(start, { x: 8.8, y: 2.4, z: 6.6 });
      const b = new PlanetaryProjectile(start, { x: 8.8, y: 2.4, z: 6.6 });
      for (let i = 0; i < 10; i++) { a.step(1 / 30); b.step(1 / 30); }
      const newOrigin = movePlanetPosition(start, 35, 24);
      b.rebase(new PlanetTangentFrame(newOrigin));
      for (let i = 0; i < 20; i++) {
        const expected = a.step(1 / 30);
        const actual = b.step(1 / 30);
        expect(planetDistanceMeters(expected, actual)).toBeLessThan(0.001);
        expect(actual.y).toBeCloseTo(expected.y, 6);
      }
    }
  });
});
