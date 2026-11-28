import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createAnimal, disposeAnimal, updateBirdFlightHeight } from './animal-assets';
import { authoredAnimalAction } from './authored-animal';

describe('authored animal action selection', () => {
  it('uses idle rather than grazing or sniffing when pursuit or flight is blocked', () => {
    expect(authoredAnimalAction('deer', 0, 'flee', 'graze')).toBe('idle');
    expect(authoredAnimalAction('cow', 0, 'wander', 'graze')).toBe('idle');
    expect(authoredAnimalAction('squirrel', 0, 'flee', 'sniff')).toBe('idle');
    expect(authoredAnimalAction('bird', 0, 'wander', 'peck')).toBe('idle');
    expect(authoredAnimalAction('deer', 0, 'rest', 'graze')).toBe('graze');
    expect(authoredAnimalAction('deer', 0.4, 'rest', 'graze')).toBe('walk');
    expect(authoredAnimalAction('squirrel', 0, 'rest', 'sniff')).toBe('sniff');
    expect(authoredAnimalAction('bird', 0, 'rest', 'peck')).toBe('peck');
    expect(authoredAnimalAction('bird', 0.4, 'rest', 'peck')).toBe('idle');
    expect(authoredAnimalAction('bird', 0, 'fly', 'peck')).toBe('fly');
  });
});

describe('bird flight height', () => {
  it('takes off and lands gradually without moving on a zero-duration update', () => {
    let height = 0;
    expect(updateBirdFlightHeight(height, true, 0)).toBe(0);
    height = updateBirdFlightHeight(height, true, 1 / 30);
    expect(height).toBeGreaterThan(0);
    expect(height).toBeLessThan(0.2);
    for (let frame = 0; frame < 60; frame++) height = updateBirdFlightHeight(height, true, 1 / 30);
    expect(height).toBeGreaterThan(2.4);
    expect(height).toBeLessThan(2.5);
    height = updateBirdFlightHeight(height, false, 1 / 30);
    expect(height).toBeGreaterThan(2.3);
    for (let frame = 0; frame < 150; frame++) height = updateBirdFlightHeight(height, false, 1 / 30);
    expect(height).toBeLessThan(0.01);
    expect(height).toBeGreaterThan(0);
  });

});

describe('squirrel fallback', () => {
  it('remains a small ground animal when authored art is unavailable', () => {
    const squirrel = createAnimal('squirrel', 0);
    const bounds = new THREE.Box3().setFromObject(squirrel);
    expect(bounds.max.y).toBeLessThan(0.4);
    expect(bounds.max.y).toBeGreaterThan(0.2);
    disposeAnimal(squirrel);
  });
});
