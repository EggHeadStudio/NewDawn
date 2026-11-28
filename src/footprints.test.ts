import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Footprints, footprintSurface, MAX_FOOTPRINTS } from './footprints';

describe('terrain footprints', () => {
  it('chooses snow, sand, wet soil and subtle rock without marking water', () => {
    expect(footprintSurface('forest', 'Winter', 'Snow', 1)).toBe('snow');
    expect(footprintSurface('snow', 'Summer', 'Clear', 1)).toBe('snow');
    expect(footprintSurface('beach', 'Summer', 'Clear', 0.3)).toBe('sand');
    expect(footprintSurface('desert', 'Summer', 'Clear', 1)).toBe('sand');
    expect(footprintSurface('forest', 'Summer', 'Rain', 1)).toBe('mud');
    expect(footprintSurface('rock', 'Summer', 'Clear', 1)).toBe('rock');
    expect(footprintSurface('ocean', 'Winter', 'Snow', -1)).toBeUndefined();
  });

  it('leaves alternating terrain-aligned marks only while moving on foot', () => {
    const scene = new THREE.Scene();
    const prints = new Footprints(scene);
    const edges = prints.mesh.geometry.getAttribute('footprintEdge');
    const normals = prints.mesh.geometry.getAttribute('normal');
    expect(Array.from({ length: edges.count }, (_, i) => edges.getX(i))).toContain(0);
    expect(Array.from({ length: edges.count }, (_, i) => edges.getX(i))).toContain(1);
    expect(Array.from({ length: normals.count }, (_, i) => normals.getY(i)).every(y => y > 0.99)).toBe(true);
    const height = (x: number) => 0.1 * x + 1;
    prints.update(0, { x: 0, z: 0 }, true, () => 'snow', height);
    prints.update(0.1, { x: 0, z: 1.6 }, true, () => 'snow', height);
    expect(prints.activeCount).toBe(2);
    const first = new THREE.Matrix4(), second = new THREE.Matrix4();
    prints.mesh.getMatrixAt(0, first);
    prints.mesh.getMatrixAt(1, second);
    expect(first.elements[12]).toBeCloseTo(-second.elements[12]);
    expect(first.elements[13]).not.toBeCloseTo(second.elements[13]);
    expect(first.elements[14]).toBeLessThan(second.elements[14]);
    prints.update(1, { x: 0, z: 1.6 }, true, () => 'snow', height);
    prints.update(0.1, { x: 0, z: 3.2 }, false, () => 'snow', height);
    prints.update(0.1, { x: 100, z: 100 }, true, () => 'snow', height);
    expect(prints.activeCount).toBe(2);
    prints.dispose();
    expect(scene.children).not.toContain(prints.mesh);
  });

  it('caps the pool, rebases large coordinates and fades then expires marks', () => {
    const prints = new Footprints(new THREE.Scene());
    const height = () => 1;
    prints.update(0, { x: 10_000_000, z: 0 }, true, () => 'sand', height);
    for (let x = 1; x <= 80; x++) prints.update(0.01, { x: 10_000_000 + x, z: 0 }, true, () => 'sand', height);
    expect(prints.activeCount).toBe(MAX_FOOTPRINTS);
    const matrix = new THREE.Matrix4();
    prints.mesh.getMatrixAt(0, matrix);
    expect(Math.abs(matrix.elements[12])).toBeLessThan(80);
    const alpha = prints.mesh.geometry.getAttribute('footprintAlpha');
    const initial = alpha.getX(0);
    prints.update(23, { x: 10_000_080, z: 0 }, false, () => 'sand', height);
    expect(alpha.getX(0)).toBeLessThan(initial);
    prints.update(4, { x: 10_000_080, z: 0 }, false, () => 'sand', height);
    expect(prints.activeCount).toBe(0);
    expect(prints.mesh.visible).toBe(false);
    prints.dispose();
  });
});
