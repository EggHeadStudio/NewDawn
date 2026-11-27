import { biomeAt, seededNoise, terrainHeight } from './world';
import { geographicBearing, geographicDistanceMeters, type GeographicPosition } from './geography';
import { movePlanetPosition, planetDistanceMeters, planetPositionToGeographic, PLANET_WIDTH } from './planet';

export type Species = 'deer' | 'rabbit' | 'wolf' | 'bird' | 'bear' | 'snake' | 'squirrel' | 'reindeer' | 'moose' | 'cow' | 'sheep' | 'fox';
export type AnimalBehavior = 'wander' | 'rest' | 'flee' | 'chase' | 'fly';
export interface AnimalState {
  id: string;
  species: Species;
  x: number;
  z: number;
  geographic?: GeographicPosition;
  homeX: number;
  homeZ: number;
  heading: number;
  health: number;
  behavior: AnimalBehavior;
  decisionTimer: number;
  attackTimer: number;
  decisions: number;
}
type ActorPosition = { x: number; z: number; geographic?: GeographicPosition };

function geographicPosition(position: ActorPosition) {
  return position.geographic ?? planetPositionToGeographic(position.x, position.z);
}

function distanceBetween(a: ActorPosition, b: ActorPosition) {
  return geographicDistanceMeters(geographicPosition(a), geographicPosition(b));
}

function bearingBetween(a: ActorPosition, b: ActorPosition) {
  return geographicBearing(geographicPosition(a), geographicPosition(b));
}

const speciesCounts: Array<[Species, number]> = [
  ['deer', 3], ['rabbit', 4], ['wolf', 2], ['bird', 3],
  ['bear', 1], ['snake', 2], ['squirrel', 3], ['reindeer', 2],
  ['moose', 1], ['cow', 2], ['sheep', 3], ['fox', 2],
];
const maxHealth: Record<Species, number> = {
  deer: 3, rabbit: 1, wolf: 3, bird: 1, bear: 6, snake: 1,
  squirrel: 1, reindeer: 3, moose: 5, cow: 4, sheep: 3, fox: 2,
};
const speeds: Record<Species, number> = {
  deer: 2.4, rabbit: 3, wolf: 2.8, bird: 2.5, bear: 1.8,
  snake: 1.2, squirrel: 3.4, reindeer: 2.7, moose: 2.1,
  cow: 1.1, sheep: 1.2, fox: 3.1,
};

function inHabitat(species: Species, biome: ReturnType<typeof biomeAt>) {
  if (species === 'wolf' || species === 'fox') return biome === 'forest' || biome === 'grass' || biome === 'rock';
  if (species === 'bear') return biome === 'forest' || biome === 'rock';
  if (species === 'snake') return biome === 'grass' || biome === 'desert' || biome === 'beach';
  if (species === 'squirrel') return biome === 'forest';
  if (species === 'reindeer' || species === 'moose') return biome === 'forest' || biome === 'snow';
  if (species === 'cow' || species === 'sheep') return biome === 'grass';
  if (species === 'deer') return biome === 'forest' || biome === 'grass';
  return biome === 'forest' || biome === 'grass' || (species === 'bird' && biome === 'beach');
}

export function createWildlife(seed: number, spawn: { x: number; z: number }): AnimalState[] {
  const animals: AnimalState[] = [];
  for (const [species, count] of speciesCounts) {
    for (let index = 0; index < count; index++) {
      for (let attempt = 0; attempt < 160; attempt++) {
        const n = index * 173 + attempt;
        const speciesOffset = speciesCounts.findIndex(entry => entry[0] === species) * 311;
        const x = Math.round((seededNoise(n + speciesOffset, 10, seed) - 0.5) * 80);
        const z = Math.round((seededNoise(n + speciesOffset, 20, seed) - 0.5) * 80);
        if (terrainHeight(x, z, seed) < 0.6 || !inHabitat(species, biomeAt(x, z, seed))) continue;
        if (planetDistanceMeters({ x, z }, spawn) < (species === 'wolf' ? 14 : 6)) continue;
        animals.push({
          id: `${species}-${index}`, species, x, z, geographic: planetPositionToGeographic(x, z, terrainHeight(x, z, seed)),
          homeX: x, homeZ: z,
          heading: seededNoise(n, 30, seed) * Math.PI * 2,
          health: maxHealth[species], behavior: 'wander', decisionTimer: 1, attackTimer: 0, decisions: 0,
        });
        break;
      }
    }
  }
  return animals;
}

