import {
  EARTH_RADIUS_METERS, geographicDistanceMeters, geographicToLocal, localToGeographic,
  type GeographicPosition,
} from './geography';
import { geographicToPlanetPosition, nearestPlanetPosition, planetPositionToGeographic } from './planet';
import type { StructuralPiece } from './construction';
import type { SolidBuilding } from './physics';
import type { AnimalState, Species } from './wildlife';

/**
 * Collision uses canonical geography when present. Projected x/z are retained
 * for the existing terrain, render and save paths.
 */
export type PlanetPoint = Readonly<{ x: number; z: number; geographic?: GeographicPosition }>;
/** Bearing is clockwise from geographic north, in degrees. */
export type CollisionPose = Readonly<{ position: PlanetPoint; bottomY: number; bearingDegrees?: number }>;
export type CollisionBody = Readonly<{
  id: string; pose: CollisionPose; radius: number; height: number;
  /** Horizontal capsule: round radius plus a center segment extending halfLength in each direction. */
  capsule?: Readonly<{ halfLength: number }>;
}>;
export type CollisionObstacle =
  | Readonly<{ type: 'circle'; id: string; position: PlanetPoint; radius: number; bottomY: number; topY: number }>
  | Readonly<{ type: 'segment'; id: string; a: PlanetPoint; b: PlanetPoint; radius: number; bottomY: number; topY: number }>;
export type CollisionQuery = Readonly<{ from: PlanetPoint; to: PlanetPoint; radius: number; limit: number }>;
export type CollisionQueryResult =
  | { complete: true; obstacles: readonly CollisionObstacle[] }
  | { complete: false; reason: 'unavailable' | 'overflow' };
export type CollisionMoveResult = {
  pose: CollisionPose;
  travelledM: number;
  status: 'clear' | 'slid' | 'blocked' | 'separating' | 'unresolved' | 'incomplete';
  blocker?: string;
  reason?: 'unavailable' | 'overflow';
};
export type CollisionAttackResult = {
  allowed: boolean;
  reason?: 'out-of-reach' | 'blocked' | 'unavailable' | 'overflow';
  blocker?: string;
};
export type CollisionMoveRequest = {
  body: CollisionBody;
  to: CollisionPose;
  dt: number;
  includeStatic?: boolean;
  recoveryDistance?: number;
  detour?: boolean;
  canOccupy?: (point: PlanetPoint) => boolean;
};
export interface WildlifeCollision {
  animalBody(animal: AnimalState, at?: PlanetPoint): CollisionBody;
  playerBody(): CollisionBody;
  moveBody(query: CollisionMoveRequest): CollisionMoveResult;
  canAttack(attacker: CollisionBody, target: CollisionBody, legacyReachM: number): CollisionAttackResult;
}
export interface WildlifeCollisionOptions {
  animals: () => readonly AnimalState[];
  player: () => { body: CollisionBody; driving: boolean };
  rover: () => CollisionBody | null;
  groundY: (animal: AnimalState, at: PlanetPoint) => number;
  flightHeight?: (id: string) => number;
  obstacles: (query: CollisionQuery) => CollisionQueryResult;
}

export const MAX_COLLISION_OBSTACLES = 64;
const MAX_DYNAMIC_ANIMALS = 40;
const MAX_QUERY_CELLS = 128;
const CELL_SIZE = 16;
const EPSILON = 1e-7;
const CONTACT_SLOP = 0.005;

type Vector = { x: number; z: number };
type Interval = { enter: number; exit: number };
type LocalObstacle = { id: string; sourceId?: string; a: Vector; b: Vector; radius: number; bottomY: number; topY: number };

function geographic(point: PlanetPoint) {
  return point.geographic ?? planetPositionToGeographic(point.x, point.z);
}

function local(origin: GeographicPosition, point: PlanetPoint): Vector {
  const offset = geographicToLocal(origin, geographic(point));
  // Match PlanetTangentFrame: positive x is east and positive z is north.
  return { x: offset.x, z: -offset.z };
}

function projected(origin: GeographicPosition, reference: PlanetPoint, point: Vector): PlanetPoint {
  if (Math.hypot(point.x, point.z) < EPSILON) {
    return { x: reference.x, z: reference.z, geographic: geographic(reference) };
  }
  const position = { ...localToGeographic(origin, point.x, -point.z), altitude: origin.altitude };
  const raw = geographicToPlanetPosition(position.latitude, position.longitude);
  return { ...nearestPlanetPosition(raw.x, raw.z, reference.x, reference.z), geographic: position };
}

function finitePoint(point: PlanetPoint) {
  const position = geographic(point);
  return Number.isFinite(point.x) && Number.isFinite(point.z)
    && Number.isFinite(position.latitude) && position.latitude >= -90 && position.latitude <= 90
    && Number.isFinite(position.longitude) && Number.isFinite(position.altitude);
}

export function validCollisionQuery(query: CollisionQuery) {
  return finitePoint(query.from) && finitePoint(query.to)
    && Number.isFinite(query.radius) && query.radius >= 0
    && Number.isInteger(query.limit) && query.limit > 0
    && geographicDistanceMeters(geographic(query.from), geographic(query.to)) < 1000;
}

