export type PaintPreset = 'natural' | 'dark' | 'white' | 'red' | 'blue' | 'green' | 'stone';

export interface PaintStroke {
  x: number;
  y: number;
  color: string;
  size: number;
  erase?: boolean;
}

export interface SurfacePaint {
  pieceId: string;
  surface: 'front' | 'floor';
  color: string;
  strokes: PaintStroke[];
}

export const paintColors: Record<PaintPreset, { color: string; label: string }> = {
  natural: { color: '#c18a54', label: 'Natural wood' },
  dark: { color: '#6f4b32', label: 'Dark wood' },
  white: { color: '#d9d6c2', label: 'Whitewashed' },
  red: { color: '#a94f43', label: 'Red paint' },
  blue: { color: '#557d91', label: 'Blue paint' },
  green: { color: '#66805a', label: 'Green paint' },
  stone: { color: '#858b84', label: 'Grey stone' },
};

export function isSurfacePaint(value: unknown): value is SurfacePaint {
  if (typeof value !== 'object' || value === null) return false;
  const paint = value as Record<string, unknown>;
  return typeof paint.pieceId === 'string' && paint.pieceId.length > 0 && paint.pieceId.length <= 128
    && (paint.surface === 'front' || paint.surface === 'floor')
    && typeof paint.color === 'string'
    && /^#[0-9a-f]{6}$/i.test(paint.color)
    && Array.isArray(paint.strokes) && paint.strokes.length <= 500
    && paint.strokes.every(stroke => {
      if (typeof stroke !== 'object' || stroke === null) return false;
      const s = stroke as Record<string, unknown>;
      return typeof s.x === 'number' && typeof s.y === 'number' && s.x >= 0 && s.x <= 1 && s.y >= 0 && s.y <= 1
        && typeof s.size === 'number' && s.size >= 0.01 && s.size <= 0.5
        && typeof s.color === 'string' && /^#[0-9a-f]{6}$/i.test(s.color)
        && (s.erase === undefined || typeof s.erase === 'boolean');
    });
}
