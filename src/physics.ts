import type { StructuralPiece } from './construction';
import { PlanetTangentFrame, planetDistanceMeters } from './planet';

export type SolidBuilding = { kind: string; x: number; z: number; y: number; radius?: number };

export function structuralPieceBlocks(piece: StructuralPiece, x: number, y: number, z: number, radius = 0.35) {
  if (piece.kind === 'door' && piece.open) return false;
  if (!['wall', 'doorframe', 'door', 'windowframe', 'window', 'roof', 'floor', 'stairs'].includes(piece.kind)) return false;
  if (piece.kind === 'floor' || piece.kind === 'roof') {
    if (piece.kind === 'floor') return false;
    if (piece.kind === 'roof' && y > piece.y - 0.1 && y < piece.y + 0.35) return true;
  }
  if (!['wall', 'doorframe', 'door', 'windowframe', 'window'].includes(piece.kind)) return false;
  if (y + 1.45 <= piece.y || y >= piece.y + 2.35) return false;
  const along = piece.rotation === 0 ? x - piece.x : z - piece.z;
  const across = piece.rotation === 0 ? z - piece.z : x - piece.x;
  if (Math.abs(across) > 0.18 + radius || Math.abs(along) > 1 + radius) return false;
  if (piece.kind === 'doorframe') return Math.abs(along) > 0.58 - radius;
  return true;
}

export function buildingBlocks(building: SolidBuilding, x: number, z: number, radius = 0.35) {
  const size = building.radius ?? (building.kind === 'shelter' ? 2.4 : building.kind === 'storage' ? 1.7 : 1.35);
  return Math.hypot(x - building.x, z - building.z) < size + radius;
}

export function resolveActorMove(
  fromX: number, fromZ: number, nextX: number, nextZ: number,
  y: number, pieces: readonly StructuralPiece[], buildings: readonly SolidBuilding[], radius = 0.35,
) {
  if (pieces.some(piece => structuralPieceBlocks(piece, nextX, y, nextZ, radius))) return { x: fromX, z: fromZ, blocked: true };
  if (buildings.some(building => buildingBlocks(building, nextX, nextZ, radius))) return { x: fromX, z: fromZ, blocked: true };
  return { x: nextX, z: nextZ, blocked: false };
}

export function resolvePlanetActorMove(
  fromX: number, fromZ: number, nextX: number, nextZ: number,
  y: number, pieces: readonly StructuralPiece[], buildings: readonly SolidBuilding[], radius = 0.35,
) {
  const origin = { x: fromX, z: fromZ };
  const destination = { x: nextX, z: nextZ };
  const frame = new PlanetTangentFrame(origin);
  const target = frame.toLocal(destination);
  const travelDistance = planetDistanceMeters(origin, destination);
  const distanceTolerance = 0.01;
  const localPieces = pieces.flatMap(piece => {
    if (planetDistanceMeters(origin, piece) > travelDistance + radius + 1.5 + distanceTolerance) return [];
    const offset = frame.toLocal(piece);
    if (Math.hypot(offset.x - target.x, offset.z - target.z) > radius + 1.5) return [];
    return [{ ...piece, x: offset.x, z: offset.z }];
  });
  const localBuildings = buildings.flatMap(building => {
    const size = building.radius ?? (building.kind === 'shelter' ? 2.4 : building.kind === 'storage' ? 1.7 : 1.35);
    if (planetDistanceMeters(origin, building) > travelDistance + size + radius + distanceTolerance) return [];
    const offset = frame.toLocal(building);
    if (Math.hypot(offset.x - target.x, offset.z - target.z) > size + radius) return [];
    return [{ ...building, x: offset.x, z: offset.z }];
  });
  const resolved = resolveActorMove(0, 0, target.x, target.z, y, localPieces, localBuildings, radius);
  return resolved.blocked ? { x: fromX, z: fromZ, blocked: true } : { x: nextX, z: nextZ, blocked: false };
}

function segmentDistanceSquared(ax: number, az: number, bx: number, bz: number, px: number, pz: number) {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  if (lengthSq === 0) return (px - ax) * (px - ax) + (pz - az) * (pz - az);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lengthSq));
  const qx = ax + t * dx;
  const qz = az + t * dz;
  return (px - qx) * (px - qx) + (pz - qz) * (pz - qz);
}

function segmentsTouch(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number) {
  const cross = (x1: number, z1: number, x2: number, z2: number) => x1 * z2 - z1 * x2;
  const denominator = cross(bx - ax, bz - az, dx - cx, dz - cz);
  if (Math.abs(denominator) > 1e-9) {
    const t = cross(cx - ax, cz - az, dx - cx, dz - cz) / denominator;
    const u = cross(cx - ax, cz - az, bx - ax, bz - az) / denominator;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true;
  }
  const tolerance = 0.01;
  return segmentDistanceSquared(ax, az, bx, bz, cx, cz) <= tolerance
    || segmentDistanceSquared(ax, az, bx, bz, dx, dz) <= tolerance
    || segmentDistanceSquared(cx, cz, dx, dz, ax, az) <= tolerance
    || segmentDistanceSquared(cx, cz, dx, dz, bx, bz) <= tolerance;
}

export function rayIsObstructed(
  fromX: number, fromY: number, fromZ: number,
  toX: number, toY: number, toZ: number,
  pieces: readonly StructuralPiece[], buildings: readonly SolidBuilding[],
) {
  for (const piece of pieces) {
    if (piece.kind === 'door' && piece.open) continue;
    if (!['wall', 'doorframe', 'door', 'windowframe', 'window', 'roof'].includes(piece.kind)) continue;
    if (piece.kind === 'roof' && Math.min(fromY, toY) >= piece.y + 0.25) continue;
    if (Math.max(fromY, toY) < piece.y - 0.1 || Math.min(fromY, toY) > piece.y + 2.35) continue;
    const along = piece.rotation === 0 ? piece.x : piece.z;
    const across = piece.rotation === 0 ? piece.z : piece.x;
    const spans = piece.kind === 'doorframe'
      ? [[along - 1, along - 0.58], [along + 0.58, along + 1]]
      : [[along - 1, along + 1]];
    if (spans.some(([a, b]) => piece.rotation === 0
      ? segmentsTouch(fromX, fromZ, toX, toZ, a, across, b, across)
      : segmentsTouch(fromX, fromZ, toX, toZ, across, a, across, b))) return true;
  }
  return buildings.some(building =>
    segmentDistanceSquared(fromX, fromZ, toX, toZ, building.x, building.z)
    < (building.radius ?? 1.8) ** 2
  );
}