function validObstacle(obstacle: CollisionObstacle) {
  return typeof obstacle.id === 'string' && obstacle.id.length > 0
    && Number.isFinite(obstacle.radius) && obstacle.radius >= 0
    && Number.isFinite(obstacle.bottomY) && Number.isFinite(obstacle.topY)
    && obstacle.topY >= obstacle.bottomY
    && (obstacle.type === 'circle' ? finitePoint(obstacle.position)
      : obstacle.type === 'segment' && finitePoint(obstacle.a) && finitePoint(obstacle.b));
}

function toLocalObstacle(origin: GeographicPosition, obstacle: CollisionObstacle): LocalObstacle {
  const a = local(origin, obstacle.type === 'circle' ? obstacle.position : obstacle.a);
  const b = obstacle.type === 'circle' ? a : local(origin, obstacle.b);
  return { id: obstacle.id, a, b, radius: obstacle.radius, bottomY: obstacle.bottomY, topY: obstacle.topY };
}

function subtract(a: Vector, b: Vector): Vector { return { x: a.x - b.x, z: a.z - b.z }; }
function add(a: Vector, b: Vector): Vector { return { x: a.x + b.x, z: a.z + b.z }; }
function scale(a: Vector, amount: number): Vector { return { x: a.x * amount, z: a.z * amount }; }
function dot(a: Vector, b: Vector) { return a.x * b.x + a.z * b.z; }
function length(a: Vector) { return Math.hypot(a.x, a.z); }
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }

function closestPoint(point: Vector, a: Vector, b: Vector): Vector {
  const ab = subtract(b, a);
  const denominator = dot(ab, ab);
  const t = denominator > EPSILON ? clamp(dot(subtract(point, a), ab) / denominator, 0, 1) : 0;
  return add(a, scale(ab, t));
}

function pointSegmentDistance(point: Vector, a: Vector, b: Vector) {
  return length(subtract(point, closestPoint(point, a, b)));
}

function cross(a: Vector, b: Vector) { return a.x * b.z - a.z * b.x; }

function segmentDistance(a: Vector, b: Vector, c: Vector, d: Vector) {
  const ab = subtract(b, a);
  const cd = subtract(d, c);
  const denominator = cross(ab, cd);
  if (Math.abs(denominator) > EPSILON) {
    const ac = subtract(c, a);
    const t = cross(ac, cd) / denominator;
    const u = cross(ac, ab) / denominator;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
  }
  return Math.min(pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b));
}

function closestSegments(a: Vector, b: Vector, c: Vector, d: Vector): { a: Vector; b: Vector } {
  const ab = subtract(b, a), cd = subtract(d, c);
  const denominator = cross(ab, cd);
  if (Math.abs(denominator) > EPSILON) {
    const ac = subtract(c, a);
    const t = cross(ac, cd) / denominator, u = cross(ac, ab) / denominator;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      const intersection = add(a, scale(ab, t));
      return { a: intersection, b: intersection };
    }
  }
  const pairs = [
    { a, b: closestPoint(a, c, d) }, { a: b, b: closestPoint(b, c, d) },
    { a: closestPoint(c, a, b), b: c }, { a: closestPoint(d, a, b), b: d },
  ];
  return pairs.reduce((best, pair) => length(subtract(pair.a, pair.b)) < length(subtract(best.a, best.b)) ? pair : best);
}

/** Conservative horizontal broad-phase; false means the collider cannot touch this query. */
export function collisionObstacleNearQuery(query: CollisionQuery, obstacle: CollisionObstacle) {
  if (!validCollisionQuery(query) || !validObstacle(obstacle)) return false;
  const origin = geographic(query.from);
  const a = obstacle.type === 'circle' ? obstacle.position : obstacle.a;
  const b = obstacle.type === 'circle' ? a : obstacle.b;
  const travel = geographicDistanceMeters(origin, geographic(query.to));
  const solidLength = geographicDistanceMeters(geographic(a), geographic(b));
  // Orthographic tangent coordinates otherwise put antipodal points on top of the origin.
  if (geographicDistanceMeters(origin, geographic(a)) > travel + query.radius + obstacle.radius + solidLength + 0.02) return false;
  const end = local(origin, query.to);
  const shape = toLocalObstacle(origin, obstacle);
  return segmentDistance({ x: 0, z: 0 }, end, shape.a, shape.b) <= query.radius + shape.radius + 0.01;
}

export function combineCollisionQueries(query: CollisionQuery, ...results: CollisionQueryResult[]): CollisionQueryResult {
  if (!validCollisionQuery(query)) return { complete: false, reason: 'unavailable' };
  const obstacles: CollisionObstacle[] = [];
  const limit = Math.min(query.limit, MAX_COLLISION_OBSTACLES);
  for (const result of results) {
    if (!result.complete) return result;
    for (const obstacle of result.obstacles) {
      if (!validObstacle(obstacle)) return { complete: false, reason: 'unavailable' };
      if (!collisionObstacleNearQuery(query, obstacle)) continue;
      obstacles.push(obstacle);
      if (obstacles.length > limit) return { complete: false, reason: 'overflow' };
    }
  }
  obstacles.sort((a, b) => a.id.localeCompare(b.id));
  return { complete: true, obstacles };
}

