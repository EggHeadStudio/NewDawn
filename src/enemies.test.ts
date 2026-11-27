import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { createEnemy, chooseEnemyKind, enemyIntent, enemyProfiles, stepEnemyProjectile } from './enemies';
import { disposeCharacter } from './characters';
import { PlanetaryProjectile } from './planetary-projectile';

describe('hostile characters', () => {
  it('unlocks distinct enemies over elapsed days', () => {
    expect(chooseEnemyKind(1, 0)).toBe('raider');
    expect(chooseEnemyKind(1, 0.9)).toBe('undead');
    expect(chooseEnemyKind(3, 0.9)).toBe('necromancer');
    expect(chooseEnemyKind(5, 0.8)).toBe('armored');
    expect(chooseEnemyKind(7, 0.8)).toBe('nightcreature');
    expect(chooseEnemyKind(12, 0.95)).toBe('champion');
    expect(chooseEnemyKind(12, 0.95)).toBe(chooseEnemyKind(12, 0.95));
  });

  it('builds identifiable equipped silhouettes with articulated rigs', () => {
    const necromancer = createEnemy('necromancer');
    const armored = createEnemy('armored');
    const champion = createEnemy('champion');
    const raider = createEnemy('raider');
    const undead = createEnemy('undead');
    expect(necromancer.getObjectByName('staff')).toBeDefined();
    expect(raider.getObjectByName('mask')).toBeDefined();
    expect(necromancer.getObjectByName('robe')).toBeDefined();
    expect(necromancer.getObjectByName('cowl')).toBeDefined();
    expect(undead.getObjectByName('skull')).toBeDefined();
    expect(undead.getObjectByName('face')?.visible).toBe(false);
    expect(armored.getObjectByName('shield')).toBeDefined();
    expect(armored.getObjectByName('breastplate')).toBeDefined();
    expect(champion.scale.x).toBeGreaterThan(armored.scale.x);
    expect(armored.getObjectByName('tool-weapon')?.visible).toBe(true);
    expect(necromancer.getObjectByName('elbowR')?.getObjectByName('staff')).toBeDefined();
    [necromancer, armored, champion, raider, undead].forEach(disposeCharacter);
  });

  it('makes melee enemies pursue and ranged enemies keep distance and fire on cooldown', () => {
    expect(enemyIntent('raider', 12, true)).toEqual({ movement: 1, attack: false });
    expect(enemyIntent('raider', 1, true)).toEqual({ movement: 0, attack: true });
    expect(enemyIntent('necromancer', 3, true)).toEqual({ movement: -1, attack: true });
    expect(enemyIntent('necromancer', 5, false)).toEqual({ movement: 0, attack: false });
    expect(enemyIntent('necromancer', 7, true)).toEqual({ movement: 1, attack: true });
    expect(enemyIntent('champion', 18, true)).toEqual({ movement: 0, attack: false });
    expect(enemyProfiles.champion.health).toBeGreaterThan(enemyProfiles.raider.health);
    expect(enemyProfiles.necromancer.ranged).toBe(true);
  });

  it('moves projectiles, hits players, stops at obstructions and expires misses', () => {
    const velocity = new Vector3(5, 0, 0);
    const player = new Vector3(1.01, 0, 0);
    const point = new Vector3();
    const motion = () => new PlanetaryProjectile(new Vector3(), velocity, undefined, 0);
    const moving = motion();
    expect(stepEnemyProjectile(point, moving, 3, 0.05, player, () => false).finished).toBe(false);
    expect(stepEnemyProjectile(point, moving, 2.95, 0.05, player, () => false)).toMatchObject({ hit: true, finished: true });
    expect(stepEnemyProjectile(new Vector3(), motion(), 3, 0.1, player, () => true)).toMatchObject({ hit: false, finished: true });
    expect(stepEnemyProjectile(new Vector3(), motion(), 0.01, 0.05, player, () => false)).toMatchObject({ hit: false, finished: true });
  });

  it('aims a straight hostile shot in local meters at high latitude', async () => {
    const { geographicToPlanetPosition, movePlanetPosition, planetOffset, PlanetTangentFrame } = await import('./planet');
    const start = { ...geographicToPlanetPosition(60, 179.99999), y: 1 };
    const target = movePlanetPosition(start, 90, 5);
    const frame = new PlanetTangentFrame(start);
    const aim = frame.toLocal(target);
    const shot = new PlanetaryProjectile(start, { x: aim.x, y: 0, z: aim.z }, frame, 0);
    const point = new Vector3(start.x, start.y, start.z);
    const destination = new Vector3(target.x, start.y, target.z);
    const first = stepEnemyProjectile(point, shot, 3, 0.5, destination, () => false);
    expect(first.finished).toBe(false);
    expect(Math.hypot(planetOffset(start, point).x, planetOffset(start, point).z)).toBeCloseTo(2.5, 3);
    shot.rebase(new PlanetTangentFrame(target));
    const impact = stepEnemyProjectile(point, shot, first.remaining, 0.5, destination, () => false);
    expect(impact).toMatchObject({ hit: true, finished: true });
    expect(point.y).toBe(start.y);
  });

  it('does not skip the player between projected positions near a pole', async () => {
    const { geographicToPlanetPosition, movePlanetPosition } = await import('./planet');
    const start = { ...geographicToPlanetPosition(89.999, 0), y: 1 };
    const target = movePlanetPosition(start, 90, 2);
    const shot = new PlanetaryProjectile(start, { x: 5, y: 0, z: 0 }, undefined, 0);
    const point = new Vector3(start.x, start.y, start.z);
    const player = new Vector3(target.x, start.y, target.z);
    const result = stepEnemyProjectile(point, shot, 3, 0.5, player, () => false);
    expect(point.distanceTo(player)).toBeGreaterThan(0.75);
    expect(result).toMatchObject({ hit: true, finished: true });
  });
});