export function isWildlifeState(value: unknown): value is AnimalState[] {
  if (!Array.isArray(value) || value.length > 40) return false;
  const ids = new Set<string>();
  return value.every(item => {
    if (typeof item !== 'object' || item === null) return false;
    const animal = item as Record<string, unknown>;
    if (typeof animal.species !== 'string' || !speciesCounts.some(([species]) => species === animal.species)
      || typeof animal.id !== 'string' || !new RegExp(`^${animal.species}-[0-9]+$`).test(animal.id) || ids.has(animal.id)
      || typeof animal.behavior !== 'string' || !['wander', 'rest', 'flee', 'chase', 'fly'].includes(animal.behavior)) return false;
    ids.add(animal.id);
    if (!['x', 'z', 'homeX', 'homeZ', 'heading', 'health', 'decisionTimer', 'attackTimer', 'decisions'].every(key => typeof animal[key] === 'number' && Number.isFinite(animal[key]))) return false;
    const projectedPosition = { x: animal.x as number, z: animal.z as number };
    if (animal.geographic !== undefined) {
      const position = animal.geographic as Partial<GeographicPosition>;
      if (typeof position !== 'object' || position === null || position.planetId !== 'new-dawn-earth'
        || typeof position.latitude !== 'number' || !Number.isFinite(position.latitude) || position.latitude < -90 || position.latitude > 90
        || typeof position.longitude !== 'number' || !Number.isFinite(position.longitude) || position.longitude < -180 || position.longitude >= 180
        || typeof position.altitude !== 'number' || !Number.isFinite(position.altitude) || Math.abs(position.altitude) > 10000
        || typeof position.regionId !== 'string' || position.regionId.length === 0 || position.regionId.length > 64
        || geographicDistanceMeters(position as GeographicPosition, planetPositionToGeographic(projectedPosition.x, projectedPosition.z)) >= 1) return false;
    }
    return Math.abs(animal.x as number) <= PLANET_WIDTH * 2 && Math.abs(animal.z as number) <= PLANET_WIDTH * 2
      && Math.abs(animal.homeX as number) <= PLANET_WIDTH * 2 && Math.abs(animal.homeZ as number) <= PLANET_WIDTH * 2
      && (animal.health as number) > 0 && (animal.health as number) <= maxHealth[animal.species as Species]
      && (animal.decisionTimer as number) >= 0 && (animal.attackTimer as number) >= 0
      && Number.isSafeInteger(animal.decisions) && (animal.decisions as number) >= 0;
  });
}

export function updateWildlife(
  animals: AnimalState[], dt: number, seed: number, player: ActorPosition,
  heightAt: (x: number, z: number) => number,
  damagePlayer: (damage: number) => void,
  move: typeof movePlanetPosition = movePlanetPosition,
) {
  for (const animal of animals) {
    if (animal.health <= 0) continue;
    animal.geographic ??= planetPositionToGeographic(animal.x, animal.z);
    animal.attackTimer = Math.max(0, animal.attackTimer - dt);
    animal.decisionTimer = Math.max(0, animal.decisionTimer - dt);
    const playerDistance = distanceBetween(player, animal);
    let target: ActorPosition | undefined;
    let flee = false;
    if (animal.species === 'wolf' || animal.species === 'fox' || animal.species === 'bear') {
      const prey = animals.filter(other => other.health > 0 && (
        animal.species === 'bear' ? ['deer', 'rabbit', 'sheep', 'squirrel'].includes(other.species)
          : ['deer', 'rabbit', 'sheep', 'squirrel'].includes(other.species)))
        .sort((a, b) => distanceBetween(animal, a) - distanceBetween(animal, b))[0];
      const preyDistance = prey ? distanceBetween(animal, prey) : Infinity;
      if (playerDistance < 7) target = player;
      else if (prey && preyDistance < 9 && distanceBetween(animal, { x: animal.homeX, z: animal.homeZ }) < 18) target = prey;
      if (target) {
        animal.behavior = 'chase';
        const distance = distanceBetween(animal, target);
        if (distance < 1.1 && animal.attackTimer === 0) {
          if (target === player) damagePlayer(8);
          else if (prey) prey.health -= 1;
          animal.attackTimer = 2;
        }
      } else if (distanceBetween(animal, { x: animal.homeX, z: animal.homeZ }) > 12) target = { x: animal.homeX, z: animal.homeZ };
    } else {
      const threat = animals.find(other => other.species === 'wolf' && other.health > 0 && distanceBetween(other, animal) < 5);
      if (playerDistance < 4 || threat) {
        target = playerDistance < 4 ? player : threat;
        flee = true;
        animal.behavior = animal.species === 'bird' ? 'fly' : 'flee';
      }
    }
    if (!target && animal.decisionTimer === 0) {
      animal.decisions++;
      const n = seededNoise(animal.decisions, animal.homeX + animal.homeZ, seed);
      animal.heading = n * Math.PI * 2;
      animal.behavior = n < 0.25 ? 'rest' : animal.species === 'bird' ? 'fly' : 'wander';
      animal.decisionTimer = 2 + n * 4;
    }
    if (target) {
      animal.heading = bearingBetween(animal, target) * Math.PI / 180 + (flee ? Math.PI : 0);
    }
    if (animal.behavior !== 'rest') {
      const speed = speeds[animal.species] * (animal.behavior === 'wander' ? 0.35 : 1);
      const next = move(animal, animal.heading * 180 / Math.PI, speed * dt, animal.geographic);
      if (distanceBetween(next, { x: animal.homeX, z: animal.homeZ }) > 46) {
        animal.heading += Math.PI * 0.6;
      } else if (heightAt(next.x, next.z) > 0.1) {
        animal.x = next.x;
        animal.z = next.z;
        animal.geographic = { ...next.geographic, altitude: heightAt(next.x, next.z) };
      }
      else animal.heading += Math.PI * 0.6;
    }
  }
  for (let i = animals.length - 1; i >= 0; i--) {
    if (animals[i].health <= 0) animals.splice(i, 1);
  }
}