function structureObstacles(piece: StructuralPiece): CollisionObstacle[] {
  if (piece.kind === 'door' && piece.open) return [];
  if (!['wall', 'door', 'doorframe', 'window', 'windowframe'].includes(piece.kind)) return [];
  const intervals = piece.kind === 'doorframe' ? [[-1, -0.65], [0.65, 1]] : [[-1, 1]];
  return intervals.map(([start, end], index) => {
    const point = (along: number) => piece.rotation === 0
      ? { x: piece.x + along, z: piece.z }
      : { x: piece.x, z: piece.z + along };
    return { type: 'segment', id: `structure:${piece.id}:${index}`, a: point(start), b: point(end),
      radius: 0.1, bottomY: piece.y, topY: piece.y + 2.3 };
  });
}

function buildingObstacle(building: SolidBuilding, index: number): CollisionObstacle {
  const extra = building as SolidBuilding & { id?: string; height?: number };
  const radius = building.radius ?? (building.kind === 'shelter' ? 2.4 : building.kind === 'storage' ? 1.7 : 1.35);
  return { type: 'circle', id: `building:${extra.id ?? index}`, position: { x: building.x, z: building.z },
    radius, bottomY: building.y, topY: building.y + (extra.height ?? 3) };
}

type Ecef = { x: number; y: number; z: number };
function ecef(point: PlanetPoint): Ecef {
  const position = geographic(point);
  const lat = position.latitude * Math.PI / 180;
  const lon = position.longitude * Math.PI / 180;
  const latitudeRadius = EARTH_RADIUS_METERS * Math.cos(lat);
  return { x: latitudeRadius * Math.cos(lon), y: latitudeRadius * Math.sin(lon), z: EARTH_RADIUS_METERS * Math.sin(lat) };
}

function cellKey(x: number, y: number, z: number) { return `${x},${y},${z}`; }

/**
 * Snapshot the existing structures/buildings once per tick or rebuild on each
 * placement, removal, replacement or door-state change. The index is spherical,
 * so a local query does not scan every saved construction at high latitude.
 */
export function createStructureCollisionQuery(
  structures: readonly StructuralPiece[], buildings: readonly SolidBuilding[],
): (query: CollisionQuery) => CollisionQueryResult {
  const solids = [...structures.flatMap(structureObstacles), ...buildings.map(buildingObstacle)];
  const cells = new Map<string, CollisionObstacle[]>();
  let valid = true;
  for (const solid of solids) {
    if (!validObstacle(solid)) { valid = false; continue; }
    const start = solid.type === 'circle' ? solid.position : solid.a;
    const end = solid.type === 'circle' ? start : solid.b;
    const a = ecef(start), b = ecef(end);
    const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
    const radius = solid.radius + geographicDistanceMeters(geographic(start), geographic(end)) / 2 + 0.01;
    const minX = Math.floor((center.x - radius) / CELL_SIZE), maxX = Math.floor((center.x + radius) / CELL_SIZE);
    const minY = Math.floor((center.y - radius) / CELL_SIZE), maxY = Math.floor((center.y + radius) / CELL_SIZE);
    const minZ = Math.floor((center.z - radius) / CELL_SIZE), maxZ = Math.floor((center.z + radius) / CELL_SIZE);
    if ((maxX - minX + 1) * (maxY - minY + 1) * (maxZ - minZ + 1) > MAX_QUERY_CELLS) {
      valid = false;
      continue;
    }
    for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) for (let z = minZ; z <= maxZ; z++) {
      const key = cellKey(x, y, z);
      const bucket = cells.get(key) ?? [];
      bucket.push(solid);
      cells.set(key, bucket);
    }
  }
  return query => {
    if (!valid || !validCollisionQuery(query)) return { complete: false, reason: 'unavailable' };
    const from = ecef(query.from), to = ecef(query.to);
    const radius = query.radius + 0.02;
    const minX = Math.floor((Math.min(from.x, to.x) - radius) / CELL_SIZE);
    const maxX = Math.floor((Math.max(from.x, to.x) + radius) / CELL_SIZE);
    const minY = Math.floor((Math.min(from.y, to.y) - radius) / CELL_SIZE);
    const maxY = Math.floor((Math.max(from.y, to.y) + radius) / CELL_SIZE);
    const minZ = Math.floor((Math.min(from.z, to.z) - radius) / CELL_SIZE);
    const maxZ = Math.floor((Math.max(from.z, to.z) + radius) / CELL_SIZE);
    if ((maxX - minX + 1) * (maxY - minY + 1) * (maxZ - minZ + 1) > MAX_QUERY_CELLS) {
      return { complete: false, reason: 'overflow' };
    }
    const found = new Map<string, CollisionObstacle>();
    const limit = Math.min(query.limit, MAX_COLLISION_OBSTACLES);
    for (let x = minX; x <= maxX; x++) for (let y = minY; y <= maxY; y++) for (let z = minZ; z <= maxZ; z++) {
      for (const solid of cells.get(cellKey(x, y, z)) ?? []) {
        if (found.has(solid.id) || !collisionObstacleNearQuery(query, solid)) continue;
        found.set(solid.id, solid);
        if (found.size > limit) return { complete: false, reason: 'overflow' };
      }
    }
    return { complete: true, obstacles: [...found.values()].sort((a, b) => a.id.localeCompare(b.id)) };
  };
}

