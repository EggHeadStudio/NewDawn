import { describe, expect, it } from 'vitest';
import { geographicDistanceMeters } from './geography';
import { geographicToPlanetPosition, movePlanetPosition, PLANET_WIDTH, planetOffset, planetPositionToGeographic } from './planet';
import { safeSpawn, terrainHeight, vegetationFamilyAt, World } from './world';
import { createWildlife, isWildlifeState, updateWildlife } from './wildlife';
import { createWildlifeCollision, type CollisionBody, type CollisionObstacle, type CollisionQuery } from './wildlife-collision';

function queryAt(x: number, z: number, radius = 0.2): CollisionQuery {
  return { from: { x, z }, to: { x, z }, radius, limit: 64 };
}

function obstacles(world: World, query: CollisionQuery) {
  const result = world.collisionObstacles(query);
  if (!result.complete) throw new Error(`Unexpected incomplete resource query: ${result.reason}`);
  return result.obstacles;
}

function treeCollider(world: World, id: string, query: CollisionQuery): CollisionObstacle | undefined {
  return obstacles(world, query).find(obstacle => obstacle.id === `tree:${id}`);
}

describe('streamed resource collision', () => {
  it('lets the naturally overlapping seed-1847 starter rover move away from its tree', () => {
    const world = new World(1847, 1);
    try {
      const spawn = safeSpawn(1847)!;
      const position = { x: spawn.x + 8, z: spawn.z - 1 };
      const rover: CollisionBody = { id: 'rover', pose: { position, bottomY: world.heightAt(position.x, position.z) },
        radius: Math.hypot(1.9, 0.9), height: 1.9 };
      const nearby = obstacles(world, queryAt(position.x, position.z, rover.radius));
      const tree = nearby.find(item => item.type === 'circle' && item.id.startsWith('tree:')
        && geographicDistanceMeters(planetPositionToGeographic(position.x, position.z),
          planetPositionToGeographic(item.position.x, item.position.z)) < rover.radius + item.radius);
      expect(tree).toBeDefined();
      if (!tree || tree.type !== 'circle') throw new Error('Expected the natural starter tree');
      const system = createWildlifeCollision({
        animals: () => [],
        player: () => ({ body: { id: 'player', pose: { position, bottomY: rover.pose.bottomY + 1 },
          radius: 0.35, height: 1.75 }, driving: true }),
        rover: () => rover, groundY: () => 0, obstacles: query => world.collisionObstacles(query),
      });
      const away = planetOffset(tree.position, position);
      const bearing = Math.atan2(away.x, away.z) * 180 / Math.PI;
      const candidate = movePlanetPosition(position, bearing, 0.2);
      const result = system.moveBody({ body: rover,
        to: { position: candidate, bottomY: world.heightAt(candidate.x, candidate.z) },
        dt: 1 / 30, recoveryDistance: 0.4 / 30 });
      expect(result.status).toBe('separating');
      expect(geographicDistanceMeters(result.pose.position.geographic!, planetPositionToGeographic(tree.position.x, tree.position.z)))
        .toBeGreaterThan(geographicDistanceMeters(planetPositionToGeographic(position.x, position.z),
          planetPositionToGeographic(tree.position.x, tree.position.z)));
    } finally { world.dispose(); }
  });

  it('lets the narrower oriented seed-1847 rover capsule escape its natural tree overlap', () => {
    const world = new World(1847, 1);
    try {
      const spawn = safeSpawn(1847)!;
      const position = { x: spawn.x + 8, z: spawn.z - 1 };
      const rover: CollisionBody = { id: 'rover',
        pose: { position, bottomY: world.heightAt(position.x, position.z), bearingDegrees: 90 },
        radius: 1.05, height: 1.9, capsule: { halfLength: 0.85 } };
      const separation = (point: { x: number; z: number }, tree: { x: number; z: number }) => {
        const offset = planetOffset(point, tree);
        const along = Math.max(-0.85, Math.min(0.85, offset.x));
        return Math.hypot(offset.x - along, offset.z);
      };
      const nearby = obstacles(world, queryAt(position.x, position.z, 2.2));
      const tree = nearby.find(item => item.type === 'circle' && item.id.startsWith('tree:')
        && separation(position, item.position) < rover.radius + item.radius);
      expect(tree).toBeDefined();
      if (!tree || tree.type !== 'circle') throw new Error('Expected the natural capsule/tree overlap');
      const system = createWildlifeCollision({
        animals: () => [], player: () => ({ body: { id: 'player', pose: { position, bottomY: rover.pose.bottomY + 1 },
          radius: 0.35, height: 1.75 }, driving: true }),
        rover: () => rover, groundY: () => 0, obstacles: query => world.collisionObstacles(query),
      });
      const before = separation(position, tree.position);
      const attempts = Array.from({ length: 16 }, (_, i) => {
        const candidate = movePlanetPosition(position, i * 22.5, 0.2);
        return system.moveBody({ body: rover,
          to: { position: candidate, bottomY: world.heightAt(candidate.x, candidate.z), bearingDegrees: 90 },
          dt: 1 / 30, recoveryDistance: 0.4 / 30 });
      });
      expect(attempts.some(result => result.status === 'separating'
        && separation(result.pose.position, tree.position) > before + 0.001)).toBe(true);
    } finally { world.dispose(); }
  });

  it('reconstructs the same tree after unload and preserves its depleted ID after reload', () => {
    const world = new World(1847, 1);
    try {
      const tree = world.group.children.find(object => object.userData.resource === 'wood')!;
      const id = tree.userData.resourceId as string;
      const position = { ...world.resourceLocation(tree) };
      const query = queryAt(position.x, position.z);
      const loaded = treeCollider(world, id, query);
      expect(loaded?.type).toBe('circle');
      world.updateChunks(position.x + 150, position.z + 150, true);
      expect(treeCollider(world, id, query)).toEqual(loaded);
      world.updateChunks(position.x, position.z, true);
      expect(treeCollider(world, id, query)).toEqual(loaded);
      expect(world.gatherNearest(position.x, position.z, 0.01, 'wood')).toMatchObject({ resource: 'wood' });
      expect(treeCollider(world, id, query)).toBeUndefined();
      world.updateChunks(position.x + 150, position.z + 150, true);
      expect(treeCollider(world, id, query)).toBeUndefined();
      const reloaded = new World(1847, 1);
      try {
        reloaded.restoreDepleted(world.depletedSnapshot());
        expect(treeCollider(reloaded, id, query)).toBeUndefined();
      } finally { reloaded.dispose(); }
    } finally { world.dispose(); }
  });

  it('tracks felling, settled trunks, partial logs, streaming and saved harvest state', () => {
    const world = new World(1847, 1);
    try {
      const tree = world.group.children.find(object => object.userData.resource === 'wood' && object.scale.x > 0.95)!;
      const id = tree.userData.resourceId as string;
      const position = { ...world.resourceLocation(tree) };
      const actor = { x: position.x - 1, z: position.z };
      for (let i = 0; i < 3; i++) world.workTree(tree, true, actor);
      expect(obstacles(world, queryAt(position.x, position.z)).map(item => item.id))
        .toContain(`tree:${id}:falling-trunk`);
      world.animate(0, 0, 1.6);
      const fallen = treeCollider(world, id, queryAt(position.x, position.z));
      expect(fallen?.type).toBe('segment');
      if (!fallen || fallen.type !== 'segment') throw new Error('Expected fallen trunk collider');
      const far = { x: fallen.a.x * 0.2 + fallen.b.x * 0.8, z: fallen.a.z * 0.2 + fallen.b.z * 0.8 };
      expect(treeCollider(world, id, queryAt(far.x, far.z, 0.01))).toBeDefined();
      world.workTree(tree, true, actor);
      world.workTree(tree, true, actor);
      expect(world.workTree(tree, false, actor)).toMatchObject({ kind: 'collected' });
      const partial = treeCollider(world, id, queryAt(position.x, position.z));
      expect(partial?.type).toBe('segment');
      if (!partial || partial.type !== 'segment') throw new Error('Expected partial logs');
      expect(Math.hypot(partial.b.x - partial.a.x, partial.b.z - partial.a.z))
        .toBeLessThan(Math.hypot(fallen.b.x - fallen.a.x, fallen.b.z - fallen.a.z));
      const harvest = world.treeHarvestSnapshot();
      world.updateChunks(position.x + 150, position.z + 150, true);
      expect(treeCollider(world, id, queryAt(position.x, position.z))).toEqual(partial);
      const restored = new World(1847, 1);
      try {
        restored.restoreTreeHarvest(harvest);
        expect(treeCollider(restored, id, queryAt(position.x, position.z))).toEqual(partial);
      } finally { restored.dispose(); }
    } finally { world.dispose(); }
  });

  it('updates colliders after edited terrain, mining and deposit exclusions', () => {
    const world = new World(1847, 1);
    try {
      const tree = world.group.children.find(object => object.userData.resource === 'wood')!;
      const position = { ...world.resourceLocation(tree) };
      const query = queryAt(position.x, position.z);
      const before = treeCollider(world, tree.userData.resourceId as string, query)!;
      world.editTerrain(position.x, position.z, 2, 'raise');
      const after = treeCollider(world, tree.userData.resourceId as string, query)!;
      expect(after.bottomY).toBeGreaterThan(before.bottomY);

      const deposit = world.group.children.find(object => typeof object.userData.depositId === 'string')!;
      const id = deposit.userData.depositId as string;
      const depositPosition = { ...world.resourceLocation(deposit) };
      const depositQuery = queryAt(depositPosition.x, depositPosition.z);
      expect(obstacles(world, depositQuery).some(item => item.id === `deposit:${id}`)).toBe(true);
      for (let i = 0; i < 3; i++) world.mineDeposit(deposit, true);
      expect(obstacles(world, depositQuery).some(item => item.id === `deposit:${id}`)).toBe(false);
      world.updateChunks(depositPosition.x + 150, depositPosition.z + 150, true);
      expect(obstacles(world, depositQuery).some(item => item.id === `deposit:${id}`)).toBe(false);

      const another = world.group.children.find(object => typeof object.userData.depositId === 'string')!;
      const anotherId = another.userData.depositId as string;
      const anotherPosition = { ...world.resourceLocation(another) };
      const anotherQuery = queryAt(anotherPosition.x, anotherPosition.z);
      expect(obstacles(world, anotherQuery).some(item => item.id === `deposit:${anotherId}`)).toBe(true);
      world.setDepositExclusions([{ ...anotherPosition, radius: 2 }]);
      expect(obstacles(world, anotherQuery).some(item => item.id === `deposit:${anotherId}`)).toBe(false);
    } finally { world.dispose(); }
  });

  it('finds the same resource in a wrapped world copy and in streamed high-latitude chunks', () => {
    const world = new World(1847, 1);
    try {
      const starterTree = world.group.children.find(object => object.userData.resource === 'wood')!;
      const starterId = starterTree.userData.resourceId as string;
      const starter = { ...world.resourceLocation(starterTree) };
      const original = treeCollider(world, starterId, queryAt(starter.x, starter.z));
      const wrapped = treeCollider(world, starterId, queryAt(starter.x + PLANET_WIDTH, starter.z));
      expect(original?.type).toBe('circle');
      expect(wrapped?.type).toBe('circle');
      if (!original || original.type !== 'circle' || !wrapped || wrapped.type !== 'circle') throw new Error('Expected wrapped trees');
      expect(wrapped.radius).toBeCloseTo(original.radius, 4);
      expect(wrapped.bottomY).toBeCloseTo(original.bottomY, 4);
      expect(geographicDistanceMeters(planetPositionToGeographic(wrapped.position.x, wrapped.position.z),
        planetPositionToGeographic(original.position.x, original.position.z))).toBeLessThan(0.001);

      const center = Array.from({ length: 36 }, (_, i) => geographicToPlanetPosition(60, i * 10 - 180))
        .find(point => terrainHeight(point.x, point.z, 1847) > 0.6
          && vegetationFamilyAt(point.x, point.z, 1847) === 'conifer')!;
      expect(center).toBeDefined();
      world.updateChunks(center.x, center.z, true);
      const highTree = world.group.children.find(object => object.userData.resource === 'wood')!;
      expect(highTree).toBeDefined();
      const highId = highTree.userData.resourceId as string;
      const high = { ...world.resourceLocation(highTree) };
      const highQuery = queryAt(high.x, high.z);
      const loaded = treeCollider(world, highId, highQuery);
      expect(loaded?.type).toBe('circle');
      world.updateChunks(high.x + 1500, high.z + 1500, true);
      expect(treeCollider(world, highId, highQuery)).toEqual(loaded);
    } finally { world.dispose(); }
  });

  it('runs the natural seed-1847 population against bounded resources without changing save validity', () => {
    const world = new World(1847, 1);
    try {
      const spawn = safeSpawn(1847)!;
      const animals = createWildlife(1847, spawn);
      const initial = animals.map(animal => ({ id: animal.id, x: animal.x, z: animal.z }));
      const player: CollisionBody = { id: 'player', pose: { position: spawn, bottomY: world.heightAt(spawn.x, spawn.z) },
        radius: 0.35, height: 1.75 };
      const vehicle = { x: spawn.x + 8, z: spawn.z - 1 };
      const rover: CollisionBody = { id: 'rover', pose: { position: vehicle, bottomY: world.heightAt(vehicle.x, vehicle.z) },
        radius: Math.hypot(1.9, 0.9), height: 1.9 };
      let incomplete = 0;
      const collision = createWildlifeCollision({
        animals: () => animals, player: () => ({ body: player, driving: false }), rover: () => rover,
        groundY: (_animal, at) => world.heightAt(at.x, at.z),
        obstacles: query => {
          const result = world.collisionObstacles(query);
          if (!result.complete) incomplete++;
          return result;
        },
      });
      for (let frame = 0; frame < 90; frame++) {
        updateWildlife(animals, 1 / 30, 1847, spawn, (x, z) => world.heightAt(x, z), () => {},
          movePlanetPosition, collision);
      }
      expect(incomplete).toBe(0);
      expect(isWildlifeState(animals)).toBe(true);
      expect(animals.filter(animal => {
        const old = initial.find(item => item.id === animal.id)!;
        return geographicDistanceMeters(planetPositionToGeographic(old.x, old.z), animal.geographic!) > 0.1;
      }).length).toBeGreaterThan(10);
    } finally { world.dispose(); }
  });

  it('reports an incomplete query instead of silently omitting huge or polar areas', () => {
    const world = new World(1847, 1);
    try {
      expect(world.collisionObstacles(queryAt(0, 0, 1000))).toEqual({ complete: false, reason: 'overflow' });
      const geographic = { ...planetPositionToGeographic(0, 0), latitude: 89.99999 };
      const query: CollisionQuery = { from: { x: 0, z: 0, geographic }, to: { x: 0, z: 0, geographic }, radius: 2, limit: 64 };
      expect(world.collisionObstacles(query)).toEqual({ complete: false, reason: 'overflow' });
    } finally { world.dispose(); }
  });
});
