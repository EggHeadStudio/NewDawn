import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { makeMidFoliage, treeDetail } from './vegetation-lod';

describe('vegetation detail', () => {
  it('switches with hysteresis and a longer near range at higher quality', () => {
    expect(treeDetail(26, 'near', 'medium')).toBe('near');
    expect(treeDetail(28, 'near', 'medium')).toBe('mid');
    expect(treeDetail(22, 'mid', 'medium')).toBe('mid');
    expect(treeDetail(20, 'mid', 'medium')).toBe('near');
    expect(treeDetail(28, 'near', 'high')).toBe('near');
    expect(treeDetail(28, 'near', 'low')).toBe('mid');
    expect(treeDetail(14, 'near', 'low')).toBe('near');
    expect(treeDetail(16, 'near', 'low')).toBe('mid');
    expect(treeDetail(16, 'near', 'medium')).toBe('near');
  });

  it('shares vertex data while preserving whole selected foliage clusters', () => {
    const source = new THREE.BufferGeometry();
    const positions = new Float32Array(24);
    source.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    source.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    const mid = makeMidFoliage(source);
    expect(mid.getAttribute('position')).toBe(source.getAttribute('position'));
    expect(mid.index!.count).toBe(6);
    const selected = Array.from(mid.index!.array);
    expect(selected).toEqual([0, 1, 2, 0, 2, 3]);
    expect(source.index!.count).toBe(12);
  });
});
