import { canAfford, spend, type Cost, type Inventory } from './gameplay';
import { PLANET_WIDTH } from './planet';

export type PieceKind = 'floor' | 'wall' | 'doorframe' | 'door' | 'windowframe' | 'window' | 'roof' | 'stairs';
export type PieceRotation = 0 | 1 | 2 | 3;
export type RoofStyle = 'flat' | 'gable' | 'single';
export type RoofShape = { style: 'gable' | 'single'; axis: 0 | 1; heights: [number, number, number] };
export interface StructuralPiece {
  id: string;
  kind: PieceKind;
  x: number;
  z: number;
  y: number;
  level: number;
  rotation: PieceRotation;
  open: boolean;
  automatic?: boolean;
  roofShape?: RoofShape;
}

export const FLOOR_HEIGHT = 2.4;
export const pieceCosts: Record<PieceKind, Cost> = {
  floor: { wood: 2 },
  wall: { wood: 2 },
  doorframe: { wood: 2 },
  door: { wood: 2 },
  windowframe: { wood: 2 },
  window: { wood: 1 },
  roof: { wood: 2 },
  stairs: { wood: 3 },
};

export function isEdgePiece(kind: PieceKind) {
  return kind === 'wall' || kind === 'doorframe' || kind === 'door' || kind === 'windowframe' || kind === 'window';
}

export function snapPiece(kind: PieceKind, x: number, z: number, rotation: PieceRotation) {
  if (!isEdgePiece(kind)) return { x: Math.round(x / 2) * 2, z: Math.round(z / 2) * 2 };
  return rotation === 0
    ? { x: Math.round(x / 2) * 2, z: Math.round((z - 1) / 2) * 2 + 1 }
    : { x: Math.round((x - 1) / 2) * 2 + 1, z: Math.round(z / 2) * 2 };
}

function sameSlot(a: StructuralPiece, b: StructuralPiece) {
  return a.x === b.x && a.z === b.z && Math.abs(a.y - b.y) < 0.05
    && (!isEdgePiece(a.kind) || !isEdgePiece(b.kind) || a.rotation === b.rotation);
}

