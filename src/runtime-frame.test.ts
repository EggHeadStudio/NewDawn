import { describe, expect, it } from 'vitest';
import { geographicToPlanetPosition, movePlanetPosition, planetDistanceMeters, planetPositionToGeographic } from './planet';
import { geographicDistanceMeters, moveGeographic, transportBearing } from './geography';
import { PlanetaryRuntimeFrame } from './runtime-frame';

describe('planetary runtime frame', () => {
  it('converts rendered picks back to projected ownership across frame relocation', () => {
    const position = { ...geographicToPlanetPosition(60, 179.99999), y: 7 };
    const frame = new PlanetaryRuntimeFrame(position);
    frame.updateRenderOrigin(position);
    const point = { x: position.x + 1.25, y: 8.5, z: position.z - 2.75 };
    const render = frame.projectedToRender(point);
    expect(frame.renderToProjected(render)).toMatchObject(point);

    const next = movePlanetPosition(position, 90, 40);
    frame.relocate(next);
    frame.updateRenderOrigin(next);
    expect(frame.renderToProjected(frame.projectedToRender(point))).toMatchObject(point);
    expect(planetDistanceMeters(frame.tangent.toPlanet(frame.tangent.toLocal(point)), point)).toBeLessThan(0.001);
  });

  it('moves in the shared frame through relocations, seams and polar vicinities', () => {
    for (const [latitude, longitude, bearing] of [
      [0, 0, 35], [60, 179.99999, 90], [-60, -179.99999, 270],
      [85, 40, 35], [-85, -40, 215], [89.99999, 0, 0], [-89.99999, 0, 180],
    ]) {
      let point = geographicToPlanetPosition(latitude, longitude);
      let geographic = planetPositionToGeographic(point.x, point.z);
      let expected = geographic;
      let heading = bearing;
      let expectedHeading = bearing;
      const frame = new PlanetaryRuntimeFrame(point);
      for (let i = 0; i < 400; i++) {
        const next = frame.move(point, geographic, heading, 0.1);
        const expectedNext = moveGeographic(expected, expectedHeading, 0.1);
        heading = transportBearing(geographic, next.geographic, heading);
        expectedHeading = transportBearing(expected, expectedNext, expectedHeading);
        geographic = next.geographic;
        expected = expectedNext;
        point = next;
        if (geographicDistanceMeters(frame.tangent.origin, geographic) >= 24) frame.relocate(point);
      }
      expect(geographicDistanceMeters(geographic, expected)).toBeLessThan(0.01);
    }
  });

  it('keeps distant actors outside the local frame on their geographic trajectory', () => {
    const frame = new PlanetaryRuntimeFrame(geographicToPlanetPosition(0, 0));
    const point = geographicToPlanetPosition(60, 170);
    const geographic = planetPositionToGeographic(point.x, point.z);
    const result = frame.move(point, geographic, 35, 2);
    const expected = moveGeographic(geographic, 35, 2);
    expect(geographicDistanceMeters(result.geographic, expected)).toBeLessThan(0.001);
  });
});
