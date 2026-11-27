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

export function roadSlots(segments: readonly RoadSegment[]) {
  return new Set(segments.map(segment => `${segment.x},${segment.z}`));
}

export function neighborKind(x: number, z: number, slots: ReadonlySet<string>) {
  return {
    east: slots.has(`${x + 2},${z}`),
    west: slots.has(`${x - 2},${z}`),
    south: slots.has(`${x},${z + 2}`),
    north: slots.has(`${x},${z - 2}`),
  };
}

export function connectionLayout(x: number, z: number, slots: ReadonlySet<string>) {
  const neighbors = neighborKind(x, z, slots);
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