const animalProfiles: Record<Species, { radius: number; height: number }> = {
  deer: { radius: 0.60, height: 1.35 },
  rabbit: { radius: 0.26, height: 0.48 },
  wolf: { radius: 0.72, height: 1.07 },
  bird: { radius: 0.24, height: 0.45 },
  bear: { radius: 0.90, height: 1.50 },
  snake: { radius: 0.55, height: 0.22 },
  squirrel: { radius: 0.14, height: 0.30 },
  reindeer: { radius: 0.80, height: 1.65 },
  moose: { radius: 1.05, height: 2.40 },
  cow: { radius: 0.90, height: 1.65 },
  sheep: { radius: 0.56, height: 1.10 },
  fox: { radius: 0.55, height: 0.70 },
};

function validBody(body: CollisionBody) {
  return typeof body.id === 'string' && body.id.length > 0 && finitePoint(body.pose.position)
    && Number.isFinite(body.pose.bottomY) && Number.isFinite(body.radius) && body.radius >= 0
    && Number.isFinite(body.height) && body.height > 0
    && (body.pose.bearingDegrees === undefined || Number.isFinite(body.pose.bearingDegrees))
    && (body.capsule === undefined || (Number.isFinite(body.capsule.halfLength) && body.capsule.halfLength >= 0
      && body.capsule.halfLength <= 20 && Number.isFinite(body.pose.bearingDegrees)));
}

function bodyObstacle(body: CollisionBody): CollisionObstacle {
  if (body.capsule && body.capsule.halfLength > EPSILON) {
    const origin = geographic(body.pose.position);
    const bearing = body.pose.bearingDegrees! * Math.PI / 180;
    const axis = { x: Math.sin(bearing) * body.capsule.halfLength, z: Math.cos(bearing) * body.capsule.halfLength };
    return { type: 'segment', id: body.id, a: projected(origin, body.pose.position, scale(axis, -1)),
      b: projected(origin, body.pose.position, axis), radius: body.radius,
      bottomY: body.pose.bottomY, topY: body.pose.bottomY + body.height };
  }
  return { type: 'circle', id: body.id, position: body.pose.position, radius: body.radius,
    bottomY: body.pose.bottomY, topY: body.pose.bottomY + body.height };
}

function intersectIntervals(a: Interval | null, b: Interval | null): Interval | null {
  if (!a || !b) return null;
  const enter = Math.max(a.enter, b.enter), exit = Math.min(a.exit, b.exit);
  return enter <= exit + EPSILON ? { enter, exit } : null;
}

function axisInterval(value: number, delta: number, min: number, max: number): Interval | null {
  if (Math.abs(delta) < EPSILON) return value >= min - EPSILON && value <= max + EPSILON ? { enter: 0, exit: 1 } : null;
  const a = (min - value) / delta, b = (max - value) / delta;
  return intersectIntervals({ enter: Math.min(a, b), exit: Math.max(a, b) }, { enter: 0, exit: 1 });
}

function circleInterval(start: Vector, movement: Vector, center: Vector, radius: number): Interval | null {
  const relative = subtract(start, center);
  const a = dot(movement, movement);
  const c = dot(relative, relative) - radius * radius;
  if (a < EPSILON * EPSILON) return c <= EPSILON ? { enter: 0, exit: 1 } : null;
  const b = 2 * dot(relative, movement);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < -EPSILON) return null;
  const root = Math.sqrt(Math.max(0, discriminant));
  return intersectIntervals({ enter: (-b - root) / (2 * a), exit: (-b + root) / (2 * a) }, { enter: 0, exit: 1 });
}

/** A capsule is a rectangle and two circular ends; retain all three intervals. */
function capsuleIntervals(start: Vector, movement: Vector, obstacle: LocalObstacle, radius: number): Interval[] {
  const result: Interval[] = [];
  const edge = subtract(obstacle.b, obstacle.a);
  const edgeLength = length(edge);
  const first = circleInterval(start, movement, obstacle.a, radius);
  if (first) result.push(first);
  if (edgeLength < EPSILON) return result;
  const second = circleInterval(start, movement, obstacle.b, radius);
  if (second) result.push(second);
  const along = scale(edge, 1 / edgeLength);
  const normal = { x: -along.z, z: along.x };
  const relative = subtract(start, obstacle.a);
  const rectangle = intersectIntervals(
    axisInterval(dot(relative, along), dot(movement, along), 0, edgeLength),
    axisInterval(dot(relative, normal), dot(movement, normal), -radius, radius),
  );
  if (rectangle) result.push(rectangle);
  return result;
}

function verticalInterval(bottom: number, delta: number, height: number, obstacle: LocalObstacle) {
  return axisInterval(bottom, delta, obstacle.bottomY - height, obstacle.topY);
}

function verticalOverlap(bottom: number, height: number, obstacle: LocalObstacle) {
  return bottom < obstacle.topY - EPSILON && bottom + height > obstacle.bottomY + EPSILON;
}

