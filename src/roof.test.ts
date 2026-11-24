import { describe, expect, it } from 'vitest';
import type { StructuralPiece } from './construction';
import { planRoofShapes, reconcileRoof, reshapeRoof } from './roof';

function wall(id: string, x: number, z: number, rotation: 0 | 1): StructuralPiece {
  return { id, kind: 'wall', x, z, y: 2, level: 0, rotation, open: false };
}

function room() {
  return [wall('north', 0, -1, 0), wall('south', 0, 1, 0),
    wall('west', -1, 0, 1), wall('east', 1, 0, 1)];
}

describe('automatic roof reconciliation', () => {
  it('waits without charging until affordable, then builds exactly once', () => {
    const pieces = room();
    const stock = { wood: 1, stone: 0, food: 0, water: 0 };
    const request = { y: 2, level: 0 };
    expect(reconcileRoof(pieces, stock, request, true, () => 'roof')).toMatchObject({ status: 'insufficient', required: 2 });
    expect(stock.wood).toBe(1);
    expect(pieces).toHaveLength(4);
    stock.wood++;
    expect(reconcileRoof(pieces, stock, request, true, () => 'roof')).toMatchObject({ status: 'built' });
    expect(stock.wood).toBe(0);
    expect(reconcileRoof(pieces, stock, request, true, () => 'duplicate')).toMatchObject({ status: 'complete' });
    expect(pieces.filter(piece => piece.kind === 'roof').map(piece => piece.id)).toEqual(['roof']);
  });

  describe('pitched roof planning', () => {
    it('creates a continuous gable across an even-width rectangle with a stable ridge direction', () => {
      const cells = [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 0, z: 2 }, { x: 2, z: 2 }, { x: 0, z: 4 }, { x: 2, z: 4 }];
      const plan = planRoofShapes(cells, 'gable');
      expect(plan.fallback).toBe(false);
      expect(plan.shapes.get('0,0')).toEqual({ style: 'gable', axis: 0, heights: [0, 0.45, 0.9] });
      expect(plan.shapes.get('2,0')).toEqual({ style: 'gable', axis: 0, heights: [0.9, 0.45, 0] });
      expect(planRoofShapes(cells, 'gable', 'z').shapes.get('0,0')?.axis).toBe(1);
      expect([...planRoofShapes([...cells].reverse(), 'gable').shapes.entries()].sort())
        .toEqual([...plan.shapes.entries()].sort());
    });

    it('covers irregular L and T footprints with a continuous single-slope fallback', () => {
      for (const cells of [
        [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 0, z: 2 }],
        [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 4, z: 0 }, { x: 2, z: 2 }],
      ]) {
        const { shapes, fallback } = planRoofShapes(cells, 'gable', 'x');
        expect(fallback).toBe(true);
        expect(shapes.size).toBe(cells.length);
        expect([...shapes.values()].every(shape => shape.style === 'single')).toBe(true);
        for (const cell of cells) {
          const next = shapes.get(`${cell.x + 2},${cell.z}`);
          if (next) expect(shapes.get(`${cell.x},${cell.z}`)!.heights[2]).toBeCloseTo(next.heights[0]);
        }
      }
    });

    it('charges once for a gable, and explicitly reshapes an automatic roof without charging', () => {
      const pieces = room();
      const stock = { wood: 2, stone: 0, food: 0, water: 0 };
      const request = { y: 2, level: 0, style: 'gable' as const };
      expect(reconcileRoof(pieces, stock, request, true, () => 'roof')).toMatchObject({ status: 'built', spent: 2 });
      expect(pieces.find(piece => piece.id === 'roof')?.roofShape?.heights).toEqual([0, 0.9, 0]);
      expect(reshapeRoof(pieces, { ...request, style: 'single' }, 0, 0)).toEqual({ status: 'changed', fallback: false });
      expect(pieces.find(piece => piece.id === 'roof')?.roofShape?.style).toBe('single');
      expect(stock.wood).toBe(0);
      expect(reconcileRoof(pieces, stock, request, true, () => 'duplicate').status).toBe('complete');
      expect(pieces.filter(piece => piece.kind === 'roof')).toHaveLength(1);
    });

    it('never reshapes manual roofs or overlaps upper structures', () => {
      const pieces = room();
      pieces.push({ id: 'manual', kind: 'roof', x: 0, z: 0, y: 2, level: 0, rotation: 0, open: false });
      expect(reshapeRoof(pieces, { y: 2, level: 0, style: 'gable' }, 0, 0).status).toBe('incomplete');
      pieces[4].automatic = true;
      pieces.push({ id: 'upper-wall', kind: 'wall', x: 0, z: 1, y: 4.4, level: 1, rotation: 0, open: false });
      expect(reshapeRoof(pieces, { y: 2, level: 0, style: 'gable' }, 0, 0).status).toBe('upper-conflict');
      expect(pieces[4].roofShape).toBeUndefined();
    });

    it('retries a pitched roof with its original style after an insufficient payment', () => {
      const pieces = room();
      const stock = { wood: 1, stone: 0, food: 0, water: 0 };
      const request = { y: 2, level: 0, style: 'single' as const, axis: 'z' as const };
      expect(reconcileRoof(pieces, stock, request, true, () => 'roof')).toMatchObject({ status: 'insufficient', required: 2 });
      expect(stock.wood).toBe(1);
      stock.wood = 2;
      expect(reconcileRoof(pieces, stock, request, true, () => 'roof')).toMatchObject({ status: 'built', spent: 2 });
      expect(pieces.find(piece => piece.id === 'roof')?.roofShape).toMatchObject({ style: 'single', axis: 1 });
      expect(stock.wood).toBe(0);
    });
  });

  it('keeps manual roofs and upper floors and refunds automatic roofs after opening a room', () => {
    const stock = { wood: 10, stone: 0, food: 0, water: 0 };
    const request = { y: 2, level: 0 };
    const pieces = room();
    pieces.push({ id: 'upper', kind: 'floor', x: 0, z: 0, y: 4.4, level: 1, rotation: 0, open: false });
    expect(reconcileRoof(pieces, stock, request, true, () => 'roof').status).toBe('complete');
    pieces.pop();
    pieces.push({ id: 'manual', kind: 'roof', x: 0, z: 0, y: 2, level: 0, rotation: 0, open: false });
    expect(reconcileRoof(pieces, stock, request, true, () => 'roof').status).toBe('complete');
    pieces.pop();
    expect(reconcileRoof(pieces, stock, request, false, () => 'roof').status).toBe('disabled');
    expect(reconcileRoof(pieces, stock, request, true, () => 'roof').status).toBe('built');
    pieces.splice(0, 1);
    expect(reconcileRoof(pieces, stock, request, true, () => 'duplicate')).toMatchObject({ status: 'complete', removed: 1 });
    expect(stock.wood).toBe(9);
    expect(pieces.some(piece => piece.kind === 'roof')).toBe(false);
  });

  it('roofs separate rooms independently without charging a room twice', () => {
    const pieces = [...room(), wall('north2', 2, -1, 0), wall('south2', 2, 1, 0), wall('east2', 3, 0, 1)];
    const stock = { wood: 2, stone: 0, food: 0, water: 0 };
    let id = 0;
    const request = { y: 2, level: 0 };
    expect(reconcileRoof(pieces, stock, request, true, () => `roof${++id}`))
      .toMatchObject({ status: 'insufficient', required: 2, spent: 2 });
    expect(pieces.filter(piece => piece.kind === 'roof')).toHaveLength(1);
    expect(stock.wood).toBe(0);
    stock.wood = 2;
    expect(reconcileRoof(pieces, stock, request, true, () => `roof${++id}`))
      .toMatchObject({ status: 'built', spent: 2 });
    expect(pieces.filter(piece => piece.kind === 'roof')).toHaveLength(2);
    expect(stock.wood).toBe(0);
  });
});
