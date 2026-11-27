import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { WaterEffects } from './water-effects';

describe('water effects', () => {
  it('reuses a bounded pool and expires entry splashes and swimming ripples', () => {
    const scene = new THREE.Scene();
    const effects = new WaterEffects(scene, 3);
    for (let i = 0; i < 10; i++) effects.emit(i, 2, i % 2 === 0);
    expect(effects.activeCount).toBe(3);
    expect(scene.children).toHaveLength(6);
    expect(scene.children.filter(child => child.visible)).toHaveLength(4);
    effects.update(0.5);
    expect(effects.activeCount).toBe(3);
    effects.update(0.5);
    expect(effects.activeCount).toBe(0);
    expect(scene.children.every(child => !child.visible)).toBe(true);
  });
});