function stableSign(a: string, b: string) {
  const pair = a < b ? `${a}|${b}` : `${b}|${a}`;
  let hash = 2166136261;
  for (let i = 0; i < pair.length; i++) hash = Math.imul(hash ^ pair.charCodeAt(i), 16777619);
  const sign = (hash >>> 0) % 2 ? 1 : -1;
  return a < b ? sign : -sign;
}

function outwardNormal(point: Vector, obstacle: LocalObstacle, actorId: string): Vector {
  const offset = subtract(point, closestPoint(point, obstacle.a, obstacle.b));
  const distance = length(offset);
  if (distance > EPSILON) return scale(offset, 1 / distance);
  const edge = subtract(obstacle.b, obstacle.a);
  const edgeLength = length(edge);
  const sign = stableSign(actorId, obstacle.id);
  return edgeLength > EPSILON ? { x: -edge.z / edgeLength * sign, z: edge.x / edgeLength * sign }
    : { x: sign, z: 0 };
}

function overlapDepth(point: Vector, bottom: number, body: CollisionBody, obstacle: LocalObstacle) {
  if (!verticalOverlap(bottom, body.height, obstacle)) return 0;
  return Math.max(0, body.radius + obstacle.radius - pointSegmentDistance(point, obstacle.a, obstacle.b));
}

function canLeaveOverlap(point: Vector, bottom: number, movement: Vector, dy: number,
  obstacle: LocalObstacle, body: CollisionBody) {
  const closest = closestPoint(point, obstacle.a, obstacle.b);
  const offset = subtract(point, closest);
  const distance = length(offset);
  // Distance from the center of a circle/segment is already minimal.
  const horizontalAway = distance < EPSILON || dot(movement, scale(offset, 1 / distance)) >= -EPSILON;
  const below = bottom + body.height - obstacle.bottomY;
  const above = obstacle.topY - bottom;
  const verticalAway = Math.abs(dy) < EPSILON || Math.abs(below - above) < EPSILON
    || (below < above ? dy <= EPSILON : dy >= -EPSILON);
  // On a slope, vertical overlap can grow while horizontal penetration is
  // already the shallower separating axis and is strictly non-increasing.
  const horizontalDepth = body.radius + obstacle.radius - distance;
  return horizontalAway && (verticalAway || horizontalDepth <= Math.min(below, above) + EPSILON);
}

type Hit = { time: number; normal: Vector; id: string; blocker: string; vertical: boolean };
function firstHit(
  point: Vector, bottom: number, movement: Vector, dy: number, body: CollisionBody,
  obstacles: readonly LocalObstacle[], initialOverlaps: ReadonlySet<string>, guardHit?: Hit,
): Hit | undefined {
  let first = guardHit;
  for (const obstacle of obstacles) {
    const distance = pointSegmentDistance(point, obstacle.a, obstacle.b);
    const radius = body.radius + obstacle.radius;
    const overlapping = distance < radius - EPSILON && verticalOverlap(bottom, body.height, obstacle);
    const normal = outwardNormal(point, obstacle, body.id);
    if (initialOverlaps.has(obstacle.id) && overlapping) {
      if (canLeaveOverlap(point, bottom, movement, dy, obstacle, body)) continue;
      const vertical = dot(movement, normal) >= -EPSILON && Math.abs(dy) > EPSILON;
      const hit = { time: 0, normal: vertical ? { x: 0, z: 0 } : normal, id: obstacle.id,
        blocker: obstacle.sourceId ?? obstacle.id, vertical };
      if (!first || first.time > EPSILON || hit.id.localeCompare(first.id) < 0) first = hit;
      continue;
    }
    // Touching a top/bottom while moving away or parallel is not penetration.
    if ((bottom >= obstacle.topY - EPSILON && dy >= -EPSILON)
      || (bottom + body.height <= obstacle.bottomY + EPSILON && dy <= EPSILON)) continue;
    // At a contact, tangent or outward travel must not be frozen by t=0.
    if (distance >= radius - EPSILON && distance <= radius + CONTACT_SLOP
      && dot(movement, normal) >= -EPSILON) continue;
    const heightInterval = verticalInterval(bottom, dy, body.height, obstacle);
    if (!heightInterval) continue;
    for (const horizontal of capsuleIntervals(point, movement, obstacle, radius)) {
      const interval = intersectIntervals(horizontal, heightInterval);
      if (!interval) continue;
      const time = Math.max(0, interval.enter);
      const at = add(point, scale(movement, time));
      const vertical = heightInterval.enter > horizontal.enter + EPSILON && Math.abs(dy) > EPSILON;
      const hit = { time, normal: vertical ? { x: 0, z: 0 } : outwardNormal(at, obstacle, body.id),
        id: obstacle.id, blocker: obstacle.sourceId ?? obstacle.id, vertical };
      if (!first || hit.time < first.time - EPSILON
        || (Math.abs(hit.time - first.time) <= EPSILON && hit.id.localeCompare(first.id) < 0)) first = hit;
    }
  }
  return first;
}

