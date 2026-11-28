import { describe, expect, it } from 'vitest';
import { geographicDistanceMeters } from './geography';
import { geographicToPlanetPosition, movePlanetPosition, planetPositionToGeographic } from './planet';
import type { StructuralPiece } from './construction';
import type { AnimalState } from './wildlife';
import {
  combineCollisionQueries, createStructureCollisionQuery, createWildlifeCollision,
  type CollisionBody, type CollisionObstacle, type CollisionQueryResult, type PlanetPoint, type WildlifeCollisionOptions,
} from './wildlife-collision';

function body(id: string, x: number, z: number, radius = 0.35, height = 1.75, bottomY = 0): CollisionBody {
  return { id, pose: { position: { x, z }, bottomY }, radius, height };
}

function animal(species: AnimalState['species'], x: number, z: number): AnimalState {
  return { id: `${species}-0`, species, x, z, homeX: x, homeZ: z, heading: 0,
    health: species === 'rabbit' ? 1 : 3, behavior: 'wander', decisionTimer: 1, attackTimer: 0, decisions: 0 };
}

function collision(overrides: Partial<WildlifeCollisionOptions> = {}) {
  return createWildlifeCollision({
    animals: () => [], player: () => ({ body: body('player', 100, 100), driving: false }),
    rover: () => body('rover', 200, 200, 2.1, 1.9), groundY: () => 0,
    obstacles: () => ({ complete: true, obstacles: [] }), ...overrides,
  });
}

function circle(id: string, x: number, z: number, radius: number, topY = 3): CollisionObstacle {
  return { type: 'circle', id, position: { x, z }, radius, bottomY: -0.2, topY };
}

function distance(a: PlanetPoint, b: PlanetPoint) {
  return geographicDistanceMeters(a.geographic ?? planetPositionToGeographic(a.x, a.z),
    b.geographic ?? planetPositionToGeographic(b.x, b.z));
}

