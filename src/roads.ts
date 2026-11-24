export type RoadKind = 'dirt' | 'gravel' | 'stone';

export interface RoadSegment {
  id: string;
  kind: RoadKind;
  x: number;
  z: number;
  height: number;
  rotation: number;
  width: number;
}

export const roadCosts: Record<RoadKind, { wood: number; stone: number }> = {
  dirt: { wood: 0, stone: 0 },
  gravel: { wood: 0, stone: 2 },
  stone: { wood: 0, stone: 4 },
};

export function neighborKind(x: number, z: number, segments: RoadSegment[]) {
  return {
    east: segments.some(segment => segment.x === x + 2 && segment.z === z),
    west: segments.some(segment => segment.x === x - 2 && segment.z === z),
    south: segments.some(segment => segment.x === x && segment.z === z + 2),
    north: segments.some(segment => segment.x === x && segment.z === z - 2),
  };
}

export function connectionLayout(x: number, z: number, segments: RoadSegment[]) {
  const neighbors = neighborKind(x, z, segments);
  const count = Object.values(neighbors).filter(Boolean).length;
  if (count === 0) return { shape: 'endpoint', rotation: 0 };
  if (count === 1) {
    if (neighbors.north) return { shape: 'endpoint', rotation: 0 };
    if (neighbors.east) return { shape: 'endpoint', rotation: Math.PI / 2 };
    if (neighbors.south) return { shape: 'endpoint', rotation: Math.PI };
    return { shape: 'endpoint', rotation: -Math.PI / 2 };
  }
  if (count === 2 && ((neighbors.north && neighbors.south) || (neighbors.east && neighbors.west))) {
    return { shape: 'straight', rotation: neighbors.east ? Math.PI / 2 : 0 };
  }
  if (count === 2) {
    if (neighbors.north && neighbors.east) return { shape: 'corner', rotation: 0 };
    if (neighbors.east && neighbors.south) return { shape: 'corner', rotation: Math.PI / 2 };
    if (neighbors.south && neighbors.west) return { shape: 'corner', rotation: Math.PI };
    return { shape: 'corner', rotation: -Math.PI / 2 };
  }
  return { shape: 'junction', rotation: 0 };
}
