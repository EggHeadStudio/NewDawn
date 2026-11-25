import type { StructuralPiece } from './construction';

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
  const along = piece.rotation === 0 ? z - piece.z : x - piece.x;
  const across = piece.rotation === 0 ? x - piece.x : z - piece.z;
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
    const along0 = piece.rotation === 0 ? piece.z - 1 : piece.x - 1;
    const along1 = piece.rotation === 0 ? piece.z + 1 : piece.x + 1;
    const across = piece.rotation === 0 ? piece.x : piece.z;
    const start = piece.rotation === 0 ? { x: fromX, z: fromZ, ax: across, az: along0, bx: across, bz: along1 }
      : { x: fromX, z: fromZ, ax: along0, az: across, bx: along1, bz: across };
    const end = piece.rotation === 0 ? { x: toX, z: toZ } : { x: toX, z: toZ };
    const distance = segmentDistanceSquared(start.ax, start.az, start.bx, start.bz, (fromX + toX) / 2, (fromZ + toZ) / 2);
    if (distance < 0.12) return true;
  }
  return buildings.some(building =>
    segmentDistanceSquared(fromX, fromZ, toX, toZ, building.x, building.z)
    < (building.radius ?? 1.8) ** 2
  );
}
