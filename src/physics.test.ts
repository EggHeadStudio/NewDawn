import { describe, expect, it } from 'vitest';
import { rayIsObstructed, resolveActorMove, structuralPieceBlocks } from './physics';
import type { StructuralPiece } from './construction';

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
});