type Attempt = { point: Vector; bottomY: number; travelledM: number; hit?: Hit; legal: boolean };
type MoveGuard = (point: Vector, bottom: number, movement: Vector) => Hit | undefined;
function attemptMove(
  start: Vector, startY: number, movement: Vector, dy: number, body: CollisionBody,
  obstacles: readonly LocalObstacle[], initialOverlaps: ReadonlySet<string>,
  legal: (from: Vector, movement: Vector) => boolean, maxSweeps: number, guard?: MoveGuard,
): Attempt {
  let point = start, bottomY = startY, remaining = movement, remainingY = dy, travelledM = 0;
  let lastHit: Hit | undefined;
  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    if (!legal(point, remaining)) return { point, bottomY, travelledM, hit: lastHit, legal: false };
    const hit = firstHit(point, bottomY, remaining, remainingY, body, obstacles, initialOverlaps,
      guard?.(point, bottomY, remaining));
    if (!hit) {
      point = add(point, remaining);
      bottomY += remainingY;
      travelledM += length(remaining);
      return { point, bottomY, travelledM, hit: lastHit, legal: true };
    }
    lastHit = hit;
    const stepLength = Math.max(length(remaining), Math.abs(remainingY), CONTACT_SLOP);
    const fraction = Math.max(0, hit.time - CONTACT_SLOP / stepLength);
    point = add(point, scale(remaining, fraction));
    bottomY += remainingY * fraction;
    travelledM += length(remaining) * fraction;
    const rest = scale(remaining, 1 - fraction);
    const into = dot(rest, hit.normal);
    remaining = into < 0 ? subtract(rest, scale(hit.normal, into)) : rest;
    // Retain the proposed height change when sliding around a horizontal hit.
    remainingY = hit.vertical ? 0 : remainingY * (1 - fraction);
    if (length(remaining) < EPSILON) break;
  }
  return { point, bottomY, travelledM, hit: lastHit, legal: true };
}

