import { describe, expect, it } from 'vitest';
import { connectionLayout, roadCosts, type RoadSegment } from './roads';
import { isSurfacePaint, paintColors } from './paint';

describe('roads and paint', () => {
  it('connects straight, corner and junction road layouts', () => {
    const road = (x: number, z: number): RoadSegment => ({ id: `${x}-${z}`, kind: 'dirt', x, z, height: 0, rotation: 0, width: 2 });
    expect(connectionLayout(0, 0, [road(-2, 0), road(2, 0)]).shape).toBe('straight');
    expect(connectionLayout(0, 0, [road(0, -2), road(2, 0)]).shape).toBe('corner');
    expect(connectionLayout(0, 0, [road(-2, 0), road(2, 0), road(0, -2)]).shape).toBe('junction');
  });

  it('has distinct road costs and bounded validated paint strokes', () => {
    expect(roadCosts.dirt.stone).toBe(0);
    expect(roadCosts.gravel.stone).toBe(2);
    expect(roadCosts.stone.stone).toBe(4);
    expect(isSurfacePaint({
      pieceId: 'wall-1', surface: 'front', color: paintColors.red.color,
      strokes: [{ x: 0.25, y: 0.6, color: paintColors.red.color, size: 0.1 }],
    })).toBe(true);
    expect(isSurfacePaint({
      pieceId: 'wall-1', surface: 'front', color: 'red',
      strokes: [],
    })).toBe(false);
  });
});
