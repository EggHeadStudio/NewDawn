import { enclosedCells, FLOOR_HEIGHT, pieceCosts, removePiece, type RoofShape, type RoofStyle, type StructuralPiece } from './construction';
import { spend, type Inventory } from './gameplay';

export type RoofAxis = 'auto' | 'x' | 'z';
export type RoofRequest = { y: number; level: number; style?: RoofStyle; axis?: RoofAxis };
export type RoofResult = {
  status: 'complete' | 'built' | 'insufficient' | 'limit' | 'too-large' | 'disabled';
  required: number;
  spent: number;
  removed: number;
  fallback?: boolean;
  flatFallback?: boolean;
};

export function roomGroups(cells: Array<{ x: number; z: number }>, pieces: readonly StructuralPiece[], y: number) {
  const edges = new Set(pieces.filter(piece =>
    (piece.kind === 'wall' || piece.kind === 'doorframe' || piece.kind === 'windowframe') && Math.abs(piece.y - y) < 0.05)
    .map(piece => `${piece.x},${piece.z},${piece.rotation}`));
  const remaining = new Set(cells.map(cell => `${cell.x},${cell.z}`));
  const groups: Array<Array<{ x: number; z: number }>> = [];
  for (const cell of cells) {
    if (!remaining.delete(`${cell.x},${cell.z}`)) continue;
    const group = [cell];
    for (let i = 0; i < group.length; i++) {
      const { x, z } = group[i];
      for (const next of [
        { x: x + 2, z, edge: `${x + 1},${z},1` },
        { x: x - 2, z, edge: `${x - 1},${z},1` },
        { x, z: z + 2, edge: `${x},${z + 1},0` },
        { x, z: z - 2, edge: `${x},${z - 1},0` },
      ]) {
        if (!edges.has(next.edge) && remaining.delete(`${next.x},${next.z}`)) group.push({ x: next.x, z: next.z });
      }
    }
    groups.push(group);
  }
  return groups;
}

export function planRoofShapes(cells: Array<{ x: number; z: number }>, style: RoofStyle, orientation: RoofAxis = 'auto') {
  const shapes = new Map<string, RoofShape>();
  if (style === 'flat' || !cells.length) return { shapes, fallback: false };
  const minX = Math.min(...cells.map(cell => cell.x)), maxX = Math.max(...cells.map(cell => cell.x));
  const minZ = Math.min(...cells.map(cell => cell.z)), maxZ = Math.max(...cells.map(cell => cell.z));
  const rectangular = cells.length === ((maxX - minX) / 2 + 1) * ((maxZ - minZ) / 2 + 1);
  const effective = style === 'gable' && !rectangular ? 'single' : style;
  const axis: 0 | 1 = orientation === 'x' ? 0 : orientation === 'z' ? 1 : maxX - minX <= maxZ - minZ ? 0 : 1;
  const min = (axis === 0 ? minX : minZ) - 1;
  const max = (axis === 0 ? maxX : maxZ) + 1;
  const height = (position: number) => {
    const t = (position - min) / (max - min);
    return effective === 'gable' ? 0.9 * (1 - Math.abs(2 * t - 1)) : 0.9 * t;
  };
  for (const cell of cells) {
    const position = axis === 0 ? cell.x : cell.z;
    shapes.set(`${cell.x},${cell.z}`, { style: effective, axis, heights: [height(position - 1), height(position), height(position + 1)] });
  }
  return { shapes, fallback: effective !== style };
}

function hasUpperConflict(group: Array<{ x: number; z: number }>, pieces: readonly StructuralPiece[], y: number) {
  const cells = new Set(group.map(cell => `${cell.x},${cell.z}`));
  return pieces.some(piece => {
    if (piece.y < y + FLOOR_HEIGHT - 0.05 || piece.y >= y + FLOOR_HEIGHT + 1.2) return false;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (cells.has(`${piece.x + dx},${piece.z + dz}`)) return true;
    }
    return false;
  });
}

function hasAdjacentRoof(group: Array<{ x: number; z: number }>, pieces: readonly StructuralPiece[], y: number) {
  const cells = new Set(group.map(cell => `${cell.x},${cell.z}`));
  return pieces.some(piece => piece.kind === 'roof' && Math.abs(piece.y - y) < 0.05 && !cells.has(`${piece.x},${piece.z}`)
    && [[2, 0], [-2, 0], [0, 2], [0, -2]].some(([dx, dz]) => cells.has(`${piece.x + dx},${piece.z + dz}`)));
}