export function createWildlifeCollision(options: WildlifeCollisionOptions): WildlifeCollision {
  const animalBody = (animal: AnimalState, at: PlanetPoint = animal): CollisionBody => {
    const profile = animalProfiles[animal.species];
    const ground = options.groundY(animal, at);
    const flight = animal.species === 'bird' ? Math.max(0, options.flightHeight?.(animal.id) ?? 0) : 0;
    // Include the existing visual bob and a fixed-step takeoff/landing margin.
    const bottomY = ground + Math.max(0, flight - (animal.species === 'bird' ? 0.45 : 0));
    const topY = ground + flight + profile.height + (animal.species === 'bird' ? 0.45 : 0);
    return { id: `animal:${animal.id}`, pose: { position: at, bottomY },
      radius: profile.radius, height: topY - bottomY };
  };
  const playerBody = () => options.player().body;

  const candidates = (query: CollisionQuery, ignored: ReadonlySet<string>, includeStatic = true): CollisionQueryResult => {
    if (!validCollisionQuery(query)) return { complete: false, reason: 'unavailable' };
    const staticResult: CollisionQueryResult = includeStatic ? options.obstacles(query) : { complete: true, obstacles: [] };
    if (!staticResult.complete) return staticResult;
    if (staticResult.obstacles.length > Math.min(query.limit, MAX_COLLISION_OBSTACLES)) {
      return { complete: false, reason: 'overflow' };
    }
    const animals = options.animals();
    if (animals.length > MAX_DYNAMIC_ANIMALS) return { complete: false, reason: 'overflow' };
    const player = options.player();
    const rover = options.rover();
    if (!validBody(player.body) || player.body.id !== 'player'
      || (rover !== null && (!validBody(rover) || rover.id !== 'rover'))) {
      return { complete: false, reason: 'unavailable' };
    }
    const origin = geographic(query.from);
    const reach = geographicDistanceMeters(origin, geographic(query.to)) + query.radius;
    const dynamic: CollisionBody[] = [];
    for (const animal of animals) {
      if (animal.health <= 0 || ignored.has(`animal:${animal.id}`)) continue;
      const profile = animalProfiles[animal.species];
      if (!profile || !finitePoint(animal)) return { complete: false, reason: 'unavailable' };
      if (geographicDistanceMeters(origin, geographic(animal)) > reach + profile.radius + 0.02) continue;
      dynamic.push(animalBody(animal));
    }
    if (!player.driving) dynamic.push(player.body);
    if (rover) dynamic.push(rover);
    const obstacles: CollisionObstacle[] = [];
    for (const obstacle of staticResult.obstacles) {
      if (!validObstacle(obstacle)) return { complete: false, reason: 'unavailable' };
      if (!ignored.has(obstacle.id) && collisionObstacleNearQuery(query, obstacle)) obstacles.push(obstacle);
    }
    for (const body of dynamic) {
      if (!validBody(body)) return { complete: false, reason: 'unavailable' };
      const obstacle = bodyObstacle(body);
      if (!ignored.has(body.id) && collisionObstacleNearQuery(query, obstacle)) obstacles.push(obstacle);
    }
    obstacles.sort((a, b) => a.id.localeCompare(b.id));
    return { complete: true, obstacles };
  };

  const moveBody = (request: CollisionMoveRequest): CollisionMoveResult => {
    const { body, to, dt } = request;
    const original: CollisionPose = { position: { ...body.pose.position, geographic: geographic(body.pose.position) },
      bottomY: body.pose.bottomY, ...(body.pose.bearingDegrees === undefined ? {} : { bearingDegrees: body.pose.bearingDegrees }) };
    const incomplete = (reason: 'unavailable' | 'overflow'): CollisionMoveResult =>
      ({ pose: original, travelledM: 0, status: 'incomplete', reason });
    if (!validBody(body) || !finitePoint(to.position) || !Number.isFinite(to.bottomY)
      || (to.bearingDegrees !== undefined && !Number.isFinite(to.bearingDegrees))
      || !Number.isFinite(dt) || dt < 0 || !Number.isFinite(request.recoveryDistance ?? 0)
      || (request.recoveryDistance ?? 0) < 0) return incomplete('unavailable');
    const origin = geographic(body.pose.position);
    const distance = geographicDistanceMeters(origin, geographic(to.position));
    const recovery = Math.min(request.recoveryDistance ?? 0, 0.4 * dt);
    const halfLength = body.capsule?.halfLength ?? 0;
    const fromBearing = body.pose.bearingDegrees ?? 0;
    const toBearing = to.bearingDegrees ?? fromBearing;
    const turn = (((toBearing - fromBearing + 180) % 360 + 360) % 360 - 180) * Math.PI / 180;
    // Three overlapping circles cover the capsule with at most a small
    // conservative pad; bound the additional endpoint sweep during a turn.
    const sampleRadius = halfLength > EPSILON ? Math.hypot(body.radius, halfLength / 2) : body.radius;
    let turnReach = halfLength > EPSILON ? 2 * halfLength * Math.sin(Math.abs(turn) / 2) : 0;
    const query: CollisionQuery = { from: body.pose.position, to: to.position,
      radius: sampleRadius + halfLength + turnReach + Math.max(distance, recovery) + CONTACT_SLOP,
      limit: MAX_COLLISION_OBSTACLES };
    const result = candidates(query, new Set([body.id]), request.includeStatic);
    if (!result.complete) return incomplete(result.reason);
    const start = { x: 0, z: 0 };
    const desired = local(origin, to.position);
    const dy = to.bottomY - original.bottomY;
    const sourceObstacles = result.obstacles.map(obstacle => toLocalObstacle(origin, obstacle));
    const bearing = fromBearing * Math.PI / 180;
    const axis = { x: Math.sin(bearing), z: Math.cos(bearing) };
    const offsets = halfLength > EPSILON ? [-halfLength, 0, halfLength].map(value => scale(axis, value)) : [start];
    const expanded = () => offsets.flatMap((offset, index) => sourceObstacles.map(obstacle => ({
      ...obstacle, id: halfLength > EPSILON ? `${obstacle.id}\u0000capsule:${index}` : obstacle.id,
      sourceId: obstacle.id, a: subtract(obstacle.a, offset), b: subtract(obstacle.b, offset),
    })));
    let sweptBody: CollisionBody = { ...body, radius: sampleRadius + turnReach, capsule: undefined };
    let obstacles = expanded();
    let turnBlocker: string | undefined;
    if (turnReach > EPSILON) {
      // Rotating a pre-existing overlap could deepen it even if translation is
      // separating. Hold the old orientation until the swept envelope clears.
      const overlap = obstacles.find(obstacle => overlapDepth(start, original.bottomY, sweptBody, obstacle) > EPSILON);
      if (overlap) {
        turnBlocker = overlap.sourceId;
        turnReach = 0;
        sweptBody = { ...sweptBody, radius: sampleRadius };
        obstacles = expanded();
      }
    }
    const initial = new Set(obstacles.filter(obstacle =>
      overlapDepth(start, original.bottomY, sweptBody, obstacle) > EPSILON).map(obstacle => obstacle.id));
    const guardedSources = new Set(obstacles.filter(obstacle => initial.has(obstacle.id)).map(obstacle => obstacle.sourceId));
    const guard: MoveGuard | undefined = halfLength <= EPSILON ? undefined : (point, bottom, movement) => {
      let first: Hit | undefined;
      const endA = add(point, scale(axis, -halfLength)), endB = add(point, scale(axis, halfLength));
      for (const obstacle of sourceObstacles) {
        if (!guardedSources.has(obstacle.id) || !verticalOverlap(bottom, body.height, obstacle)) continue;
        const pair = closestSegments(endA, endB, obstacle.a, obstacle.b);
        const offset = subtract(pair.a, pair.b), distance = length(offset);
        if (distance < EPSILON) continue;
        const normal = scale(offset, 1 / distance);
        if (dot(movement, normal) >= -EPSILON) continue;
        const hit = { time: 0, normal, id: obstacle.id, blocker: obstacle.id, vertical: false };
        if (!first || hit.id.localeCompare(first.id) < 0) first = hit;
      }
      return first;
    };
    const legal = (point: Vector, movement: Vector) => {
      if (!request.canOccupy) return true;
      const steps = Math.max(1, Math.ceil(length(movement) / 0.5));
      if (steps > 8) return false;
      for (let step = 1; step <= steps; step++) {
        if (!request.canOccupy(projected(origin, body.pose.position, add(point, scale(movement, step / steps))))) return false;
      }
      return true;
    };
    let attempt = attemptMove(start, original.bottomY, desired, dy, sweptBody, obstacles, initial, legal, 3, guard);
    if (initial.size && attempt.travelledM < EPSILON && Math.abs(attempt.bottomY - original.bottomY) < EPSILON && recovery > EPSILON) {
      let normal = { x: 0, z: 0 };
      for (const obstacle of obstacles) if (initial.has(obstacle.id)) {
        normal = add(normal, scale(outwardNormal(start, obstacle, body.id),
          overlapDepth(start, original.bottomY, sweptBody, obstacle)));
      }
      if (length(normal) < EPSILON) {
        const first = obstacles.find(obstacle => initial.has(obstacle.id))!;
        normal = outwardNormal(start, first, body.id);
      }
      normal = scale(normal, recovery / length(normal));
      const alternatives = [normal, { x: -normal.z, z: normal.x }];
      for (const alternative of alternatives) {
        const escape = attemptMove(start, original.bottomY, alternative, 0, sweptBody, obstacles, initial, legal, 1, guard);
        if (escape.legal && escape.travelledM > EPSILON) { attempt = escape; break; }
      }
    } else if (!initial.size && request.detour && length(desired) > EPSILON && attempt.travelledM < EPSILON) {
      const sign = stableSign(body.id, attempt.hit?.id ?? 'terrain');
      const alternatives = [
        { x: -desired.z * sign, z: desired.x * sign },
        { x: desired.z * sign, z: -desired.x * sign },
      ];
      for (const alternative of alternatives) {
        const detour = attemptMove(start, original.bottomY, alternative, dy, sweptBody, obstacles, initial, legal, 1, guard);
        if (detour.legal && detour.travelledM > EPSILON) { attempt = detour; break; }
      }
    }
    const moved = length(attempt.point);
    const usedDesired = !attempt.hit && attempt.legal && length(subtract(attempt.point, desired)) < 1e-5;
    const position = usedDesired && moved > EPSILON
      ? { ...to.position, geographic: geographic(to.position) }
      : projected(origin, body.pose.position, attempt.point);
    const changed = moved > EPSILON || Math.abs(attempt.bottomY - original.bottomY) > EPSILON;
    const status: CollisionMoveResult['status'] = initial.size
      ? changed ? 'separating' : 'unresolved'
      : !changed && (attempt.hit || !attempt.legal || turnBlocker) ? 'blocked'
        : attempt.hit || !attempt.legal || !usedDesired || turnBlocker ? 'slid' : 'clear';
    const acceptedBearing = halfLength > EPSILON ? turnBlocker ? fromBearing : toBearing
      : to.bearingDegrees ?? original.bearingDegrees;
    return { pose: { position, bottomY: attempt.bottomY,
      ...(acceptedBearing === undefined ? {} : { bearingDegrees: acceptedBearing }) },
      travelledM: attempt.travelledM, status, blocker: attempt.hit?.blocker ?? turnBlocker };
  };

  const canAttack = (attacker: CollisionBody, target: CollisionBody, legacyReachM: number): CollisionAttackResult => {
    if (!validBody(attacker) || !validBody(target) || !Number.isFinite(legacyReachM) || legacyReachM < 0) {
      return { allowed: false, reason: 'unavailable' };
    }
    const distance = geographicDistanceMeters(geographic(attacker.pose.position), geographic(target.pose.position));
    const verticalGap = Math.max(0, attacker.pose.bottomY - target.pose.bottomY - target.height,
      target.pose.bottomY - attacker.pose.bottomY - attacker.height);
    if (verticalGap > 0.25 || (distance >= legacyReachM && distance - attacker.radius - target.radius > 0.15)) {
      return { allowed: false, reason: 'out-of-reach' };
    }
    const query: CollisionQuery = { from: attacker.pose.position, to: target.pose.position, radius: 0,
      limit: MAX_COLLISION_OBSTACLES };
    const result = candidates(query, new Set([attacker.id, target.id]));
    if (!result.complete) return { allowed: false, reason: result.reason };
    const origin = geographic(attacker.pose.position);
    const movement = local(origin, target.pose.position);
    const fromY = attacker.pose.bottomY + attacker.height * 0.55;
    const toY = target.pose.bottomY + target.height * 0.5;
    let blocker: { id: string; time: number } | undefined;
    for (const obstacle of result.obstacles) {
      const shape = toLocalObstacle(origin, obstacle);
      const vertical = verticalInterval(fromY, toY - fromY, 0, shape);
      if (!vertical) continue;
      for (const horizontal of capsuleIntervals({ x: 0, z: 0 }, movement, shape, shape.radius)) {
        const interval = intersectIntervals(horizontal, vertical);
        if (interval && (!blocker || interval.enter < blocker.time - EPSILON
          || (Math.abs(interval.enter - blocker.time) <= EPSILON && obstacle.id.localeCompare(blocker.id) < 0))) {
          blocker = { id: obstacle.id, time: interval.enter };
        }
      }
    }
    return blocker ? { allowed: false, reason: 'blocked', blocker: blocker.id } : { allowed: true };
  };

  return { animalBody, playerBody, moveBody, canAttack };
}