export function suggestFloorEdge(x: number, z: number, level: number, pieces: readonly StructuralPiece[]) {
  const floors = pieces.filter(piece => piece.kind === 'floor' && piece.level === level);
  const candidates: Array<{ x: number; z: number; y: number; rotation: PieceRotation; distance: number; occupied: boolean }> = [];
  for (const floor of floors) {
    for (const edge of [
      { x: floor.x, z: floor.z - 1, rotation: 0 as const, dx: 0, dz: -2 },
      { x: floor.x, z: floor.z + 1, rotation: 0 as const, dx: 0, dz: 2 },
      { x: floor.x - 1, z: floor.z, rotation: 1 as const, dx: -2, dz: 0 },
      { x: floor.x + 1, z: floor.z, rotation: 1 as const, dx: 2, dz: 0 },
    ]) {
      if (floors.some(other => other.x === floor.x + edge.dx && other.z === floor.z + edge.dz
        && Math.abs(other.y - floor.y) < 0.05)) continue;
      const distance = Math.hypot(x - edge.x, z - edge.z);
      if (distance > 1.35) continue;
      const occupied = pieces.some(piece => (piece.kind === 'wall' || piece.kind === 'doorframe' || piece.kind === 'windowframe')
        && piece.x === edge.x && piece.z === edge.z && piece.rotation === edge.rotation && Math.abs(piece.y - floor.y) < 0.05);
      candidates.push({ x: edge.x, z: edge.z, y: floor.y, rotation: edge.rotation, distance, occupied });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance || Number(a.occupied) - Number(b.occupied)
    || a.rotation - b.rotation || a.x - b.x || a.z - b.z || a.y - b.y);
  return candidates[0];
}

export function replacementTarget(piece: StructuralPiece, pieces: readonly StructuralPiece[]) {
  const replaceable: PieceKind[] = ['wall', 'doorframe', 'windowframe'];
  return replaceable.includes(piece.kind)
    ? pieces.find(other => replaceable.includes(other.kind) && other.kind !== piece.kind && sameSlot(piece, other))
    : undefined;
}

export function replacementProblem(piece: StructuralPiece, pieces: readonly StructuralPiece[], inventory: Inventory) {
  const previous = replacementTarget(piece, pieces);
  if (!previous) return pieceProblem(piece, pieces, inventory);
  if (previous.kind === 'doorframe' && pieces.some(other => other.kind === 'door' && sameSlot(previous, other))) {
    return 'Remove the door before replacing its frame';
  }
  if (previous.kind === 'windowframe' && pieces.some(other => other.kind === 'window' && sameSlot(previous, other))) {
    return 'Remove the glass before replacing its frame';
  }
  const available = { ...inventory };
  for (const resource of Object.keys(pieceCosts[previous.kind]) as Array<keyof Inventory>) {
    available[resource] += Math.floor((pieceCosts[previous.kind][resource] ?? 0) / 2);
  }
  return pieceProblem(piece, pieces.filter(other => other !== previous), available);
}

export function replacePiece(piece: StructuralPiece, pieces: StructuralPiece[], inventory: Inventory) {
  const previous = replacementTarget(piece, pieces);
  if (!previous || replacementProblem(piece, pieces, inventory)) return false;
  const nextInventory = { ...inventory };
  for (const resource of Object.keys(pieceCosts[previous.kind]) as Array<keyof Inventory>) {
    nextInventory[resource] += Math.floor((pieceCosts[previous.kind][resource] ?? 0) / 2);
  }
  if (!spend(nextInventory, pieceCosts[piece.kind])) return false;
  pieces[pieces.indexOf(previous)] = { ...piece, id: previous.id };
  Object.assign(inventory, nextInventory);
  return true;
}

export function pieceProblem(piece: StructuralPiece, pieces: readonly StructuralPiece[], inventory: Inventory) {
  const slot = pieces.filter(other => sameSlot(piece, other));
  if (pieces.some(other => other.roofShape && piece.y >= other.y + FLOOR_HEIGHT - 0.05
    && piece.y < other.y + FLOOR_HEIGHT + 1.2 && Math.abs(piece.x - other.x) <= 1 && Math.abs(piece.z - other.z) <= 1)) {
    return 'Remove the pitched roof before building above it';
  }
  if ((piece.kind === 'roof' || piece.kind === 'floor') && pieces.some(other =>
    other.x === piece.x && other.z === piece.z
    && ((piece.kind === 'roof' && other.kind === 'floor' && Math.abs(piece.y + FLOOR_HEIGHT - other.y) < 0.05)
      || (piece.kind === 'floor' && other.kind === 'roof' && Math.abs(other.y + FLOOR_HEIGHT - piece.y) < 0.05)))) return 'A floor or roof already occupies this height';
  if (piece.kind === 'door' && !slot.some(other => other.kind === 'doorframe')) return 'Build a door frame first';
  if (piece.kind === 'window' && !slot.some(other => other.kind === 'windowframe')) return 'Build a window frame first';
  if (slot.some(other => {
    if (piece.kind === 'door' || other.kind === 'door' || piece.kind === 'window' || other.kind === 'window') return piece.kind === other.kind;
    if (isEdgePiece(piece.kind) && isEdgePiece(other.kind)) return true;
    return piece.kind === other.kind;
  })) return 'That slot is occupied';
  if (!canAfford(inventory, pieceCosts[piece.kind])) return 'Not enough resources';
  return null;
}

export function addPiece(piece: StructuralPiece, pieces: StructuralPiece[], inventory: Inventory) {
  if (pieceProblem(piece, pieces, inventory) || !spend(inventory, pieceCosts[piece.kind])) return false;
  pieces.push(piece);
  return true;
}

export function removePiece(id: string, pieces: StructuralPiece[], inventory: Inventory) {
  const index = pieces.findIndex(piece => piece.id === id);
  if (index < 0) return false;
  const piece = pieces[index];
  if (piece.kind === 'doorframe' && pieces.some(other => other.kind === 'door' && sameSlot(piece, other))) return false;
  if (piece.kind === 'windowframe' && pieces.some(other => other.kind === 'window' && sameSlot(piece, other))) return false;
  pieces.splice(index, 1);
  for (const resource of Object.keys(pieceCosts[piece.kind]) as Array<keyof Inventory>) {
    inventory[resource] += Math.floor((pieceCosts[piece.kind][resource] ?? 0) / 2);
  }
  return true;
}

export function pieceBlocks(piece: StructuralPiece, x: number, y: number, z: number, radius = 0.3) {
  if (!isEdgePiece(piece.kind) || (piece.kind === 'door' && piece.open) || y + 1.5 <= piece.y || y >= piece.y + 2.3) return false;
  const along = piece.rotation === 0 ? x - piece.x : z - piece.z;
  const across = piece.rotation === 0 ? z - piece.z : x - piece.x;
  if (Math.abs(across) >= 0.1 + radius || Math.abs(along) >= 1 + radius) return false;
  if (piece.kind === 'doorframe') return Math.abs(along) > 0.65 - radius;
  return true;
}

export function floorSurface(pieces: readonly StructuralPiece[], x: number, z: number, y: number, ground: number) {
  let surface = ground;
  for (const piece of pieces) {
    if ((piece.kind !== 'floor' && piece.kind !== 'stairs') || Math.abs(x - piece.x) > 1 || Math.abs(z - piece.z) > 1) continue;
    const along = piece.rotation === 0 ? z - piece.z : piece.rotation === 1 ? x - piece.x
      : piece.rotation === 2 ? piece.z - z : piece.x - x;
    const rise = piece.kind === 'stairs' ? Math.max(0, Math.min(1, (along + 1) / 2)) * FLOOR_HEIGHT : 0;
    const top = piece.y + 0.18 + rise;
    if (top <= y + 0.55 && top > surface) surface = top;
  }
  return surface;
}

export function isStructuralPiece(value: unknown): value is StructuralPiece {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const p = value as Record<string, unknown>;
  if (typeof p.id !== 'string' || p.id.length < 1 || p.id.length > 100
    || typeof p.kind !== 'string' || !Object.hasOwn(pieceCosts, p.kind)
    || typeof p.x !== 'number' || !Number.isInteger(p.x) || Math.abs(p.x) > PLANET_WIDTH * 2
    || typeof p.z !== 'number' || !Number.isInteger(p.z) || Math.abs(p.z) > PLANET_WIDTH * 2
    || typeof p.y !== 'number' || !Number.isFinite(p.y) || Math.abs(p.y) > 10000
    || typeof p.level !== 'number' || !Number.isInteger(p.level) || p.level < 0 || p.level > 3
    || (p.rotation !== 0 && p.rotation !== 1 && p.rotation !== 2 && p.rotation !== 3)
    || (p.kind !== 'stairs' && p.rotation !== 0 && p.rotation !== 1)
    || (!isEdgePiece(p.kind as PieceKind) && p.kind !== 'stairs' && p.rotation !== 0) || typeof p.open !== 'boolean'
    || (p.kind !== 'door' && p.open)
    || (p.automatic !== undefined && (p.kind !== 'roof' || typeof p.automatic !== 'boolean'))) return false;
  if (p.roofShape !== undefined) {
    if (p.kind !== 'roof' || !p.automatic || typeof p.roofShape !== 'object' || p.roofShape === null || Array.isArray(p.roofShape)) return false;
    const shape = p.roofShape as Record<string, unknown>;
    const heights = shape.heights;
    if ((shape.style !== 'gable' && shape.style !== 'single') || (shape.axis !== 0 && shape.axis !== 1)
      || !Array.isArray(heights) || heights.length !== 3
      || ![0, 1, 2].every(index => typeof heights[index] === 'number' && Number.isFinite(heights[index]) && heights[index] >= 0 && heights[index] <= 1.2)) return false;
  }
  const snapped = snapPiece(p.kind as PieceKind, p.x, p.z, p.rotation);
  return snapped.x === p.x && snapped.z === p.z;
}

export function enclosedCells(pieces: readonly StructuralPiece[], y: number) {
  const walls = pieces.filter(piece => (piece.kind === 'wall' || piece.kind === 'doorframe' || piece.kind === 'windowframe') && Math.abs(piece.y - y) < 0.05);
  if (!walls.length) return [];
  const edges = new Set(walls.map(piece => `${piece.x},${piece.z},${piece.rotation}`));
  const minX = Math.floor(Math.min(...walls.map(piece => piece.x)) / 2) * 2 - 4;
  const maxX = Math.ceil(Math.max(...walls.map(piece => piece.x)) / 2) * 2 + 4;
  const minZ = Math.floor(Math.min(...walls.map(piece => piece.z)) / 2) * 2 - 4;
  const maxZ = Math.ceil(Math.max(...walls.map(piece => piece.z)) / 2) * 2 + 4;
  if ((maxX - minX) * (maxZ - minZ) > 16384) return null;
  const key = (x: number, z: number) => `${x},${z}`;
  const outside = new Set<string>([key(minX, minZ)]);
  const queue = [{ x: minX, z: minZ }];
  for (let i = 0; i < queue.length; i++) {
    const { x, z } = queue[i];
    const neighbors = [
      { x: x + 2, z, edge: `${x + 1},${z},1` },
      { x: x - 2, z, edge: `${x - 1},${z},1` },
      { x, z: z + 2, edge: `${x},${z + 1},0` },
      { x, z: z - 2, edge: `${x},${z - 1},0` },
    ];
    for (const next of neighbors) {
      const id = key(next.x, next.z);
      if (next.x < minX || next.x > maxX || next.z < minZ || next.z > maxZ || edges.has(next.edge) || outside.has(id)) continue;
      outside.add(id);
      queue.push({ x: next.x, z: next.z });
    }
  }
  const enclosed: Array<{ x: number; z: number }> = [];
  for (let x = minX; x <= maxX; x += 2) {
    for (let z = minZ; z <= maxZ; z += 2) if (!outside.has(key(x, z))) enclosed.push({ x, z });
  }
  return enclosed;
}
