import { describe, expect, it } from 'vitest';
import { rayIsObstructed, resolveActorMove, resolvePlanetActorMove, structuralPieceBlocks } from './physics';
import type { StructuralPiece } from './construction';
import { geographicToPlanetPosition, movePlanetPosition } from './planet';

const wall: StructuralPiece = { id: 'wall', kind: 'wall', x: 0, z: 2, y: 1, level: 0, rotation: 0, open: false };
const door: StructuralPiece = { id: 'door', kind: 'door', x: 0, z: 2, y: 1, level: 0, rotation: 0, open: false };

describe('unified collision', () => {
  it('blocks solid walls and actors but allows open doors', () => {
    expect(structuralPieceBlocks(wall, 0, 2, 2, 0.35)).toBe(true);
    expect(resolveActorMove(0, 0, 0, 1.8, 1, [wall], []).blocked).toBe(true);
    expect(structuralPieceBlocks({ ...door, open: true }, 0, 2, 2, 0.35)).toBe(false);
  });

  it('uses line of sight and building obstructions consistently', () => {
    expect(rayIsObstructed(0, 1.5, 0, 0, 1.5, 4, [wall], [])).toBe(true);
    expect(rayIsObstructed(0, 1.5, 0, 0, 1.5, 4, [{ ...door, open: true }], [])).toBe(false);
    expect(rayIsObstructed(0, 1.5, 0, 0, 1.5, 4, [], [{ kind: 'storage', x: 0, z: 2, y: 0 }])).toBe(true);
  });

  it('detects wall crossings away from the segment midpoint and permits clear paths and doorframes', () => {
    expect(rayIsObstructed(0.8, 2, 1, 0.8, 2, 10, [wall], [])).toBe(true);
    expect(rayIsObstructed(0, 2, 0, 0, 2, 1, [wall], [])).toBe(false);
    const frame: StructuralPiece = { ...wall, kind: 'doorframe' };
    expect(rayIsObstructed(0, 2, 1, 0, 2, 3, [frame], [])).toBe(false);
    expect(rayIsObstructed(0.85, 2, 1, 0.85, 2, 3, [frame], [])).toBe(true);
    expect(rayIsObstructed(0, 2, 2.8, 4, 2, 2.8, [{ ...wall, rotation: 1 }], [])).toBe(true);
    expect(structuralPieceBlocks(wall, 0.8, 2, 2)).toBe(true);
    expect(structuralPieceBlocks(wall, 0, 2, 0.8)).toBe(false);
  });

  it('resolves actor collision in local tangent meters at high latitude', () => {
    const origin = geographicToPlanetPosition(60, 0);
    const obstacle = movePlanetPosition(origin, 90, 1.5);
    const target = movePlanetPosition(origin, 90, 3);
    const building = { kind: 'lamp', x: obstacle.x, z: obstacle.z, y: 0 };
    expect(resolveActorMove(origin.x, origin.z, target.x, target.z, 0, [], [building]).blocked).toBe(false);
    expect(resolvePlanetActorMove(origin.x, origin.z, target.x, target.z, 0, [], [building])).toEqual({
      x: origin.x, z: origin.z, blocked: true,
    });

    const wallPosition = movePlanetPosition(origin, 90, 2);
    const wallTarget = movePlanetPosition(origin, 90, 2.4);
    const highLatitudeWall = { ...wall, x: wallPosition.x, z: wallPosition.z, y: 0, rotation: 1 as const };
    expect(resolveActorMove(origin.x, origin.z, wallTarget.x, wallTarget.z, 0, [highLatitudeWall], []).blocked).toBe(false);
    expect(resolvePlanetActorMove(origin.x, origin.z, wallTarget.x, wallTarget.z, 0, [highLatitudeWall], []).blocked).toBe(true);
  });

  it('does not project antipodal structures or buildings onto the actor', () => {
    const origin = geographicToPlanetPosition(0, 0);
    const opposite = geographicToPlanetPosition(0, -180);
    const target = movePlanetPosition(origin, 90, 0.1);
    const farWall: StructuralPiece = { ...wall, ...opposite, y: 0 };
    const farBuilding = { kind: 'lamp', ...opposite, y: 0 };
    expect(resolvePlanetActorMove(origin.x, origin.z, target.x, target.z, 0, [farWall], []).blocked).toBe(false);
    expect(resolvePlanetActorMove(origin.x, origin.z, target.x, target.z, 0, [], [farBuilding]).blocked).toBe(false);
  });

});
