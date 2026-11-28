import { describe, expect, it } from 'vitest';
import { createWildlife, isWildlifeState, updateWildlife, type AnimalState } from './wildlife';
import { biomeAt, safeSpawn } from './world';
import { geographicDistanceMeters } from './geography';
import { geographicToPlanetPosition, movePlanetPosition, planetPositionToGeographic } from './planet';
import { createWildlifeCollision, type CollisionBody, type CollisionObstacle } from './wildlife-collision';

function animal(species: AnimalState['species'], x: number, z: number): AnimalState {
  return { id: `${species}-0`, species, x, z, homeX: x, homeZ: z, heading: 0, health: species === 'rabbit' ? 1 : 3, behavior: 'wander', decisionTimer: 1, attackTimer: 0, decisions: 0 };
}

describe('wildlife', () => {
  it('spawns deterministically in suitable habitats away from the player', () => {
    const spawn = safeSpawn(1847)!;
    const animals = createWildlife(1847, spawn);
    expect(animals).toEqual(createWildlife(1847, spawn));
    expect(new Set(animals.map(item => item.species))).toEqual(new Set([
      'deer', 'rabbit', 'wolf', 'bird', 'bear', 'snake', 'squirrel',
      'reindeer', 'moose', 'cow', 'sheep', 'fox',
    ]));
    expect(isWildlifeState(animals)).toBe(true);
    for (const item of animals) {
      expect(biomeAt(item.x, item.z, 1847)).not.toBe('ocean');
      expect(Math.hypot(item.x - spawn.x, item.z - spawn.z)).toBeGreaterThanOrEqual(item.species === 'wolf' ? 14 : 6);
    }
  });
  it('flees threats and lets predators attack prey and the player', () => {
    const deer = animal('deer', 0, 0);
    const wolf = animal('wolf', 0, 0.6);
    const animals = [deer, wolf];
    updateWildlife(animals, 0.1, 1847, { x: 30, z: 30 }, () => 1, () => { throw new Error('unexpected player damage'); });
    expect(deer.behavior).toBe('flee');
    expect(deer.health).toBe(2);
    let damage = 0;
    wolf.attackTimer = 0;
    updateWildlife(animals, 0.1, 1847, { x: wolf.x, z: wolf.z }, () => 1, value => { damage += value; });
    expect(damage).toBe(8);
  });

  it.each(['fox', 'bear'] as const)('makes prey flee a nearby %s without player involvement', species => {
    const deer = animal('deer', 0, 0);
    const predator = animal(species, 0, -3);
    deer.behavior = 'rest';
    predator.behavior = 'rest';
    updateWildlife([deer, predator], 0.1, 1847, { x: 30, z: 30 }, () => 1,
      () => { throw new Error('unexpected player damage'); });
    expect(deer.behavior).toBe('flee');
    expect(deer.z).toBeGreaterThan(0);
    expect(predator.behavior).toBe('chase');
  });

  it('does not react to dead or distant predators', () => {
    const deer = animal('deer', 0, 0);
    const bear = animal('bear', 0, -2);
    const fox = animal('fox', 0, -6);
    deer.behavior = 'rest';
    bear.health = 0;
    updateWildlife([deer, bear, fox], 0.1, 1847, { x: 30, z: 30 }, () => 1,
      () => { throw new Error('unexpected player damage'); });
    expect(deer.behavior).toBe('rest');
  });

  it.each(['wolf', 'fox', 'bear'] as const)('identifies a %s when it attacks the player', species => {
    const predator = animal(species, 0, 0);
    const attacks: Array<{ damage: number; species: string }> = [];
    updateWildlife([predator], 0.1, 1847, { x: 0, z: 0.5 }, () => 1,
      (damage, attacker) => { attacks.push({ damage, species: attacker }); });
    updateWildlife([predator], 0.1, 1847, { x: 0, z: 0.5 }, () => 1,
      (damage, attacker) => { attacks.push({ damage, species: attacker }); });
    expect(attacks).toEqual([{ damage: 8, species }]);
  });

  it.each([
    { species: 'wolf', separation: 0.9 },
    { species: 'fox', separation: 0.9 },
    { species: 'bear', separation: 1.3 },
  ] as const)('keeps a pursuing $species at attack distance without crossing the player', ({ species, separation }) => {
    const predator = animal(species, 0, 0);
    const player = { x: 0, z: 2 };
    const attacks: number[] = [];
    updateWildlife([predator], 1, 1847, player, () => 1, damage => { attacks.push(damage); });
    expect(geographicDistanceMeters(planetPositionToGeographic(predator.x, predator.z),
      planetPositionToGeographic(player.x, player.z))).toBeGreaterThanOrEqual(separation - 0.001);
    expect(predator.z).toBeLessThan(player.z);
    expect(attacks).toEqual([]);
    updateWildlife([predator], 0.1, 1847, player, () => 1, damage => { attacks.push(damage); });
    expect(attacks).toEqual([8]);
    expect(predator.z).toBeLessThanOrEqual(player.z - separation + 0.001);
    const stoppedAt = predator.z;
    player.z += 2;
    updateWildlife([predator], 0.1, 1847, player, () => 1, () => {});
    expect(predator.z).toBeGreaterThan(stoppedAt);
  });

  it.each(['player', 'prey'] as const)('keeps a wolf facing a stationary $0 at body contact', target => {
    const wolf = animal('wolf', 0, 0);
    const deer = animal('deer', 0, 1.33);
    const animals = target === 'prey' ? [wolf, deer] : [wolf];
    const player: CollisionBody = { id: 'player',
      pose: { position: target === 'player' ? { x: 0, z: 1.08 } : { x: 30, z: 30 }, bottomY: 1 },
      radius: 0.35, height: 1.75 };
    const collision = createWildlifeCollision({
      animals: () => animals, player: () => ({ body: player, driving: false }),
      rover: () => null, groundY: () => 1, obstacles: () => ({ complete: true, obstacles: [] }),
    });
    const move: typeof movePlanetPosition = (position, bearing, distance, geographic) =>
      movePlanetPosition(position, bearing, position === deer ? 0 : distance, geographic);
    let maximumDrift = 0;
    let damage = 0;
    for (let i = 0; i < 45; i++) {
      updateWildlife(animals, 1 / 30, 1847, player.pose.position, () => 1, value => { damage += value; }, move, collision);
      maximumDrift = Math.max(maximumDrift, Math.hypot(wolf.x, wolf.z));
    }
    expect(wolf.behavior).toBe('chase');
    expect(maximumDrift).toBeLessThan(0.02);
    expect(Math.abs(Math.atan2(Math.sin(wolf.heading), Math.cos(wolf.heading)))).toBeLessThan(0.05);
    expect(target === 'prey' ? deer.health : damage).toBe(target === 'prey' ? 2 : 8);
  });

  it('lets a bear reach and damage stationary prey without moving through it', () => {
    const bear = animal('bear', 0, 0);
    const deer = animal('deer', 0, 2);
    const move: typeof movePlanetPosition = (position, bearing, distance, geographic) =>
      movePlanetPosition(position, bearing, position === deer ? 0 : distance, geographic);
    updateWildlife([bear, deer], 1, 1847, { x: 30, z: 30 }, () => 1, () => {}, move);
    updateWildlife([bear, deer], 0.1, 1847, { x: 30, z: 30 }, () => 1, () => {}, move);
    expect(deer.health).toBe(2);
    expect(deer.z - bear.z).toBeGreaterThanOrEqual(1.299);
  });

  it('removes prey killed by a predator and rejects malformed save state', () => {
    const wolf = animal('wolf', 0, 0);
    const rabbit = animal('rabbit', 0, 0.1);
    const animals = [wolf, rabbit];
    updateWildlife(animals, 0.1, 1847, { x: 30, z: 30 }, () => 1, () => {});
    expect(animals.map(item => item.species)).toEqual(['wolf']);
    expect(isWildlifeState([{ ...wolf, health: -1 }])).toBe(false);
    expect(isWildlifeState([wolf, wolf])).toBe(false);
  });

  it('moves wildlife by real meters at high latitudes and preserves canonical positions', () => {
    const projected = geographicToPlanetPosition(60, 10);
    const deer = animal('deer', projected.x, projected.z);
    const origin = planetPositionToGeographic(projected.x, projected.z);
    deer.geographic = origin;
    deer.heading = Math.PI / 2;
    deer.decisionTimer = 1;
    updateWildlife([deer], 1, 1847, { x: 0, z: 0 }, () => 1, () => {});

    expect(deer.geographic?.latitude).toBeCloseTo(60, 5);
    expect(geographicDistanceMeters(origin, deer.geographic!)).toBeCloseTo(0.84, 5);
    expect(isWildlifeState([deer])).toBe(true);
    expect(isWildlifeState([{ ...deer, geographic: { ...deer.geographic!, longitude: 180 } }])).toBe(false);
  });

  it('keeps behavior and saved identity while an animal moves around a tree', () => {
    const deer = animal('deer', 0, 0);
    deer.heading = Math.PI / 2;
    deer.decisionTimer = 10;
    const animals = [deer];
    let player: CollisionBody = { id: 'player', pose: { position: { x: 30, z: 30 }, bottomY: 1 }, radius: 0.35, height: 1.75 };
    const rover: CollisionBody = { id: 'rover', pose: { position: { x: 40, z: 40 }, bottomY: 1 }, radius: 2.1, height: 1.9 };
    const tree: CollisionObstacle = { type: 'circle', id: 'tree', position: { x: 1.5, z: 0 },
      radius: 0.3, bottomY: 1, topY: 5 };
    const collision = createWildlifeCollision({ animals: () => animals, player: () => ({ body: player, driving: false }),
      rover: () => rover, groundY: () => 1, obstacles: () => ({ complete: true, obstacles: [tree] }) });
    for (let frame = 0; frame < 90; frame++) {
      updateWildlife(animals, 1 / 30, 1847, player.pose.position, () => 1, () => {}, movePlanetPosition, collision);
      expect(geographicDistanceMeters(deer.geographic!, planetPositionToGeographic(1.5, 0))).toBeGreaterThanOrEqual(0.899);
    }
    expect(deer.behavior).toBe('wander');
    expect(Math.abs(deer.z)).toBeGreaterThan(0.2);
    expect(isWildlifeState(animals)).toBe(true);
    expect(animals[0].id).toBe('deer-0');
    expect(animals[0].health).toBe(3);
  });

  it('lets a resting animal gently escape an overlap without changing its behavior or identity', () => {
    const deer = animal('deer', 0, 0);
    deer.behavior = 'rest';
    deer.decisionTimer = 10;
    const animals = [deer];
    const player: CollisionBody = { id: 'player', pose: { position: { x: 30, z: 30 }, bottomY: 1 }, radius: 0.35, height: 1.75 };
    const rover: CollisionBody = { id: 'rover', pose: { position: { x: 40, z: 40 }, bottomY: 1 }, radius: 1, height: 1.9 };
    const tree: CollisionObstacle = { type: 'circle', id: 'tree', position: { x: 0.5, z: 0 },
      radius: 0.3, bottomY: 1, topY: 5 };
    const collision = createWildlifeCollision({ animals: () => animals, player: () => ({ body: player, driving: false }),
      rover: () => rover, groundY: () => 1, obstacles: () => ({ complete: true, obstacles: [tree] }) });
    for (let frame = 0; frame < 5; frame++) {
      updateWildlife(animals, 0.1, 1847, player.pose.position, () => 1, () => {}, movePlanetPosition, collision);
    }
    expect(deer.x).toBeLessThan(-0.15);
    expect(deer.behavior).toBe('rest');
    expect(deer.id).toBe('deer-0');
    expect(isWildlifeState(animals)).toBe(true);
  });

  it('permits a saved animal already in wet ground and outside its home radius to move toward safety', () => {
    const deer = animal('deer', 50, 0);
    deer.homeX = 0;
    deer.heading = -Math.PI / 2;
    deer.decisionTimer = 10;
    const animals = [deer];
    const player: CollisionBody = { id: 'player', pose: { position: { x: 150, z: 150 }, bottomY: 1 }, radius: 0.35, height: 1.75 };
    const rover: CollisionBody = { id: 'rover', pose: { position: { x: 140, z: 140 }, bottomY: 1 }, radius: 1, height: 1.9 };
    const ground = (x: number) => 0.05 + (50 - x) * 0.01;
    const collision = createWildlifeCollision({ animals: () => animals, player: () => ({ body: player, driving: false }),
      rover: () => rover, groundY: (_animal, point) => ground(point.x),
      obstacles: () => ({ complete: true, obstacles: [] }) });
    updateWildlife(animals, 1, 1847, player.pose.position, ground, () => {}, movePlanetPosition, collision);
    expect(deer.x).toBeLessThan(49.2);
    expect(ground(deer.x)).toBeGreaterThan(0.05);
    expect(isWildlifeState(animals)).toBe(true);
  });

  it('does not spend predator cooldown or deal damage through a wall or an unavailable query', () => {
    const wolf = animal('wolf', 0, 0);
    const animals = [wolf];
    const player: CollisionBody = { id: 'player', pose: { position: { x: 1, z: 0 }, bottomY: 1 }, radius: 0.35, height: 1.75 };
    const rover: CollisionBody = { id: 'rover', pose: { position: { x: 30, z: 30 }, bottomY: 1 }, radius: 2.1, height: 1.9 };
    const wall: CollisionObstacle = { type: 'segment', id: 'wall', a: { x: 0.5, z: -1 }, b: { x: 0.5, z: 1 },
      radius: 0.1, bottomY: 1, topY: 3.4 };
    let mode: 'wall' | 'unavailable' | 'clear' = 'wall';
    const collision = createWildlifeCollision({ animals: () => animals, player: () => ({ body: player, driving: false }),
      rover: () => rover, groundY: () => 1, obstacles: () => mode === 'unavailable'
        ? { complete: false, reason: 'unavailable' }
        : { complete: true, obstacles: mode === 'wall' ? [wall] : [] } });
    const damage: number[] = [];
    const step = () => updateWildlife(animals, 0, 1847, player.pose.position, () => 1,
      value => damage.push(value), movePlanetPosition, collision);
    step();
    expect(wolf.behavior).toBe('chase');
    expect(wolf.attackTimer).toBe(0);
    expect(damage).toEqual([]);
    mode = 'unavailable';
    step();
    expect(wolf.attackTimer).toBe(0);
    expect(damage).toEqual([]);
    mode = 'clear';
    step();
    expect(damage).toEqual([8]);
    expect(wolf.attackTimer).toBe(2);
  });

  it('retains predator-prey attacks at body contact and shields a seated driver with the rover', () => {
    const bear = animal('bear', 0, 0);
    const deer = animal('deer', 1.55, 0);
    const animals = [bear, deer];
    let player: CollisionBody = { id: 'player', pose: { position: { x: 30, z: 30 }, bottomY: 1 }, radius: 0.35, height: 1.75 };
    let rover: CollisionBody = { id: 'rover', pose: { position: { x: 40, z: 40 }, bottomY: 1 }, radius: 2.1, height: 1.9 };
    let driving = false;
    const collision = createWildlifeCollision({ animals: () => animals, player: () => ({ body: player, driving }),
      rover: () => rover, groundY: () => 1, obstacles: () => ({ complete: true, obstacles: [] }) });
    updateWildlife(animals, 0, 1847, player.pose.position, () => 1, () => {}, movePlanetPosition, collision);
    expect(deer.health).toBe(2);
    expect(bear.attackTimer).toBe(2);
    bear.attackTimer = 0;
    driving = true;
    player = { ...player, pose: { ...player.pose, position: { x: 1, z: 0 } } };
    rover = { ...rover, pose: { position: { x: 1, z: 0 }, bottomY: 1 } };
    let damage = 0;
    updateWildlife(animals, 0, 1847, player.pose.position, () => 1, amount => { damage += amount; },
      movePlanetPosition, collision);
    expect(damage).toBe(0);
    expect(bear.attackTimer).toBe(0);
  });
});
