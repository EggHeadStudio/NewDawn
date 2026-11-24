import { describe, expect, it } from 'vitest';
import { addPiece, enclosedCells, floorSurface, pieceBlocks, pieceProblem, removePiece, replacePiece, replacementProblem, snapPiece, suggestFloorEdge, type PieceKind, type StructuralPiece } from './construction';
import type { Inventory } from './gameplay';

function piece(kind: PieceKind, x = 0, z = 1, y = 2, level = 0): StructuralPiece {
  return { id: `${kind}-${x}-${z}-${level}`, kind, x, z, y, level, rotation: 0, open: false };
}
function inventory(): Inventory { return { wood: 12, stone: 0, food: 0, water: 0 }; }

describe('modular construction', () => {
  it('snaps floors to cells and rotated walls to edges, including negative coordinates and chunk boundaries', () => {
    expect(snapPiece('floor', -1.2, 24.9, 0)).toEqual({ x: -2, z: 24 });
    expect(snapPiece('wall', 24.1, 23.8, 0)).toEqual({ x: 24, z: 23 });
    expect(snapPiece('wall', 24.1, 23.8, 1)).toEqual({ x: 25, z: 24 });
  });

  it('suggests the nearest exposed floor edge on irregular footprints and the selected level', () => {
    const floors = [piece('floor', 0, 0), piece('floor', 2, 0), piece('floor', 0, 2), piece('floor', 0, 0, 4.4, 1)];
    expect(suggestFloorEdge(0.1, -0.9, 0, floors)).toMatchObject({ x: 0, z: -1, rotation: 0, y: 2 });
    expect(suggestFloorEdge(-0.9, 0.1, 0, floors)).toMatchObject({ x: -1, z: 0, rotation: 1, y: 2 });
    expect(suggestFloorEdge(2.9, 0.1, 0, floors)).toMatchObject({ x: 3, z: 0, rotation: 1, y: 2 });
    expect(suggestFloorEdge(0, -1, 1, floors)).toMatchObject({ x: 0, z: -1, y: 4.4 });
    expect(suggestFloorEdge(50, 50, 0, floors)).toBeUndefined();
    const interior = suggestFloorEdge(1, 0, 0, floors);
    expect(interior && `${interior.x},${interior.z},${interior.rotation}`).not.toBe('1,0,1');
    const occupied = piece('wall', 0, -1);
    expect(suggestFloorEdge(0, 0, 0, [...floors, occupied])).toMatchObject({ x: -1, z: 0 });
  });

  it('replaces a wall atomically with a frame while preserving identity and guarding installed doors', () => {
    const wall = piece('wall');
    const pieces = [wall];
    const stock = { ...inventory(), wood: 1 };
    const frame = piece('doorframe');
    expect(replacementProblem(frame, pieces, stock)).toBeNull();
    expect(replacePiece(frame, pieces, stock)).toBe(true);
    expect(stock.wood).toBe(0);
    expect(pieces).toEqual([{ ...frame, id: wall.id }]);
    expect(replacePiece(frame, pieces, stock)).toBe(false);
    expect(pieces).toHaveLength(1);
    expect(replacePiece(wall, pieces, stock)).toBe(false);
    expect(stock.wood).toBe(0);
    stock.wood = 5;
    expect(addPiece(piece('door'), pieces, stock)).toBe(true);
    const before = pieces.map(value => ({ ...value }));
    const beforeWood = stock.wood;
    expect(replacementProblem(wall, pieces, stock)).toBe('Remove the door before replacing its frame');
    expect(replacePiece(wall, pieces, stock)).toBe(false);
    expect(pieces).toEqual(before);
    expect(stock.wood).toBe(beforeWood);
  });

  it('replaces a wall with a window frame and protects installed glass', () => {
    const wall = piece('wall');
    const pieces = [wall];
    const stock = inventory();
    const frame = piece('windowframe');
    const glass = piece('window');
    expect(pieceProblem(glass, pieces, stock)).toBe('Build a window frame first');
    expect(replacePiece(frame, pieces, stock)).toBe(true);
    expect(addPiece(glass, pieces, stock)).toBe(true);
    expect(pieceBlocks(frame, 0, 2, 1)).toBe(true);
    expect(pieceBlocks(glass, 0, 2, 1)).toBe(true);
    expect(removePiece(wall.id, pieces, stock)).toBe(false);
    expect(replacementProblem(wall, pieces, stock)).toBe('Remove the glass before replacing its frame');
    expect(replacePiece(wall, pieces, stock)).toBe(false);
    expect(pieces).toHaveLength(2);
    expect(removePiece(glass.id, pieces, stock)).toBe(true);
    expect(replacePiece(wall, pieces, stock)).toBe(true);
    expect(pieces[0]).toMatchObject({ id: wall.id, kind: 'wall' });
  });

  it('charges only for valid slots, permits vertical stacking, and refunds once', () => {
    const stock = inventory();
    const pieces: StructuralPiece[] = [];
    const wall = piece('wall');
    expect(addPiece(wall, pieces, stock)).toBe(true);
    expect(stock.wood).toBe(10);
    expect(addPiece({ ...wall, id: 'duplicate' }, pieces, stock)).toBe(false);
    expect(stock.wood).toBe(10);
    expect(addPiece(piece('wall', 0, 1, 4.4, 1), pieces, stock)).toBe(true);
    expect(removePiece(wall.id, pieces, stock)).toBe(true);
    expect(removePiece(wall.id, pieces, stock)).toBe(false);
    expect(stock.wood).toBe(9);
    expect(addPiece(piece('wall', 2, 1), pieces, { ...stock, wood: 0 })).toBe(false);
  });

  it('requires a frame, rejects overlapping walls, and protects a frame with a door', () => {
    const pieces: StructuralPiece[] = [];
    const stock = inventory();
    const door = piece('door');
    expect(pieceProblem(door, pieces, stock)).toBe('Build a door frame first');
    expect(addPiece(piece('doorframe'), pieces, stock)).toBe(true);
    expect(addPiece(piece('wall'), pieces, stock)).toBe(false);
    expect(addPiece(door, pieces, stock)).toBe(true);
    expect(removePiece('doorframe-0-1-0', pieces, stock)).toBe(false);
    expect(removePiece(door.id, pieces, stock)).toBe(true);
    expect(removePiece('doorframe-0-1-0', pieces, stock)).toBe(true);
  });

  it('blocks walls and closed doors but allows the opening and different elevations', () => {
    const wall = piece('wall');
    expect(pieceBlocks(wall, 0, 2, 1)).toBe(true);
    expect(pieceBlocks(wall, 0, 5, 1)).toBe(false);
    const frame = piece('doorframe');
    expect(pieceBlocks(frame, 0, 2, 1)).toBe(false);
    expect(pieceBlocks(frame, 0.8, 2, 1)).toBe(true);
    expect(pieceBlocks(piece('door'), 0, 2, 1)).toBe(true);
    expect(pieceBlocks({ ...piece('door'), open: true }, 0, 2, 1)).toBe(false);
  });

  it('supports walking on nearby floor surfaces without teleporting to higher floors', () => {
    const floor = piece('floor', 0, 0, 2);
    const upper = piece('floor', 0, 0, 4.4, 1);
    expect(floorSurface([floor, upper], 0, 0, 2, 1.8)).toBeCloseTo(2.18);
    expect(floorSurface([floor, upper], 0, 0, 4.58, 1.8)).toBeCloseTo(4.58);
    expect(floorSurface([floor], 3, 0, 2, 1.8)).toBe(1.8);
  });

  it('raises a walker along rotated stairs and reaches an upper floor', () => {
    const stairs = piece('stairs', 0, 0, 2);
    const upper = piece('floor', 0, 2, 4.4, 1);
    let height = 2.18;
    for (let z = -0.9; z <= 1; z += 0.1) height = floorSurface([stairs, upper], 0, z, height, 1.8);
    height = floorSurface([stairs, upper], 0, 1.1, height, 1.8);
    expect(height).toBeCloseTo(4.58);
    const rotated = { ...stairs, rotation: 1 as const };
    expect(floorSurface([rotated], -0.5, 0, 2.7, 1.8)).toBeCloseTo(2.78);
    expect(floorSurface([stairs], 0, 0.9, 2.18, 1.8)).toBe(1.8);
  });

  it('detects an irregular enclosure and preserves rooms when a framed door opens', () => {
    const horizontal = (x: number, z: number, kind: PieceKind = 'wall') => piece(kind, x, z);
    const vertical = (x: number, z: number) => ({ ...piece('wall', x, z), rotation: 1 as const });
    const walls = [
      horizontal(0, -1), horizontal(2, -1), horizontal(0, 3),
      horizontal(2, 1, 'doorframe'), horizontal(0, 1),
      vertical(-1, 0), vertical(-1, 2), vertical(1, 2), vertical(3, 0),
    ];
    const withDoor = [...walls, { ...piece('door', 2, 1), open: true }];
    expect(enclosedCells(withDoor, 2)).toEqual([{ x: 0, z: 0 }, { x: 0, z: 2 }, { x: 2, z: 0 }]);
    expect(enclosedCells(walls.slice(0, -1), 2)).toEqual([{ x: 0, z: 2 }]);
    expect(enclosedCells(walls, 4.4)).toEqual([]);
  });

  it('detects adjacent rooms separated by a shared wall', () => {
    const horizontal = (x: number, z: number) => piece('wall', x, z);
    const vertical = (x: number) => ({ ...piece('wall', x, 0), rotation: 1 as const });
    expect(enclosedCells([horizontal(0, -1), horizontal(2, -1), horizontal(0, 1), horizontal(2, 1),
      vertical(-1), vertical(1), vertical(3)], 2)).toEqual([{ x: 0, z: 0 }, { x: 2, z: 0 }]);
  });
});