export function reshapeRoof(pieces: StructuralPiece[], request: RoofRequest, x: number, z: number) {
  const cells = enclosedCells(pieces, request.y);
  if (!cells) return { status: 'too-large' as const };
  const group = roomGroups(cells, pieces, request.y).find(room => room.some(cell => cell.x === x && cell.z === z));
  if (!group) return { status: 'no-room' as const };
  const roofs = group.map(cell => pieces.find(piece => piece.kind === 'roof' && piece.automatic
    && piece.x === cell.x && piece.z === cell.z && Math.abs(piece.y - request.y) < 0.05));
  if (roofs.some(roof => !roof)) return { status: 'incomplete' as const };
  if (request.style !== 'flat' && hasUpperConflict(group, pieces, request.y)) return { status: 'upper-conflict' as const };
  if (request.style !== 'flat' && hasAdjacentRoof(group, pieces, request.y)) return { status: 'adjacent-roof' as const };
  const plan = planRoofShapes(group, request.style ?? 'flat', request.axis);
  for (const roof of roofs) {
    if (!roof) continue;
    const shape = plan.shapes.get(`${roof.x},${roof.z}`);
    if (shape) roof.roofShape = shape;
    else delete roof.roofShape;
  }
  return { status: 'changed' as const, fallback: plan.fallback };
}

export function reconcileRoof(
  pieces: StructuralPiece[], inventory: Inventory, request: RoofRequest, enabled: boolean, newId: () => string,
): RoofResult {
  const cells = enclosedCells(pieces, request.y);
  if (!cells) return { status: 'too-large', required: 0, spent: 0, removed: 0 };
  const enclosed = new Set(cells.map(cell => `${cell.x},${cell.z}`));
  let removed = 0;
  for (const roof of [...pieces]) {
    if (roof.kind === 'roof' && roof.automatic && Math.abs(roof.y - request.y) < 0.05 && !enclosed.has(`${roof.x},${roof.z}`)) {
      if (removePiece(roof.id, pieces, inventory)) removed++;
    }
  }
  let required = 0;
  let spent = 0;
  let blockedByLimit = false;
  let fallback = false;
  let flatFallback = false;
  for (const group of roomGroups(cells, pieces, request.y)) {
    const missing = group.filter(cell => !pieces.some(piece =>
      piece.x === cell.x && piece.z === cell.z
      && ((piece.kind === 'roof' && Math.abs(piece.y - request.y) < 0.05)
        || (piece.kind === 'floor' && Math.abs(piece.y - request.y - FLOOR_HEIGHT) < 0.05))));
    const cost = missing.length * (pieceCosts.roof.wood ?? 0);
    if (!missing.length) continue;
    if (!enabled || pieces.length + missing.length > 10000 || !spend(inventory, { wood: cost })) {
      required += cost;
      if (pieces.length + missing.length > 10000) blockedByLimit = true;
      continue;
    }
    spent += cost;
    const plan = planRoofShapes(group, request.style ?? 'flat', request.axis);
    const existing = group.map(cell => pieces.find(piece => piece.kind === 'roof' && piece.x === cell.x && piece.z === cell.z
      && Math.abs(piece.y - request.y) < 0.05)).filter((piece): piece is StructuralPiece => Boolean(piece));
    const compatible = !hasUpperConflict(group, pieces, request.y) && !hasAdjacentRoof(group, pieces, request.y)
      && (group.length === missing.length || (existing.length + missing.length === group.length
      && existing.every(piece => piece.automatic && JSON.stringify(piece.roofShape) === JSON.stringify(plan.shapes.get(`${piece.x},${piece.z}`)))));
    fallback ||= plan.fallback || (!compatible && (request.style ?? 'flat') !== 'flat');
    flatFallback ||= !compatible && (request.style ?? 'flat') !== 'flat';
    for (const cell of missing) {
      const shape = compatible ? plan.shapes.get(`${cell.x},${cell.z}`) : undefined;
      pieces.push({ id: newId(), kind: 'roof', ...cell, y: request.y, level: request.level, rotation: 0, open: false, automatic: true,
        ...(shape ? { roofShape: shape } : {}) });
    }
  }
  const status = required ? !enabled ? 'disabled' : blockedByLimit ? 'limit' : 'insufficient' : spent ? 'built' : 'complete';
  return { status, required, spent, removed, fallback, flatFallback };
}
