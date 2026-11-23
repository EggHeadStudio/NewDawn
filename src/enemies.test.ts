import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { createEnemy, chooseEnemyKind, enemyIntent, enemyProfiles, stepEnemyProjectile } from './enemies';
import { disposeCharacter } from './characters';

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
    expect(necromancer.getObjectByName('staff')).toBeDefined();
    expect(raider.getObjectByName('mask')).toBeDefined();
    expect(necromancer.getObjectByName('robe')).toBeDefined();
    expect(armored.getObjectByName('shield')).toBeDefined();
    expect(armored.getObjectByName('breastplate')).toBeDefined();
    expect(champion.scale.x).toBeGreaterThan(armored.scale.x);
    expect(armored.getObjectByName('tool-weapon')?.visible).toBe(true);
    expect(necromancer.getObjectByName('elbowR')?.getObjectByName('staff')).toBeDefined();
    [necromancer, armored, champion, raider].forEach(disposeCharacter);
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
    const player = new Vector3(1, 0, 0);
    const point = new Vector3();
    expect(stepEnemyProjectile(point, velocity, 3, 0.05, player, () => false).finished).toBe(false);
    expect(stepEnemyProjectile(point, velocity, 2.95, 0.05, player, () => false)).toMatchObject({ hit: true, finished: true });
    expect(stepEnemyProjectile(new Vector3(), velocity, 3, 0.1, player, () => true)).toMatchObject({ hit: false, finished: true });
    expect(stepEnemyProjectile(new Vector3(), velocity, 0.01, 0.05, player, () => false)).toMatchObject({ hit: false, finished: true });
  });
});
