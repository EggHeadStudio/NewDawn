import { biomeAt, seededNoise, terrainHeight } from './world';

export type Species = 'deer' | 'rabbit' | 'wolf' | 'bird' | 'bear' | 'snake' | 'squirrel' | 'reindeer' | 'moose' | 'cow' | 'sheep' | 'fox';
export type AnimalBehavior = 'wander' | 'rest' | 'flee' | 'chase' | 'fly';
export interface AnimalState {
  id: string;
  species: Species;
  x: number;
  z: number;
  homeX: number;
  homeZ: number;
  heading: number;
  health: number;
  behavior: AnimalBehavior;
  decisionTimer: number;
  attackTimer: number;
  decisions: number;
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
        if (Math.hypot(x - spawn.x, z - spawn.z) < (species === 'wolf' ? 14 : 6)) continue;
        animals.push({
          id: `${species}-${index}`, species, x, z, homeX: x, homeZ: z,
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
    return Math.abs(animal.x as number) <= 48 && Math.abs(animal.z as number) <= 48
      && Math.abs(animal.homeX as number) <= 48 && Math.abs(animal.homeZ as number) <= 48
      && (animal.health as number) > 0 && (animal.health as number) <= maxHealth[animal.species as Species]
      && (animal.decisionTimer as number) >= 0 && (animal.attackTimer as number) >= 0
      && Number.isSafeInteger(animal.decisions) && (animal.decisions as number) >= 0;
  });
}

export function updateWildlife(
  animals: AnimalState[], dt: number, seed: number, player: { x: number; z: number },
  heightAt: (x: number, z: number) => number,
  damagePlayer: (damage: number) => void,
) {
  for (const animal of animals) {
    if (animal.health <= 0) continue;
    animal.attackTimer = Math.max(0, animal.attackTimer - dt);
    animal.decisionTimer = Math.max(0, animal.decisionTimer - dt);
    const playerDistance = Math.hypot(player.x - animal.x, player.z - animal.z);
    let target: { x: number; z: number } | undefined;
    let flee = false;
    if (animal.species === 'wolf' || animal.species === 'fox' || animal.species === 'bear') {
      const prey = animals.filter(other => other.health > 0 && (
        animal.species === 'bear' ? ['deer', 'rabbit', 'sheep', 'squirrel'].includes(other.species)
          : ['deer', 'rabbit', 'sheep', 'squirrel'].includes(other.species)))
        .sort((a, b) => Math.hypot(a.x - animal.x, a.z - animal.z) - Math.hypot(b.x - animal.x, b.z - animal.z))[0];
      const preyDistance = prey ? Math.hypot(prey.x - animal.x, prey.z - animal.z) : Infinity;
      if (playerDistance < 7) target = player;
      else if (prey && preyDistance < 9 && Math.hypot(animal.x - animal.homeX, animal.z - animal.homeZ) < 18) target = prey;
      if (target) {
        animal.behavior = 'chase';
        const distance = Math.hypot(target.x - animal.x, target.z - animal.z);
        if (distance < 1.1 && animal.attackTimer === 0) {
          if (target === player) damagePlayer(8);
          else if (prey) prey.health -= 1;
          animal.attackTimer = 2;
        }
      } else if (Math.hypot(animal.x - animal.homeX, animal.z - animal.homeZ) > 12) target = { x: animal.homeX, z: animal.homeZ };
    } else {
      const threat = animals.find(other => other.species === 'wolf' && other.health > 0 && Math.hypot(other.x - animal.x, other.z - animal.z) < 5);
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
      animal.heading = Math.atan2(target.x - animal.x, target.z - animal.z) + (flee ? Math.PI : 0);
    }
    if (animal.behavior !== 'rest') {
      const speed = speeds[animal.species] * (animal.behavior === 'wander' ? 0.35 : 1);
      const x = Math.max(-46, Math.min(46, animal.x + Math.sin(animal.heading) * speed * dt));
      const z = Math.max(-46, Math.min(46, animal.z + Math.cos(animal.heading) * speed * dt));
      if (heightAt(x, z) > 0.1) { animal.x = x; animal.z = z; }
      else animal.heading += Math.PI * 0.6;
    }
  }
  for (let i = animals.length - 1; i >= 0; i--) {
    if (animals[i].health <= 0) animals.splice(i, 1);
  }
}