describe('bounded wildlife collision', () => {
  it('sweeps through a large step instead of tunnelling through a tree', () => {
    const tree = circle('tree', 2, 0, 0.3);
    const system = collision({ obstacles: () => ({ complete: true, obstacles: [tree] }) });
    const player = body('player', 0, 0);
    const result = system.moveBody({ body: player, to: { position: { x: 4, z: 0 }, bottomY: 0 }, dt: 1 });
    expect(result.blocker).toBe('tree');
    expect(result.status).toBe('slid');
    expect(result.pose.position.x).toBeGreaterThan(1.3);
    expect(result.pose.position.x).toBeLessThan(1.35);
    expect(distance(result.pose.position, { x: 2, z: 0 })).toBeGreaterThanOrEqual(0.65);
  });

  it('slides along a wall, but cannot cross it', () => {
    const wall: CollisionObstacle = { type: 'segment', id: 'wall', a: { x: -3, z: 1 }, b: { x: 3, z: 1 },
      radius: 0.1, bottomY: 0, topY: 2.4 };
    const system = collision({ obstacles: () => ({ complete: true, obstacles: [wall] }) });
    const result = system.moveBody({ body: body('player', 0, 0),
      to: { position: { x: 1, z: 2 }, bottomY: 0 }, dt: 1 });
    expect(result.status).toBe('slid');
    expect(result.pose.position.x).toBeGreaterThan(0.9);
    expect(result.pose.position.z).toBeLessThan(0.56);
    expect(result.blocker).toBe('wall');
  });

  it('retains a sloped height change when separating or sliding horizontally', () => {
    const tree = circle('tree', 1.5, 0, 0.3, 5);
    const rover = body('rover', 0, 0, Math.hypot(1.9, 0.9), 1.9);
    const system = collision({ rover: () => rover, obstacles: () => ({ complete: true, obstacles: [tree] }) });
    const escape = system.moveBody({ body: rover,
      to: { position: { x: -0.2, z: 0 }, bottomY: 0.2 }, dt: 1 });
    expect(escape.status).toBe('separating');
    expect(escape.pose.position.x).toBeLessThan(-0.19);
    expect(escape.pose.bottomY).toBeCloseTo(0.2);

    const wall: CollisionObstacle = { type: 'segment', id: 'wall', a: { x: -3, z: 1 }, b: { x: 3, z: 1 },
      radius: 0.1, bottomY: 0, topY: 3 };
    const slider = collision({ obstacles: () => ({ complete: true, obstacles: [wall] }) });
    const result = slider.moveBody({ body: body('player', 0, 0),
      to: { position: { x: 1, z: 2 }, bottomY: 0.2 }, dt: 1 });
    expect(result.pose.position.x).toBeGreaterThan(0.9);
    expect(result.pose.position.z).toBeLessThan(0.56);
    expect(result.pose.bottomY).toBeCloseTo(0.2);
  });

  it('stops vertical motion onto an obstacle while allowing movement across its top', () => {
    const log: CollisionObstacle = { type: 'segment', id: 'log', a: { x: -1, z: 0 }, b: { x: 1, z: 0 },
      radius: 0.2, bottomY: -0.1, topY: 0.4 };
    const system = collision({ obstacles: () => ({ complete: true, obstacles: [log] }) });
    const falling = system.moveBody({ body: body('player', 0, 0, 0.35, 1.75, 1),
      to: { position: { x: 0, z: 0 }, bottomY: -1 }, dt: 1 });
    expect(falling.blocker).toBe('log');
    expect(falling.pose.bottomY).toBeGreaterThanOrEqual(0.4);
    const across = system.moveBody({ body: body('player', 0, 0, 0.35, 1.75, 0.4),
      to: { position: { x: 0.5, z: 0 }, bottomY: 0.4 }, dt: 1 });
    expect(across.status).toBe('clear');
  });

  it('allows the seed-1847-style parked rover to leave an old tree overlap without getting deeper', () => {
    const tree = circle('tree:old-save', 9.5, 4, 0.3);
    const rover = body('rover', 8, 4, Math.hypot(1.9, 0.9), 1.9);
    const system = collision({ rover: () => rover, obstacles: () => ({ complete: true, obstacles: [tree] }) });
    const query = { body: rover, dt: 1 / 30 };
    const before = distance(rover.pose.position, { x: 9.5, z: 4 });
    const backwards = system.moveBody({ ...query, to: { position: { x: 7.8, z: 4 }, bottomY: 0 } });
    expect(backwards.status).toBe('separating');
    expect(distance(backwards.pose.position, { x: 9.5, z: 4 })).toBeGreaterThan(before + 0.19);

    const deeper = system.moveBody({ ...query, to: { position: { x: 8.2, z: 4 }, bottomY: 0 } });
    expect(deeper.status).toBe('unresolved');
    expect(distance(deeper.pose.position, rover.pose.position)).toBeLessThan(0.001);
    const recovered = system.moveBody({ ...query, to: { position: { x: 8.2, z: 4 }, bottomY: 0 },
      recoveryDistance: 100 });
    expect(recovered.status).toBe('separating');
    expect(recovered.travelledM).toBeLessThanOrEqual(0.4 / 30 + 1e-6);
    expect(distance(recovered.pose.position, { x: 9.5, z: 4 })).toBeGreaterThan(before);
  });

  it('does not recover into another tree and can separate from opposed overlaps tangentially', () => {
    const rover = body('rover', 0, 0, Math.hypot(1.9, 0.9), 1.9);
    const first = circle('first', 1.5, 0, 0.3);
    const second = circle('second', -2.5, 0, 0.3);
    const system = collision({ rover: () => rover, obstacles: () => ({ complete: true, obstacles: [first, second] }) });
    const moved = system.moveBody({ body: rover, to: { position: { x: 0.5, z: 0 }, bottomY: 0 },
      dt: 1, recoveryDistance: 1 });
    expect(moved.pose.position.x).toBeLessThan(0);
    expect(distance(moved.pose.position, { x: -2.5, z: 0 })).toBeGreaterThanOrEqual(rover.radius + 0.3);

    const opposite = circle('opposite', -1.6, 0, 0.3);
    const trapped = collision({ rover: () => rover, obstacles: () => ({ complete: true, obstacles: [first, opposite] }) });
    const escaped = trapped.moveBody({ body: rover, to: rover.pose, dt: 1, recoveryDistance: 0.4 });
    expect(escaped.status).toBe('separating');
    expect(distance(escaped.pose.position, { x: 1.5, z: 0 })).toBeGreaterThanOrEqual(1.5);
    expect(distance(escaped.pose.position, { x: -1.6, z: 0 })).toBeGreaterThanOrEqual(1.6);
  });

  it('takes a bounded side step when an animal meets a head-on obstacle', () => {
    const tree = circle('tree', 0.755, 0, 0.4);
    const system = collision({ obstacles: () => ({ complete: true, obstacles: [tree] }) });
    const result = system.moveBody({ body: body('animal:test', 0, 0),
      to: { position: { x: 0.1, z: 0 }, bottomY: 0 }, dt: 0.1, detour: true });
    expect(result.status).toBe('slid');
    expect(Math.abs(result.pose.position.z)).toBeGreaterThan(0.08);
    expect(result.travelledM).toBeLessThanOrEqual(0.101);
    expect(distance(result.pose.position, { x: 0.755, z: 0 })).toBeGreaterThan(0.75);
  });

  it('checks living animals, on-foot players and the rover but not dead animals or a seated driver', () => {
    const deer = animal('deer', 2, 0);
    const rover = body('rover', 10, 0, 2.1, 1.9);
    const system = collision({ animals: () => [deer], rover: () => rover,
      player: () => ({ body: body('player', 5, 0), driving: false }) });
    const walker = body('animal:fox-0', 0, 0, 0.55, 0.7);
    const move = (toX: number) => system.moveBody({ body: walker,
      to: { position: { x: toX, z: 0 }, bottomY: 0 }, dt: 1 });
    expect(move(4).blocker).toBe('animal:deer-0');
    deer.health = 0;
    expect(move(7).blocker).toBe('player');
    expect(move(12).blocker).toBe('player');
    const driving = collision({ rover: () => rover, player: () => ({ body: body('player', 5, 0), driving: true }) });
    expect(driving.moveBody({ body: walker, to: { position: { x: 12, z: 0 }, bottomY: 0 }, dt: 1 }).blocker).toBe('rover');
  });

  it('can exclude the rover without disabling the other collision bodies', () => {
    const system = collision({ rover: () => null, animals: () => [animal('deer', 4, 0)],
      obstacles: () => ({ complete: true, obstacles: [circle('tree', 1, 0, 0.3)] }) });
    const walker = body('player', 0, 0);
    const clear = system.moveBody({ body: walker, to: { position: { x: 2, z: 0 }, bottomY: 0 },
      dt: 1, includeStatic: false });
    expect(clear.status).toBe('clear');
    const contact = system.moveBody({ body: walker, to: { position: { x: 5, z: 0 }, bottomY: 0 },
      dt: 1, includeStatic: false });
    expect(contact.blocker).toBe('animal:deer-0');
  });

  it('uses the oriented rover capsule for reciprocal player and animal collision', () => {
    const rover: CollisionBody = { ...body('rover', 0, 0, 1.05, 1.9),
      pose: { position: { x: 0, z: 0 }, bottomY: 0, bearingDegrees: 90 }, capsule: { halfLength: 0.85 } };
    const system = collision({ rover: () => rover });
    const side = system.moveBody({ body: body('player', 0, 3),
      to: { position: { x: 0, z: 0 }, bottomY: 0 }, dt: 1 });
    expect(side.blocker).toBe('rover');
    expect(side.pose.position.z).toBeGreaterThan(1.39);
    expect(side.pose.position.z).toBeLessThan(1.46); // not the old 2.2 m circular radius
    const front = system.moveBody({ body: body('animal:fox-0', 3, 0, 0.55, 0.7),
      to: { position: { x: 0, z: 0 }, bottomY: 0 }, dt: 1 });
    expect(front.blocker).toBe('rover');
    expect(front.pose.position.x).toBeGreaterThan(2.44);
    expect(front.pose.position.x).toBeLessThan(2.51);
  });

  it('sweeps the narrower capsule when driving and holds unsafe turns', () => {
    const rover: CollisionBody = { ...body('rover', 0, 0, 1.05, 1.9),
      pose: { position: { x: 0, z: 0 }, bottomY: 0, bearingDegrees: 90 }, capsule: { halfLength: 0.85 } };
    const tree = circle('tree', 0, 2.5, 0.3);
    const system = collision({ rover: () => rover, obstacles: () => ({ complete: true, obstacles: [tree] }) });
    const forward = system.moveBody({ body: rover,
      to: { position: { x: 0, z: 3 }, bottomY: 0, bearingDegrees: 90 }, dt: 1 });
    expect(forward.blocker).toBe('tree');
    expect(forward.pose.position.z).toBeGreaterThan(1);
    expect(forward.pose.position.z).toBeLessThan(1.1);
    expect(forward.pose.bearingDegrees).toBe(90);

    const closeTree = circle('near-turn', 0, 1.5, 0.3);
    const close = collision({ rover: () => rover, obstacles: () => ({ complete: true, obstacles: [closeTree] }) });
    const blockedTurn = close.moveBody({ body: rover,
      to: { position: { x: 0, z: 0 }, bottomY: 0, bearingDegrees: 0 }, dt: 1 });
    expect(blockedTurn.status).toBe('blocked');
    expect(blockedTurn.blocker).toBe('near-turn');
    expect(blockedTurn.pose.bearingDegrees).toBe(90);
    const open = collision({ rover: () => rover });
    const clearTurn = open.moveBody({ body: rover,
      to: { position: { x: 0, z: 0 }, bottomY: 0, bearingDegrees: 0 }, dt: 1 });
    expect(clearTurn.status).toBe('clear');
    expect(clearTurn.pose.bearingDegrees).toBe(0);
  });

  it('holds a new rover turn while escaping an old capsule/tree overlap', () => {
    const rover: CollisionBody = { ...body('rover', 0, 0, 1.05, 1.9),
      pose: { position: { x: 0, z: 0 }, bottomY: 0, bearingDegrees: 90 }, capsule: { halfLength: 0.85 } };
    const tree = circle('tree', 1.5, 0, 0.3);
    const system = collision({ rover: () => rover, obstacles: () => ({ complete: true, obstacles: [tree] }) });
    const result = system.moveBody({ body: rover,
      to: { position: { x: -0.2, z: 0 }, bottomY: 0, bearingDegrees: 80 }, dt: 1 / 30 });
    expect(result.status).toBe('separating');
    expect(result.pose.position.x).toBeLessThan(-0.19);
    expect(result.pose.bearingDegrees).toBe(90);
  });

  it('does not turn a padded capsule near-contact into a new physical overlap', () => {
    const rover: CollisionBody = { ...body('rover', 0, 0, 1.05, 1.9),
      pose: { position: { x: 0, z: 0 }, bottomY: 0, bearingDegrees: 90 }, capsule: { halfLength: 0.85 } };
    const tree = circle('tree', 0.1, 1.36, 0.3);
    const system = collision({ rover: () => rover, obstacles: () => ({ complete: true, obstacles: [tree] }) });
    const result = system.moveBody({ body: rover,
      to: { position: { x: -0.2, z: 0.02 }, bottomY: 0, bearingDegrees: 90 }, dt: 1 });
    const x = 0.1 - result.pose.position.x;
    const z = 1.36 - result.pose.position.z;
    const nearest = Math.max(-0.85, Math.min(0.85, x));
    expect(Math.hypot(x - nearest, z)).toBeGreaterThanOrEqual(1.05 + 0.3 - 0.00001);
  });

  it('uses height spans, including a conservative flying bird body', () => {
    const bird = animal('bird', 0, 0);
    const lowWall: CollisionObstacle = { type: 'segment', id: 'wall', a: { x: 1, z: -2 }, b: { x: 1, z: 2 },
      radius: 0.1, bottomY: 0, topY: 1.5 };
    const system = collision({ animals: () => [bird], flightHeight: () => 2.5,
      obstacles: () => ({ complete: true, obstacles: [lowWall] }) });
    const flying = system.animalBody(bird);
    expect(flying.pose.bottomY).toBeGreaterThan(1.5);
    const result = system.moveBody({ body: flying, to: { position: { x: 2, z: 0 }, bottomY: flying.pose.bottomY }, dt: 1 });
    expect(result.status).toBe('clear');
    expect(result.pose.position.x).toBe(2);
  });

  it('fails closed on unavailable and overflowing obstacle queries', () => {
    const player = body('player', 0, 0);
    for (const reason of ['unavailable', 'overflow'] as const) {
      const system = collision({ obstacles: () => ({ complete: false, reason }) });
      const result = system.moveBody({ body: player, to: { position: { x: 3, z: 0 }, bottomY: 0 }, dt: 1 });
      expect(result).toMatchObject({ status: 'incomplete', reason, travelledM: 0 });
      expect(distance(result.pose.position, player.pose.position)).toBeLessThan(0.001);
      expect(system.canAttack(player, body('animal:wolf-0', 1, 0), 1.1)).toEqual({ allowed: false, reason });
    }
    const tooMany = Array.from({ length: 65 }, (_, i) => circle(`tree:${i}`, 0.5, 0, 0.1));
    const system = collision({ obstacles: () => ({ complete: true, obstacles: tooMany }) });
    expect(system.moveBody({ body: player, to: player.pose, dt: 1 })).toMatchObject({ status: 'incomplete', reason: 'overflow' });
  });

  it('does not attack through a wall, another body or the rover around a seated driver', () => {
    const attacker = body('animal:wolf-0', 0, 0, 0.72, 1.07);
    const target = body('player', 1, 0);
    const wall: CollisionObstacle = { type: 'segment', id: 'wall', a: { x: 0.5, z: -1 },
      b: { x: 0.5, z: 1 }, radius: 0.1, bottomY: 0, topY: 2.4 };
    const behindWall = collision({ obstacles: () => ({ complete: true, obstacles: [wall] }) });
    expect(behindWall.canAttack(attacker, target, 1.1)).toEqual({ allowed: false, reason: 'blocked', blocker: 'wall' });
    const deer = animal('deer', 0.5, 0);
    const behindAnimal = collision({ animals: () => [deer] });
    expect(behindAnimal.canAttack(attacker, target, 1.1))
      .toEqual({ allowed: false, reason: 'blocked', blocker: 'animal:deer-0' });
    const rover = body('rover', 1, 0, 1.4, 1.9);
    const driving = collision({ player: () => ({ body: target, driving: true }), rover: () => rover });
    expect(driving.canAttack(attacker, target, 1.1)).toEqual({ allowed: false, reason: 'blocked', blocker: 'rover' });
  });

  it('preserves attack reach with large bodies and rejects separated vertical targets', () => {
    const system = collision();
    const bear = body('animal:bear-0', 0, 0, 0.9, 1.5);
    const deer = body('animal:deer-0', 1.62, 0, 0.6, 1.35);
    expect(system.canAttack(bear, deer, 1.5)).toEqual({ allowed: true });
    expect(system.canAttack(bear, body('animal:deer-0', 2, 0, 0.6, 1.35), 1.5).reason).toBe('out-of-reach');
    expect(system.canAttack(bear, body('player', 1, 0, 0.35, 1.75, 2), 1.5).reason).toBe('out-of-reach');
  });

  it('honors split doorframes, closed doors and refreshed open-door snapshots', () => {
    const frame: StructuralPiece = { id: 'frame', kind: 'doorframe', x: 0, z: 0, y: 0, level: 0, rotation: 0, open: false };
    const door: StructuralPiece = { ...frame, id: 'door', kind: 'door' };
    const mover = body('player', 0, -2);
    const attempt = (pieces: StructuralPiece[]) => collision({ obstacles: createStructureCollisionQuery(pieces, []) })
      .moveBody({ body: mover, to: { position: { x: 0, z: 2 }, bottomY: 0 }, dt: 1 });
    expect(attempt([frame]).status).toBe('clear');
    expect(attempt([frame, door]).pose.position.z).toBeLessThan(0);
    expect(attempt([frame, { ...door, open: true }]).status).toBe('clear');
  });

  it('uses canonical geography at high latitude and across the longitude seam', () => {
    const start = geographicToPlanetPosition(60, 179.99999);
    const geographic = planetPositionToGeographic(start.x, start.z);
    const treePosition = movePlanetPosition(start, 90, 1.4, geographic);
    const target = movePlanetPosition(start, 90, 3, geographic);
    const tree: CollisionObstacle = { type: 'circle', id: 'tree', position: treePosition,
      radius: 0.3, bottomY: 0, topY: 3 };
    const player: CollisionBody = { ...body('player', start.x, start.z), pose: { position: { ...start, geographic }, bottomY: 0 } };
    const system = collision({ obstacles: () => ({ complete: true, obstacles: [tree] }) });
    const result = system.moveBody({ body: player, to: { position: target, bottomY: 0 }, dt: 1 });
    expect(result.blocker).toBe('tree');
    expect(distance(player.pose.position, result.pose.position)).toBeCloseTo(0.745, 2);
    expect(distance(result.pose.position, treePosition)).toBeGreaterThanOrEqual(0.65);
    expect(result.pose.position.geographic?.longitude).toBeLessThan(180);
  });

  it('combines only nearby candidates and does not silently truncate overflow', () => {
    const query = { from: { x: 0, z: 0 }, to: { x: 1, z: 0 }, radius: 0.2, limit: 1 };
    const first: CollisionQueryResult = { complete: true, obstacles: [circle('near', 0.5, 0, 0.1), circle('far', 20, 0, 0.1)] };
    expect(combineCollisionQueries(query, first)).toMatchObject({ complete: true, obstacles: [{ id: 'near' }] });
    const second: CollisionQueryResult = { complete: true, obstacles: [circle('another', 0.8, 0, 0.1)] };
    expect(combineCollisionQueries(query, first, second)).toEqual({ complete: false, reason: 'overflow' });
  });
});
