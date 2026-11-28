import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { biomeAt, safeSpawn, seededNoise, terrainHeight, terrainPalette, treeAgeClass, treeSpeciesAt, vegetationFamilyAt, World } from './world';
import {
  CHUNK_SIZE, PLANET_HEIGHT, PLANET_WIDTH, geographicToPlanetPosition, nearestPlanetPosition,
  planetCoordinates, planetDistanceMeters, planetPositionToGeographic, PlanetTangentFrame,
} from './planet';
import { geographicDistanceMeters } from './geography';
import { requiresPickaxe, type DepositKind } from './economy';

describe('procedural world', () => {
  it('uses the actual desert and beach biome instead of painting them green from the climate', () => {
    expect(terrainPalette('desert', 'tropical-seasonal')).toBe('#c9ad72');
    expect(terrainPalette('beach', 'tropical-rainforest')).toBe('#d8c58a');
  });

  it('chooses reproducible distinct tree species in different latitude bands', () => {
    const species = new Set<string>();
    for (let x = 0; x < 100; x++) {
      species.add(treeSpeciesAt(x, 0, 1847, 'deciduous'));
      species.add(treeSpeciesAt(x + 1000, 0, 1847, 'deciduous'));
      species.add(treeSpeciesAt(x, PLANET_HEIGHT * 0.3, 1847, 'conifer'));
    }
    expect([...species].sort()).toEqual(['acacia', 'birch', 'fir', 'maple', 'oak', 'palm', 'pine', 'spruce', 'tropical']);
    expect(treeSpeciesAt(1000 + PLANET_WIDTH, 0, 1847, 'deciduous'))
      .toBe(treeSpeciesAt(1000, 0, 1847, 'deciduous'));
  });

  it('adds firs without reclassifying existing pine locations', () => {
    let firs = 0;
    for (let x = 0; x < 200; x++) {
      const point = planetCoordinates(x, PLANET_HEIGHT * 0.3);
      const previousPine = seededNoise(point.x, point.z, 1847 + 311) < 0.5;
      const species = treeSpeciesAt(x, PLANET_HEIGHT * 0.3, 1847, 'conifer');
      expect(species === 'pine').toBe(previousPine);
      if (species === 'fir') firs++;
    }
    expect(firs).toBeGreaterThan(0);
  });

  it('draws spruce and fir stands in mature, young and sapling age classes without changing pine', () => {
    const counts: Record<string, Record<string, number>> = { fir: {}, spruce: {}, pine: {} };
    for (let i = 0; i < 2000; i++) {
      for (const species of ['fir', 'spruce', 'pine'] as const) {
        const age = treeAgeClass(species, i * 3.7, i * 1.3, 1847);
        expect(treeAgeClass(species, i * 3.7, i * 1.3, 1847)).toBe(age);
        counts[species][age] = (counts[species][age] ?? 0) + 1;
      }
    }
    for (const species of ['fir', 'spruce']) {
      expect(counts[species].mature / 2000).toBeGreaterThan(0.25);
      expect(counts[species].mature / 2000).toBeLessThan(0.39);
      expect(counts[species].young / 2000).toBeGreaterThan(0.28);
      expect(counts[species].young / 2000).toBeLessThan(0.41);
      expect(counts[species].default).toBeGreaterThan(0);
    }
    expect(counts.pine.young).toBeUndefined();
    expect(counts.pine.mature / 2000).toBeLessThan(0.22);
  });

  it('grows some birches into larger trees without changing existing harvested quantities', () => {
    const world = new World(1847, 1);
    const birches = world.group.children.filter(object => object.userData.treeSpecies === 'birch');
    const adults = birches.filter(tree => tree.userData.natureMature);
    const younger = birches.filter(tree => !tree.userData.natureMature);
    expect(adults.length).toBeGreaterThan(0);
    expect(younger.length).toBeGreaterThan(0);
    const adult = adults.find(tree => younger.some(other => Math.abs(other.scale.x - tree.scale.x) < 0.05))!;
    const small = younger.find(tree => Math.abs(tree.scale.x - adult.scale.x) < 0.05)!;
    const fell = (tree: THREE.Object3D) => {
      const position = world.resourceLocation(tree);
      world.workTree(tree, true, position);
      world.workTree(tree, true, position);
      const result = world.workTree(tree, true, position);
      if (!result || result.kind !== 'felled') throw new Error('Expected a felled birch');
      return result.total;
    };
    expect(fell(adult)).toBeGreaterThan(fell(small) * 1.5);
    const id = adult.userData.resourceId as string;
    const position = { ...world.resourceLocation(adult) };
    world.dispose();

    const reloaded = new World(1847, 1);
    reloaded.restoreTreeHarvest({ [id]: { phase: 'fallen', progress: 1, total: 5, direction: 0 } });
    const restored = reloaded.group.children.find(tree => tree.userData.resourceId === id)!;
    expect(reloaded.workTree(restored, true, position)).toMatchObject({ kind: 'cut', total: 5 });
    expect(reloaded.workTree(restored, false, position)).toMatchObject({ kind: 'collected', amount: 3, remaining: 2 });
    reloaded.updateChunks(position.x + 150, position.z + 150, true);
    reloaded.updateChunks(position.x, position.z, true);
    const returned = reloaded.group.children.find(tree => tree.userData.resourceId === id)!;
    expect(reloaded.workTree(returned, false, position)).toMatchObject({ kind: 'collected', amount: 2, remaining: 0 });
    expect(reloaded.depletedSnapshot()).toContain(id);
    expect(reloaded.workTree(returned, false, position)).toBeUndefined();
    reloaded.dispose();
  });

  it('retains existing palm log amounts through streaming and reload without duplicating wood', () => {
    const center = { x: -600004.3, z: -600016.9 };
    const id = '-600003,-600015';
    const world = new World(1847, 1);
    world.updateChunks(center.x, center.z, true);
    const original = world.group.children.find(tree => tree.userData.resourceId === id)!;
    expect(original.userData.treeSpecies).toBe('palm');
    const location = { ...world.resourceLocation(original) };
    world.restoreTreeHarvest({ [id]: { phase: 'logs', total: 7, remaining: 4, direction: 0 } });
    const restored = world.group.children.find(tree => tree.userData.resourceId === id)!;
    expect(world.treeHarvestState(restored)).toEqual({ phase: 'logs', total: 7, remaining: 4, direction: 0 });
    expect(world.workTree(restored, false, location)).toMatchObject({ kind: 'collected', amount: 3, remaining: 1 });
    const progress = world.treeHarvestSnapshot();
    world.dispose();

    const reloaded = new World(1847, 1);
    reloaded.restoreTreeHarvest(progress);
    reloaded.updateChunks(center.x, center.z, true);
    reloaded.updateChunks(center.x + 150, center.z + 150, true);
    reloaded.updateChunks(center.x, center.z, true);
    const returned = reloaded.group.children.find(tree => tree.userData.resourceId === id)!;
    expect(reloaded.treeHarvestState(returned)).toEqual({ phase: 'logs', total: 7, remaining: 1, direction: 0 });
    expect(reloaded.workTree(returned, false, location)).toMatchObject({ kind: 'collected', amount: 1, remaining: 0 });
    expect(reloaded.depletedSnapshot()).toContain(id);
    reloaded.updateChunks(center.x + 150, center.z + 150, true);
    reloaded.updateChunks(center.x, center.z, true);
    expect(reloaded.group.children.some(tree => tree.userData.resourceId === id)).toBe(false);
    reloaded.dispose();
  });

  it('requires a saw, preserves each harvest stage across streaming and reload, and never duplicates wood', () => {
    const world = new World(1847, 1);
    const tree = world.group.children.find(object => object.userData.resource === 'wood')!;
    const id = tree.userData.resourceId as string;
    const location = { ...world.resourceLocation(tree) };
    const actor = { x: location.x - 1, z: location.z };
    expect(world.workTree(tree, true, { x: location.x + 100, z: location.z })).toBeUndefined();
    expect(world.workTree(tree, false, actor)).toEqual({ kind: 'needs-saw' });
    expect(world.workTree(tree, true, { x: location.x - 2, z: location.z })).toEqual({ kind: 'out-of-reach' });
    expect(world.treeHarvestState(tree)).toBeNull();
    expect(world.workTree(tree, true, actor)).toMatchObject({ kind: 'felling', progress: 1 });
    expect(world.gatherNearest(location.x, location.z, 0.1, 'wood')).toBeUndefined();
    expect(world.workTree(tree, true, actor)).toMatchObject({ kind: 'felling', progress: 2 });
    const felled = world.workTree(tree, true, actor);
    expect(felled).toMatchObject({ kind: 'felled' });
    if (!felled || felled.kind !== 'felled') throw new Error('Expected a felled tree');
    expect(world.workTree(tree, true, actor)).toEqual({ kind: 'falling' });
    world.animate(0, 0, 0.8);
    const midway = new THREE.Vector3(0, 1, 0).applyQuaternion(tree.quaternion);
    expect(midway.y).toBeGreaterThan(0.1);
    expect(midway.y).toBeLessThan(0.9);
    world.animate(800, 0, 0.8);
    expect(new THREE.Vector3(0, 1, 0).applyQuaternion(tree.quaternion).y).toBeCloseTo(0);
    expect(world.workTree(tree, false, actor)).toEqual({ kind: 'needs-saw' });
    expect(world.workTree(tree, true, actor)).toMatchObject({ kind: 'sawing', progress: 1 });
    const savedFallen = world.treeHarvestSnapshot();
    world.updateChunks(location.x + 150, location.z + 150, true);
    world.updateChunks(location.x, location.z, true);
    const streamed = world.group.children.find(object => object.userData.resourceId === id)!;
    expect(streamed).toBeDefined();
    expect(world.treeHarvestState(streamed)).toEqual(savedFallen[id]);
    expect(new THREE.Vector3(0, 1, 0).applyQuaternion(streamed.quaternion).y).toBeCloseTo(0);
    expect(world.workTree(streamed, true, actor)).toMatchObject({ kind: 'cut', total: felled.total });
    const first = world.workTree(streamed, false, actor);
    expect(first).toMatchObject({ kind: 'collected', amount: 3, remaining: felled.total - 3 });
    const partial = world.treeHarvestSnapshot();
    world.dispose();

    const reloaded = new World(1847, 1);
    reloaded.restoreTreeHarvest(partial);
    reloaded.updateChunks(location.x, location.z, true);
    const logs = reloaded.group.children.find(object => object.userData.resourceId === id)!;
    expect(reloaded.treeHarvestState(logs)).toEqual(partial[id]);
    let collected = 3;
    while (true) {
      const result = reloaded.workTree(logs, false, actor);
      if (!result || result.kind !== 'collected') throw new Error('Expected collectible wood');
      collected += result.amount;
      if (!result.remaining) break;
    }
    expect(collected).toBe(felled.total);
    expect(reloaded.workTree(logs, false, actor)).toBeUndefined();
    expect(reloaded.treeHarvestSnapshot()).not.toHaveProperty(id);
    expect(reloaded.depletedSnapshot()).toContain(id);
    reloaded.updateChunks(location.x + 150, location.z + 150, true);
    reloaded.updateChunks(location.x, location.z, true);
    expect(reloaded.group.children.some(object => object.userData.resourceId === id)).toBe(false);
    reloaded.dispose();
  });

  it('restores worked trees rather than regenerated stones after terrain edits', () => {
    const world = new World(1847, 1);
    world.updateChunks(-999_996, 4_500_000, true);
    const id = '-999996,4500000';
    const tree = world.group.children.find(object => object.userData.resourceId === id)!;
    expect(tree.userData.resource).toBe('wood');
    const position = { ...world.resourceLocation(tree) };
    for (let i = 0; i < 3; i++) world.workTree(tree, true, position);
    world.animate(0, 0, 1.6);
    for (let i = 0; i < 2; i++) world.workTree(tree, true, position);
    expect(world.workTree(tree, false, position)).toMatchObject({ kind: 'collected', amount: 3 });
    const harvest = world.treeHarvestSnapshot();
    expect(harvest[id]).toMatchObject({ phase: 'logs' });
    for (let i = 0; i < 10 && world.heightAt(position.x, position.z) > 0.35; i++) {
      world.editTerrain(position.x, position.z, 3, 'lower');
    }
    expect(world.heightAt(position.x, position.z)).toBeLessThanOrEqual(0.35);

    const restored = new World(1847, 1);
    restored.restore(world.snapshot());
    restored.updateChunks(position.x, position.z, true);
    expect(restored.group.children.find(object => object.userData.resourceId === id)?.userData.resource).toBe('stone');
    const frame = new PlanetTangentFrame(position);
    restored.setTangentFrame(frame);
    restored.restoreTreeHarvest(harvest);
    const rebuilt = restored.group.children.find(object => object.userData.resourceId === id)!;
    expect(rebuilt.userData.resource).toBe('wood');
    expect(restored.treeHarvestState(rebuilt)).toEqual(harvest[id]);
    expect(rebuilt.position.x).toBeCloseTo(frame.toLocal(position).x, 4);
    expect(rebuilt.position.z).toBeCloseTo(frame.toLocal(position).z, 4);
    const collected = restored.workTree(rebuilt, false, position);
    expect(collected).toMatchObject({ kind: 'collected' });
    if (!collected || collected.kind !== 'collected') throw new Error('Expected collectible timber');
    expect(restored.depletedSnapshot().includes(id)).toBe(collected.remaining === 0);
    world.dispose();
    restored.dispose();
  });

  it('gives a larger mature tree substantially more finite timber than a small tree', () => {
    const world = new World(1847, 1);
    const trees = world.group.children.filter(object => object.userData.resource === 'wood');
    const adult = trees.find(object => object.userData.natureMature && object.scale.x > 1)!;
    const small = trees.find(object => !object.userData.natureMature && object.scale.x < 1)!;
    expect(adult).toBeDefined();
    expect(small).toBeDefined();
    const fell = (tree: THREE.Object3D) => {
      const position = world.resourceLocation(tree);
      world.workTree(tree, true, position);
      world.workTree(tree, true, position);
      const result = world.workTree(tree, true, position);
      if (!result || result.kind !== 'felled') throw new Error('Expected a felled tree');
      return result.total;
    };
    expect(fell(adult)).toBeGreaterThan(fell(small) * 1.5);
    world.dispose();
  });
  it('supports bounded terrain edits and undo', () => {
    const world = new World(1847, 1);
    const before = world.heightAt(0, 0);
    const changes = world.editTerrain(0, 0, 3, 'raise');
    expect(changes.length).toBeGreaterThan(0);
    expect(world.heightAt(0, 0)).toBeGreaterThan(before);
    world.undoTerrain(changes);
    expect(world.heightAt(0, 0)).toBeCloseTo(before, 4);
  });

  it('keeps wildflower clusters varied and restores their transforms after masking and streaming', () => {
    const world = new World(1847, 1);
    const flowers = () => world.group.children.find((object): object is THREE.InstancedMesh =>
      object instanceof THREE.InstancedMesh && object.userData.groundCover === 'flower' && object.count >= 2)!;
    const mesh = flowers();
    const color = mesh.geometry.getAttribute('color');
    expect(color).toBeDefined();
    expect(new Set(Array.from({ length: color.count }, (_, i) =>
      `${color.getX(i)},${color.getY(i)},${color.getZ(i)}`)).size).toBeGreaterThan(1);
    const original = new THREE.Matrix4();
    const another = new THREE.Matrix4();
    mesh.getMatrixAt(0, original);
    mesh.getMatrixAt(1, another);
    const firstDirection = new THREE.Vector3().setFromMatrixColumn(original, 0).normalize();
    const directions = Array.from({ length: mesh.count }, (_, index) => {
      mesh.getMatrixAt(index, another);
      return new THREE.Vector3().setFromMatrixColumn(another, 0).normalize();
    });
    expect(Math.max(...directions.map(direction => firstDirection.distanceTo(direction)))).toBeGreaterThan(1);
    const x = mesh.position.x + original.elements[12], z = mesh.position.z + original.elements[14];
    const floor = { id: 'floor', kind: 'floor' as const, x: Math.round(x / 2) * 2, z: Math.round(z / 2) * 2,
      y: world.heightAt(x, z), level: 0, rotation: 0 as const, open: false };
    world.setFloorCover([floor]);
    mesh.getMatrixAt(0, another);
    expect(new THREE.Vector3().setFromMatrixColumn(another, 0).length()).toBeLessThan(0.00002);
    world.setFloorCover([]);
    mesh.getMatrixAt(0, another);
    expect(another.elements).toEqual(original.elements);
    const chunkPosition = mesh.position.clone();
    world.updateChunks(150, 150, true);
    world.updateChunks(0, 0, true);
    const reloaded = world.group.children.find((object): object is THREE.InstancedMesh =>
      object instanceof THREE.InstancedMesh && object.userData.groundCover === 'flower'
      && object.position.equals(chunkPosition))!;
    expect(reloaded).toBeDefined();
    reloaded.getMatrixAt(0, another);
    expect(another.elements).toEqual(original.elements);
    world.dispose();
  });

  it('targets the nearest point of a fallen trunk rather than always its stump', () => {
    const world = new World(1847, 1);
    const tree = world.group.children.find(object => object.userData.resource === 'wood')!;
    const location = world.resourceLocation(tree);
    const actor = { x: location.x - 1, z: location.z };
    world.workTree(tree, true, actor);
    world.workTree(tree, true, actor);
    const felled = world.workTree(tree, true, actor);
    expect(felled?.kind).toBe('felled');
    world.animate(0, 0, 1.6);
    const besideTrunk = { x: location.x + 1.2, z: location.z + 0.8 };
    const result = world.workTree(tree, true, besideTrunk);
    expect(result?.kind).toBe('sawing');
    if (!result || result.kind !== 'sawing') throw new Error('Expected to saw the fallen trunk');
    expect(result.position.x).toBeCloseTo(location.x + 1.2, 1);
    expect(result.position.z).toBeCloseTo(location.z, 1);
    world.dispose();
  });

  it('hides floor-level decorative cover and restores it after removal and streaming', () => {
    const world = new World(1847, 1);
    const meshes = () => world.group.children.filter((object): object is THREE.InstancedMesh =>
      object instanceof THREE.InstancedMesh && Boolean(object.userData.groundCover));
    const matrix = new THREE.Matrix4();
    const mesh = meshes().find(object => object.count > 0)!;
    mesh.getMatrixAt(0, matrix);
    const original = matrix.clone();
    const x = mesh.position.x + matrix.elements[12], z = mesh.position.z + matrix.elements[14];
    const floor = { id: 'floor', kind: 'floor' as const, x: Math.round(x / 2) * 2, z: Math.round(z / 2) * 2,
      y: world.heightAt(x, z), level: 0, rotation: 0 as const, open: false };
    const distant = meshes().find(object => object.count > 0 && Math.hypot(object.position.x - x, object.position.z - z) > 24)!;
    distant.getMatrixAt(0, matrix);
    const distantOriginal = matrix.clone();
    const resourceCount = world.group.children.filter(object => object.userData.resource || object.userData.depositId).length;
    world.setFloorCover([{ ...floor, y: floor.y + 2.4, level: 1 }]);
    mesh.getMatrixAt(0, matrix);
    expect(matrix.elements[0]).toBeCloseTo(original.elements[0]);
    world.setFloorCover([floor]);
    mesh.getMatrixAt(0, matrix);
    expect(new THREE.Vector3().setFromMatrixColumn(matrix, 0).length()).toBeLessThan(0.00002);
    distant.getMatrixAt(0, matrix);
    expect(matrix.elements).toEqual(distantOriginal.elements);
    expect(world.group.children.filter(object => object.userData.resource || object.userData.depositId)).toHaveLength(resourceCount);
    const terrainChanges = world.editTerrain(x, z, 4, 'flatten', floor.y + 1);
    mesh.getMatrixAt(0, matrix);
    expect(matrix.elements[0]).toBeCloseTo(original.elements[0]);
    world.undoTerrain(terrainChanges);
    mesh.getMatrixAt(0, matrix);
    expect(new THREE.Vector3().setFromMatrixColumn(matrix, 0).length()).toBeLessThan(0.00002);
    world.setFloorCover([]);
    mesh.getMatrixAt(0, matrix);
    expect(matrix.elements).toEqual(original.elements);
    world.setFloorCover([floor]);
    world.updateChunks(x + 150, z + 150, true);
    world.updateChunks(x, z, true);
    const reloaded = meshes().find(object => object.userData.groundCover === mesh.userData.groundCover
      && object.position.x === mesh.position.x && object.position.z === mesh.position.z)!;
    expect(reloaded).toBeDefined();
    reloaded.getMatrixAt(0, matrix);
    expect(new THREE.Vector3().setFromMatrixColumn(matrix, 0).length()).toBeLessThan(0.00002);
    world.setFloorCover([]);
    reloaded.getMatrixAt(0, matrix);
    expect(matrix.elements).toEqual(original.elements);
    world.dispose();
  });

  it('applies floor cover masking in reflected polar and wrapped longitude copies', () => {
    const world = new World(500, 1);
    const matrix = new THREE.Matrix4();
    for (const sign of [-1, 1]) {
      const z = sign * (PLANET_HEIGHT / 2 - 12);
      world.updateChunks(12, z, true);
      const mesh = world.group.children.find((object): object is THREE.InstancedMesh =>
        object instanceof THREE.InstancedMesh && Boolean(object.userData.groundCover) && object.count > 0)!;
      expect(mesh).toBeDefined();
      mesh.getMatrixAt(0, matrix);
      const x = mesh.position.x + matrix.elements[12], groundZ = mesh.position.z + matrix.elements[14];
      const floor = { id: 'floor', kind: 'floor' as const, x: Math.round(x / 2) * 2, z: Math.round(groundZ / 2) * 2,
        y: matrix.elements[13] - 0.13, level: 0, rotation: 0 as const, open: false };
      world.setFloorCover([floor]);
      mesh.getMatrixAt(0, matrix);
      expect(new THREE.Vector3().setFromMatrixColumn(matrix, 0).length()).toBeLessThan(0.00002);
      for (const copy of [{ x: x + PLANET_WIDTH, z: groundZ },
        { x: x - PLANET_WIDTH / 2, z: sign * PLANET_HEIGHT - groundZ }]) {
        world.updateChunks(copy.x, copy.z, true);
        const found = world.group.children.some(object => {
          if (!(object instanceof THREE.InstancedMesh) || object.userData.groundCover !== mesh.userData.groundCover) return false;
          for (let i = 0; i < object.count; i++) {
            object.getMatrixAt(i, matrix);
            if (Math.hypot(object.position.x + matrix.elements[12] - copy.x,
              object.position.z + matrix.elements[14] - copy.z) < 0.001) {
              return new THREE.Vector3().setFromMatrixColumn(matrix, 0).length() < 0.00002;
            }
          }
          return false;
        });
        expect(found).toBe(true);
      }
      world.setFloorCover([]);
    }
    world.dispose();
  });

  it('updates terrain material weights when terrain is edited and seasons change', () => {
    const world = new World(1847);
    const terrain = world.group.children.find((object): object is THREE.Mesh => {
      if (!(object instanceof THREE.Mesh) || !object.userData.chunk) return false;
      const positions = object.geometry.getAttribute('position');
      const blends = object.geometry.getAttribute('terrainBlend');
      return Array.from({ length: positions.count }, (_, i) => i)
        .some(i => positions.getY(i) > 0.1 && positions.getY(i) < 0.6 && blends.getY(i) > 0);
    })!;
    expect(terrain).toBeDefined();
    const positions = terrain.geometry.getAttribute('position');
    const blends = terrain.geometry.getAttribute('terrainBlend');
    let index = -1;
    for (let i = 0; i < positions.count; i++) {
      if (positions.getY(i) > 0.1 && positions.getY(i) < 0.6 && blends.getY(i) > 0) { index = i; break; }
    }
    expect(index).toBeGreaterThanOrEqual(0);
    const x = terrain.position.x + positions.getX(index);
    const z = terrain.position.z + positions.getZ(index);
    const before = blends.getY(index);
    world.editTerrain(x, z, 2, 'raise');
    expect(blends.getY(index)).toBeLessThan(before);
    world.setSeason('Winter');
    expect(blends.getZ(index)).toBe(positions.getY(index) > 0.45 ? 1 : 0);
    world.setSeason('Spring');
    expect(blends.getZ(index)).toBe(0);
    world.dispose();
  });

  it('updates shoreline depths with terrain edits and keeps the water grid aligned when reprojected', () => {
    const world = new World(1847, 1);
    const terrain = world.group.children.find((object): object is THREE.Mesh =>
      object instanceof THREE.Mesh && object.userData.chunk === '0,0')!;
    const water = world.group.children.find((object): object is THREE.Mesh =>
      object instanceof THREE.Mesh && object.name === 'water'
      && object.position.x === terrain.position.x && object.position.z === terrain.position.z)!;
    const positions = terrain.geometry.getAttribute('position');
    const depths = water.geometry.getAttribute('waterDepth');
    const index = 5 * (CHUNK_SIZE + 1) + 7;
    const x = terrain.position.x + positions.getX(index);
    const z = terrain.position.z + positions.getZ(index);
    const before = depths.getX(index);
    expect(before).toBeCloseTo(-0.08 - positions.getY(index), 5);
    world.editTerrain(x, z, 2, 'raise');
    expect(depths.getX(index)).toBeLessThan(before);
    expect(depths.getX(index)).toBeCloseTo(-0.08 - positions.getY(index), 5);
    const frame = new PlanetTangentFrame({ x, z });
    world.setTangentFrame(frame);
    const point = frame.toLocal({ x, z });
    const waterPositions = water.geometry.getAttribute('position');
    expect(water.position.x + waterPositions.getX(index)).toBeCloseTo(point.x, 5);
    expect(water.position.z - waterPositions.getY(index)).toBeCloseTo(point.z, 5);
    world.dispose();
  });

  it('samples the visible terrain triangles on both sides of a cell diagonal', () => {
    const world = new World(1847);
    const ray = new THREE.Raycaster();
    for (const [baseX, baseZ] of [[4, 8], [PLANET_WIDTH / 2 - 48, PLANET_HEIGHT / 2 - 48]]) {
      world.updateChunks(baseX, baseZ, true);
      world.editTerrain(baseX, baseZ, 2, 'raise');
      world.group.updateMatrixWorld(true);
      for (const [dx, dz] of [[0.2, 0.3], [0.75, 0.6], [-0.1, 0.4]]) {
        const x = baseX + dx, z = baseZ + dz;
        ray.set(new THREE.Vector3(x, 100, z), new THREE.Vector3(0, -1, 0));
        const hit = world.intersectTerrain(ray);
        expect(hit).toBeDefined();
        expect(world.heightAt(x, z)).toBeCloseTo(hit!.y, 4);
      }
    }
    world.dispose();
  });

  it('updates edited vertices from their terrain ownership coordinates rather than rendered coordinates', () => {
    const world = new World(1847);
    const terrain = world.group.children.find((object): object is THREE.Mesh =>
      object instanceof THREE.Mesh && object.userData.chunk === '0,0')!;
    const positions = terrain.geometry.getAttribute('position');
    const index = 5 * (CHUNK_SIZE + 1) + 7;
    const x = terrain.position.x + positions.getX(index);
    const z = terrain.position.z + positions.getZ(index);
    const before = positions.getY(index);
    positions.setX(index, positions.getX(index) + 30);
    positions.setZ(index, positions.getZ(index) - 30);
    terrain.position.x += 20;
    terrain.position.z -= 20;
    world.editTerrain(x, z, 2, 'raise');
    expect(positions.getY(index)).toBeGreaterThan(before);
    expect(positions.getY(index)).toBeCloseTo(world.heightAt(x, z), 5);
    world.dispose();
  });

  it('reprojects streamed terrain, resources and edits into a relocatable tangent frame', () => {
    const world = new World(1847);
    const start = geographicToPlanetPosition(85, 179.99999);
    world.updateChunks(start.x, start.z, true);
    world.editTerrain(start.x, start.z, 3, 'raise');
    let frame = new PlanetTangentFrame(start);
    world.setTangentFrame(frame);
    const ray = new THREE.Raycaster();
    const check = () => {
      world.group.updateMatrixWorld(true);
      for (const [dx, dz] of [[0.2, 0.3], [0.75, 0.6]]) {
        const x = start.x + dx;
        const z = start.z + dz;
        const local = frame.toLocal({ x, z });
        ray.set(new THREE.Vector3(local.x, 100, local.z), new THREE.Vector3(0, -1, 0));
        expect(world.intersectTerrain(ray)?.y).toBeCloseTo(world.heightAt(x, z), 3);
      }
      const resource = world.group.children.find(item => item.userData.resource)!;
      const location = world.resourceLocation(resource);
      const local = frame.toLocal(location);
      expect(resource.position.x).toBeCloseTo(local.x, 5);
      expect(resource.position.z).toBeCloseTo(local.z, 5);
      expect(world.findNearest(location.x, location.z, 0.01)).toBe(resource);
    };
    check();
    const oldHeight = world.heightAt(start.x, start.z);
    world.editTerrain(start.x, start.z, 3, 'raise');
    expect(world.heightAt(start.x, start.z)).toBeGreaterThan(oldHeight);
    check();
    world.updateChunks(start.x + CHUNK_SIZE, start.z, true);
    check();
    frame = new PlanetTangentFrame({ x: start.x + 24, z: start.z + 24 });
    world.setTangentFrame(frame);
    check();
    world.setTangentFrame(null);
    world.group.updateMatrixWorld(true);
    ray.set(new THREE.Vector3(start.x, 100, start.z), new THREE.Vector3(0, -1, 0));
    expect(world.intersectTerrain(ray)?.y).toBeCloseTo(world.heightAt(start.x, start.z), 3);
    world.dispose();
  });

  it('preserves edited terrain triangles across reflected polar copies', () => {
    const world = new World(1847);
    const ray = new THREE.Raycaster();
    for (const sign of [-1, 1]) {
      const base = sign * (PLANET_HEIGHT / 2 - 12);
      world.updateChunks(12, base, true);
      world.editTerrain(12, base, 1, 'raise');
      for (const [dx, dz] of [[0.2, 0.3], [0.75, 0.6]]) {
        const x = 12 + dx;
        const z = base + dz;
        const height = world.heightAt(x, z);
        const reflectedX = x - PLANET_WIDTH / 2;
        const reflectedZ = sign * PLANET_HEIGHT - z;
        expect(world.heightAt(reflectedX, reflectedZ)).toBeCloseTo(height, 5);
        world.updateChunks(reflectedX, reflectedZ, true);
        world.group.updateMatrixWorld(true);
        ray.set(new THREE.Vector3(reflectedX, 100, reflectedZ), new THREE.Vector3(0, -1, 0));
        expect(world.intersectTerrain(ray)?.y).toBeCloseTo(height, 4);
      }
    }
    world.dispose();
  });

  it('keeps resources and ground cover on the visible surface after terrain edits', () => {
    const world = new World(1847);
    const resource = world.group.children.find(item => item.userData.legacy && item.userData.resource === 'wood')!;
    expect(resource).toBeDefined();
    expect(resource.position.y).toBeCloseTo(world.heightAt(resource.position.x, resource.position.z), 5);
    const before = resource.position.y;
    world.editTerrain(resource.position.x, resource.position.z, 2, 'raise');
    expect(resource.position.y).toBeGreaterThan(before);
    expect(resource.position.y).toBeCloseTo(world.heightAt(resource.position.x, resource.position.z), 5);

    const cover = world.group.children.find((item): item is THREE.InstancedMesh =>
      item instanceof THREE.InstancedMesh && Boolean(item.userData.groundCover) && item.count > 0)!;
    expect(cover).toBeDefined();
    const matrix = new THREE.Matrix4();
    cover.getMatrixAt(0, matrix);
    const point = new THREE.Vector3().setFromMatrixPosition(matrix).add(cover.position);
    world.editTerrain(point.x, point.z, 2, 'raise');
    cover.getMatrixAt(0, matrix);
    const updated = new THREE.Vector3().setFromMatrixPosition(matrix).add(cover.position);
    expect(updated.y).toBeGreaterThan(point.y);
    expect(updated.y).toBeCloseTo(world.heightAt(updated.x, updated.z) + 0.13, 5);
    const stone = world.group.children.find(item => item.userData.resource === 'stone')!;
    const deposit = world.group.children.find(item => item.userData.depositId)!;
    expect(stone.position.y).toBeCloseTo(world.heightAt(stone.position.x, stone.position.z) + 0.12, 5);
    const depositBefore = deposit.position.y;
    world.editTerrain(deposit.position.x, deposit.position.z, 2, 'raise');
    expect(deposit.position.y).toBeGreaterThan(depositBefore);
    expect(deposit.position.y).toBeCloseTo(world.heightAt(deposit.position.x, deposit.position.z), 5);
    const saved = world.snapshot();
    const editedHeight = resource.position.y;
    world.restore({});
    expect(resource.position.y).toBeCloseTo(before, 5);
    world.restore(saved);
    expect(resource.position.y).toBeCloseTo(editedHeight, 5);
    cover.getMatrixAt(0, matrix);
    expect(matrix.elements[13]).toBeCloseTo(world.heightAt(updated.x, updated.z) + 0.13, 5);
    world.dispose();
  });

  it('updates ground-cover height from ownership coordinates after render transforms change', () => {
    const world = new World(1847);
    const cover = world.group.children.find((item): item is THREE.InstancedMesh =>
      item instanceof THREE.InstancedMesh && Boolean(item.userData.groundCover) && item.count > 0)!;
    const matrix = new THREE.Matrix4();
    cover.getMatrixAt(0, matrix);
    const x = matrix.elements[12] + cover.position.x;
    const z = matrix.elements[14] + cover.position.z;
    const before = matrix.elements[13];
    matrix.elements[12] += 30;
    matrix.elements[14] -= 30;
    cover.setMatrixAt(0, matrix);
    cover.position.x += 20;
    cover.position.z -= 20;
    world.editTerrain(x, z, 2, 'raise');
    cover.getMatrixAt(0, matrix);
    expect(matrix.elements[13]).toBeGreaterThan(before);
    expect(matrix.elements[13]).toBeCloseTo(world.heightAt(x, z) + 0.13, 5);
    world.dispose();
  });

  it('uses resource ownership coordinates for lookup, edits and gathering after render transforms change', () => {
    const world = new World(1847);
    const resource = world.group.children.find(item => item.userData.legacy && item.userData.resource === 'wood')!;
    const position = world.resourcePosition(resource);
    resource.position.x += 30;
    resource.position.z -= 30;
    expect(world.findNearest(position.x, position.z, 0.1, 'wood')).toBe(resource);
    world.editTerrain(position.x, position.z, 2, 'raise');
    expect(resource.position.y).toBeCloseTo(world.heightAt(position.x, position.z), 5);
    expect(world.gatherNearest(position.x, position.z, 0.1, 'wood')?.position.x).toBe(position.x);
    world.dispose();
  });
  it('is deterministic for a given seed and coordinate', () => {
    expect(terrainHeight(12.5, -8, 1847)).toBe(terrainHeight(12.5, -8, 1847));
    expect(seededNoise(4, 7, 1847)).toBe(seededNoise(4, 7, 1847));
  });

  it('renders the same terrain colors in equivalent longitude copies', () => {
    const world = new World(1847);
    const x = 1000;
    const z = Math.round(PLANET_HEIGHT * 50 / 180);
    const colorAt = (px: number) => {
      world.updateChunks(px, z, true);
      const key = `${Math.floor(px / CHUNK_SIZE)},${Math.floor(z / CHUNK_SIZE)}`;
      const mesh = world.group.children.find((object): object is THREE.Mesh =>
        object instanceof THREE.Mesh && object.userData.chunk === key)!;
      const positions = mesh.geometry.getAttribute('position');
      const colors = mesh.geometry.getAttribute('color');
      for (let i = 0; i < positions.count; i++) {
        if (positions.getX(i) + mesh.position.x === px && positions.getZ(i) + mesh.position.z === z) {
          return [colors.getX(i), colors.getY(i), colors.getZ(i)];
        }
      }
      throw new Error('Terrain vertex not found');
    };
    expect(colorAt(x + PLANET_WIDTH)).toEqual(colorAt(x));
    world.dispose();
  });

  it('keeps ground cover at the same geographic positions in reflected polar copies', () => {
    const world = new World(500);
    const matrix = new THREE.Matrix4();
    const coverAt = (x: number, z: number, pole: number) => {
      world.updateChunks(x, z, true);
      return world.group.children.flatMap(object => {
        if (!(object instanceof THREE.InstancedMesh) || !object.userData.groundCover) return [];
        return Array.from({ length: object.count }, (_, index) => {
          object.getMatrixAt(index, matrix);
          const point = planetCoordinates(matrix.elements[12] + object.position.x, matrix.elements[14] + object.position.z);
          return { x: point.x, y: matrix.elements[13], z: point.z, kind: object.userData.groundCover as string };
        }).filter(point => point.x > 2 && point.x < 22 && Math.abs(point.z - pole) > 2 && Math.abs(point.z - pole) < 22);
      });
    };
    for (const sign of [-1, 1]) {
      const pole = sign * PLANET_HEIGHT / 2;
      const original = coverAt(12, pole - sign * 12, pole);
      const reflected = coverAt(12 - PLANET_WIDTH / 2, pole + sign * 12, pole);
      expect(original.length).toBeGreaterThan(0);
      expect(reflected).toHaveLength(original.length);
      for (const point of original) {
        expect(reflected.some(other => other.kind === point.kind
          && Math.hypot(point.x - other.x, point.y - other.y, point.z - other.z) < 0.0001)).toBe(true);
      }
    }
    world.dispose();
  });

  it('produces distinguishable playable biomes', () => {
    const biomes = new Set<string>();
    for (let z = -40; z <= 40; z += 4) {
      for (let x = -40; x <= 40; x += 4) biomes.add(biomeAt(x, z, 1847));
    }
    expect(biomes.size).toBeGreaterThanOrEqual(3);
  });

  it('selects deterministic vegetation families across the generated planet', () => {
    const families = new Set<string>();
    for (let latitude = -80; latitude <= 80; latitude += 5) {
      for (let longitude = -180; longitude < 180; longitude += 5) {
        const point = geographicToPlanetPosition(latitude, longitude);
        families.add(vegetationFamilyAt(point.x, point.z, 1847));
      }
    }
    for (const family of ['deciduous', 'conifer', 'cactus', 'none']) expect(families).toContain(family);
  });

  it('streams cactus geometry into arid planetary chunks', () => {
    let location: { x: number; z: number } | undefined;
    for (let latitude = 5; latitude <= 40 && !location; latitude++) {
      for (let longitude = -180; longitude < 180 && !location; longitude++) {
        const center = geographicToPlanetPosition(latitude, longitude);
        for (let dz = -1; dz <= 1 && !location; dz++) {
          for (let dx = -1; dx <= 1 && !location; dx++) {
            const x = Math.round(center.x / 3) * 3 + dx * 3;
            const z = Math.round(center.z / 3) * 3 + dz * 3;
            const point = planetCoordinates(x, z);
            const px = x + seededNoise(point.x, point.z, 1847) - 0.5;
            const pz = z + (seededNoise(point.z, point.x, 1850) - 0.5) * (point.reflected ? -1 : 1);
            if (terrainHeight(px, pz, 1847) > 0.45 && vegetationFamilyAt(px, pz, 1847) === 'cactus'
              && seededNoise(point.x, point.z, 1855) > 0.91) location = { x, z };
          }
        }
      }
    }
    expect(location).toBeDefined();
    const world = new World(1847);
    world.updateChunks(location!.x, location!.z, true);
    expect(world.group.children.some(object => object.userData.vegetationFamily === 'cactus')).toBe(true);
    world.dispose();
  });

  it('keeps terrain bounded to a navigable range', () => {
    for (let x = -48; x <= 48; x += 8) {
      for (let z = -48; z <= 48; z += 8) {
        expect(terrainHeight(x, z, 1847)).toBeGreaterThanOrEqual(-2.5);
        expect(terrainHeight(x, z, 1847)).toBeLessThan(10);
      }
    }
  });

  it('finds deterministic dry spawn positions for representative seeds', () => {
    for (const seed of [1, 25, 1847, 92301]) {
      const spawn = safeSpawn(seed);
      expect(spawn).toEqual(safeSpawn(seed));
      expect(spawn).not.toBeNull();
      expect(terrainHeight(spawn!.x, spawn!.z, seed)).toBeGreaterThan(0.8);
    }
  });

  it('preserves the original starter resource locations and kinds', () => {
    const world = new World(1847);
    const actual = new Map(world.group.children.filter(item => item.userData.resource)
      .map(item => [item.userData.resourceId as string, item.userData.resource as string]));
    for (let z = -19; z <= 20; z += 3) {
      for (let x = -19; x <= 20; x += 3) {
        const px = x + seededNoise(x, z, 1847) - 0.5;
        const pz = z + seededNoise(z, x, 1850) - 0.5;
        const h = terrainHeight(px, pz, 1847);
        const biome = biomeAt(px, pz, 1847);
        const kind = h > 0.35 && biome === 'forest' && seededNoise(x, z, 1855) > 0.42 ? 'wood'
          : h > 0.1 && biome !== 'ocean' && seededNoise(x + 4, z + 9, 1847) > 0.76 ? 'stone'
          : h > 0.45 && seededNoise(x + 12, z - 7, 1847) > 0.8 ? 'food' : undefined;
        expect(actual.get(`${x},${z}`)).toBe(kind);
      }
    }
    world.dispose();
  });

  it('updates instanced ground cover with the seasons without changing resources', () => {
    const world = new World(1847);
    const countResources = () => world.group.children.filter(child => child.userData.resource).length;
    const initialResources = countResources();
    const flowers = world.group.children.find(child => child.userData.groundCover === 'flower') as THREE.InstancedMesh;
    expect(flowers.count).toBeGreaterThan(0);
    world.setSeason('Winter');
    expect(flowers.visible).toBe(false);
    world.setSeason('Spring');
    expect(flowers.visible).toBe(true);
    expect(countResources()).toBe(initialResources);
    world.dispose();
  });

  it('joins longitude samples and reflects latitude with a half-turn at the poles', () => {
    for (const z of [-PLANET_HEIGHT / 2, -350, 0, 350, PLANET_HEIGHT / 2]) {
      for (const x of [-1500, -250, 0, 220, 1500]) {
        expect(terrainHeight(x, z, 1847)).toBeCloseTo(terrainHeight(x + PLANET_WIDTH, z, 1847), 7);
      }
    }
    const reflected = planetCoordinates(10, PLANET_HEIGHT / 2 + 5);
    expect(reflected.x).toBe(10 - PLANET_WIDTH / 2);
    expect(reflected.z).toBeCloseTo(PLANET_HEIGHT / 2 - 5, 6);
    expect(reflected.reflected).toBe(true);
    expect(terrainHeight(10, PLANET_HEIGHT / 2 + 5, 1847))
      .toBeCloseTo(terrainHeight(reflected.x, reflected.z, 1847), 7);
    expect(terrainHeight(0, PLANET_HEIGHT / 2, 1847)).toBeCloseTo(terrainHeight(900, PLANET_HEIGHT / 2, 1847), 7);
    expect(nearestPlanetPosition(-PLANET_WIDTH / 2 + 6, 0, PLANET_WIDTH / 2 - 6, 0))
      .toEqual({ x: PLANET_WIDTH / 2 + 6, z: 0 });
    expect(nearestPlanetPosition(-PLANET_WIDTH / 2 + 10, PLANET_HEIGHT / 2 - 5,
      10, PLANET_HEIGHT / 2 + 5)).toEqual({ x: 10, z: PLANET_HEIGHT / 2 + 5 });
  });

  it('maps live world-meter coordinates to geographic positions and back', () => {
    expect(PLANET_WIDTH).toBeCloseTo(40_030_173, -2);
    expect(PLANET_HEIGHT).toBeCloseTo(20_015_086, -2);
    const origin = planetPositionToGeographic(0, 0);
    const tenKilometersEast = planetPositionToGeographic(10_000, 0);
    expect(geographicDistanceMeters(origin, tenKilometersEast)).toBeCloseTo(10_000, 0);
    const roundTrip = geographicToPlanetPosition(tenKilometersEast.latitude, tenKilometersEast.longitude);
    expect(roundTrip.x).toBeCloseTo(10_000, 6);
    expect(roundTrip.z).toBeCloseTo(0, 6);
  });

  it('measures projected east-west distances in true local meters', () => {
    const equator = geographicToPlanetPosition(0, 0);
    const equatorEast = geographicToPlanetPosition(0, 0.01);
    const highLatitude = geographicToPlanetPosition(60, 0);
    const highLatitudeEast = geographicToPlanetPosition(60, 0.01);
    expect(planetDistanceMeters(equator, equatorEast)).toBeCloseTo(1111.95, 0);
    expect(planetDistanceMeters(highLatitude, highLatitudeEast)).toBeCloseTo(555.97, 0);
  });

  it('keeps canonical geography continuous at the date line and across a pole', () => {
    const acrossDateLine = planetPositionToGeographic(PLANET_WIDTH / 2 + 10, 0);
    expect(acrossDateLine.longitude).toBeCloseTo(-180 + 10 / PLANET_WIDTH * 360, 8);

    const beyondNorthPole = planetPositionToGeographic(10, PLANET_HEIGHT / 2 + 5);
    const reflected = planetPositionToGeographic(10 - PLANET_WIDTH / 2, PLANET_HEIGHT / 2 - 5);
    expect(beyondNorthPole.latitude).toBeCloseTo(reflected.latitude, 8);
    expect(Math.abs(beyondNorthPole.longitude - reflected.longitude)).toBeCloseTo(0, 8);
  });

  it('shares exact terrain vertices across adjacent chunk boundaries', () => {
    const world = new World(1847);
    const terrain = (key: string) => world.group.children.find(item => item.userData.chunk === key) as THREE.Mesh;
    const edge = (mesh: THREE.Mesh, x: number) => {
      const positions = mesh.geometry.attributes.position;
      const values = new Map<number, number>();
      for (let i = 0; i < positions.count; i++) {
        if (positions.getX(i) + mesh.position.x === x) values.set(positions.getZ(i) + mesh.position.z, positions.getY(i));
      }
      return values;
    };
    expect(edge(terrain('0,0'), CHUNK_SIZE).size).toBe(CHUNK_SIZE + 1);
    expect(edge(terrain('0,0'), CHUNK_SIZE)).toEqual(edge(terrain('1,0'), CHUNK_SIZE));
    world.dig(CHUNK_SIZE, 8);
    expect(edge(terrain('0,0'), CHUNK_SIZE)).toEqual(edge(terrain('1,0'), CHUNK_SIZE));
    world.dispose();
  });

  it('keeps distant terrain and ground cover chunk-local through edits and rebasing', () => {
    const world = new World(1847);
    const x = Math.floor((PLANET_WIDTH / 2 - 48) / CHUNK_SIZE) * CHUNK_SIZE;
    const z = Math.floor((PLANET_HEIGHT / 2 - 48) / CHUNK_SIZE) * CHUNK_SIZE;
    world.updateChunks(x, z, true);
    const terrain = world.group.children.find(item => item.userData.chunk === `${x / CHUNK_SIZE},${z / CHUNK_SIZE}`) as THREE.Mesh;
    const positions = terrain.geometry.attributes.position;
    expect(positions.getX(1) - positions.getX(0)).toBe(1);
    const cover = world.group.children.filter((item): item is THREE.InstancedMesh => item instanceof THREE.InstancedMesh
      && item.userData.groundCover && item.count > 0);
    expect(cover.length).toBeGreaterThan(0);
    for (const mesh of cover) {
      const matrix = new THREE.Matrix4();
      mesh.getMatrixAt(0, matrix);
      const position = new THREE.Vector3().setFromMatrixPosition(matrix);
      expect(Math.abs(position.x)).toBeLessThan(CHUNK_SIZE + 1);
      expect(Math.abs(position.z)).toBeLessThan(CHUNK_SIZE + 1);
    }
    const before = world.heightAt(x + 4, z + 4);
    world.editTerrain(x + 4, z + 4, 1, 'raise');
    let editedHeight: number | undefined;
    for (let i = 0; i < positions.count; i++) {
      if (positions.getX(i) + terrain.position.x === x + 4 && positions.getZ(i) + terrain.position.z === z + 4) {
        editedHeight = positions.getY(i);
      }
    }
    expect(editedHeight).toBeCloseTo(world.heightAt(x + 4, z + 4), 5);
    expect(editedHeight!).toBeGreaterThan(before);
    world.rebase(-PLANET_WIDTH, 0);
    world.dig(x + 4 - PLANET_WIDTH, z + 4);
    expect(positions.getX(1) - positions.getX(0)).toBe(1);
    let rebasedHeight: number | undefined;
    for (let i = 0; i < positions.count; i++) {
      if (positions.getX(i) + terrain.position.x === x + 4 - PLANET_WIDTH && positions.getZ(i) + terrain.position.z === z + 4) {
        rebasedHeight = positions.getY(i);
      }
    }
    expect(rebasedHeight).toBeCloseTo(world.heightAt(x + 4 - PLANET_WIDTH, z + 4), 5);
    world.dispose();
  });

  it('disposes per-tree shadow materials when resource chunks unload', () => {
    const world = new World(1847, 1);
    const tree = world.group.children.find(object => object.userData.resource === 'wood')!;
    let mesh: THREE.Mesh | undefined;
    tree.traverse(object => { if (!mesh && object instanceof THREE.Mesh) mesh = object; });
    expect(mesh).toBeDefined();
    const shadow = new THREE.MeshDepthMaterial();
    mesh!.customDepthMaterial = shadow;
    let disposals = 0;
    shadow.addEventListener('dispose', () => disposals++);
    world.updateChunks(1000, 1000, true);
    expect(disposals).toBe(1);
    world.dispose();
    expect(disposals).toBe(1);
  });

  it('unloads and regenerates chunks while retaining excavations and depleted resources', () => {
    const world = new World(1847);
    world.updateChunks(160, 160, true);
    expect(world.loadedChunkCount).toBe(9);
    const resource = world.group.children.find(item => item.userData.resource);
    expect(resource).toBeDefined();
    const { x, z } = resource!.position;
    expect(world.gatherNearest(x, z, 0.1)).toBeDefined();
    world.dig(160, 160);
    const modified = world.heightAt(160, 160);
    world.updateChunks(-300, -300, true);
    expect(world.loadedChunkCount).toBe(9);
    world.updateChunks(160, 160, true);
    expect(world.loadedChunkCount).toBe(9);
    expect(world.gatherNearest(x, z, 0.1)).toBeUndefined();
    expect(world.heightAt(160, 160)).toBeCloseTo(modified);
    const restored = new World(1847);
    restored.restore(world.snapshot());
    restored.restoreDepleted(world.depletedSnapshot());
    restored.updateChunks(160, 160, true);
    expect(restored.heightAt(160, 160)).toBeCloseTo(modified);
    expect(restored.gatherNearest(x, z, 0.1)).toBeUndefined();
    world.dispose();
    restored.dispose();
  });

  it('streams distant metric terrain and retains edits across unloads', () => {
    const world = new World(1847, 1);
    const x = 1_000_000;
    const z = 250_000;
    world.updateChunks(x, z, true);
    const before = world.heightAt(x, z);
    const changes = world.editTerrain(x, z, 2, 'lower');
    expect(changes.length).toBeGreaterThan(0);
    const edited = world.heightAt(x, z);
    expect(edited).toBeLessThan(before);
    expect(world.loadedChunkCount).toBe(9);
    world.updateChunks(0, 0, true);
    expect(world.loadedChunkCount).toBe(9);
    world.updateChunks(x, z, true);
    expect(world.heightAt(x, z)).toBeCloseTo(edited, 5);
    expect(world.loadedChunkCount).toBe(9);
    world.dispose();
  });

  it('mines finite deposits, requires a pickaxe, and preserves partial progress across streaming and reload', () => {
    const world = new World(1847);
    const deposit = world.group.children.find(item => item.userData.depositId
      && requiresPickaxe(item.userData.mineral as DepositKind));
    expect(deposit).toBeDefined();
    const { x, z } = deposit!.position;
    const id = deposit!.userData.depositId as string;
    expect(world.mineDeposit(deposit!, false)).toMatchObject({ needsPickaxe: true });
    expect(world.miningSnapshot()).toEqual({});
    expect(world.mineDeposit(deposit!, true)).toMatchObject({ needsPickaxe: false, progress: 1 });
    world.updateChunks(160, 160, true);
    world.updateChunks(x, z, true);
    const regenerated = world.findNearestDeposit(x, z, 0.1);
    expect(regenerated?.userData.depositId).toBe(id);
    expect(world.mineDeposit(regenerated!, true)).toMatchObject({ progress: 2 });
    const restored = new World(1847);
    restored.restoreMining(world.miningSnapshot());
    restored.updateChunks(x, z, true);
    const restoredDeposit = restored.findNearestDeposit(x, z, 0.1);
    expect(restored.mineDeposit(restoredDeposit!, true)).toMatchObject({ progress: 3 });
    expect(restored.findNearestDeposit(x, z, 0.1)).toBeUndefined();
    restored.updateChunks(160, 160, true);
    restored.updateChunks(x, z, true);
    expect(restored.findNearestDeposit(x, z, 0.1)).toBeUndefined();
    expect(restored.mineDeposit(restoredDeposit!, true)).toBeUndefined();
    world.dispose();
    restored.dispose();
  });

  it('keeps new deposits out of existing saved buildings across chunk reloads and longitude copies', () => {
    const world = new World(1847);
    const deposit = world.group.children.find(item => item.userData.depositId)!;
    expect(deposit).toBeDefined();
    const { x, z } = deposit.position;
    world.setDepositExclusions([{ x: x + PLANET_WIDTH, z, radius: 1 }]);
    expect(world.findNearestDeposit(x, z, 0.1)).toBeUndefined();
    world.updateChunks(160, 160, true);
    world.updateChunks(x, z, true);
    expect(world.findNearestDeposit(x, z, 0.1)).toBeUndefined();
    expect(world.miningSnapshot()).toEqual({});
    world.dispose();
  });

  it('retains the same deposit and mining progress across the longitude seam', () => {
    const world = new World(1847);
    world.updateChunks(1536, 180, true);
    const deposit = world.group.children.find(item => item.userData.depositId && item.position.x > 1536);
    expect(deposit).toBeDefined();
    const { x, z } = deposit!.position;
    const kind = deposit!.userData.mineral;
    const id = deposit!.userData.depositId;
    expect(world.mineDeposit(deposit!, true)).toMatchObject({ progress: 1 });
    world.updateChunks(x - PLANET_WIDTH, z, true);
    const wrapped = world.findNearestDeposit(x - PLANET_WIDTH, z, 0.1);
    expect(wrapped?.userData).toMatchObject({ depositId: id, mineral: kind });
    expect(world.mineDeposit(wrapped!, true)).toMatchObject({ progress: 2 });
    world.dispose();
  });

  it('rebases long-distance chunks without losing edits or local resource positions', () => {
    const world = new World(1847);
    const x = PLANET_WIDTH * 2 + 30;
    world.updateChunks(x, 10, true);
    world.dig(x, 10);
    const height = world.heightAt(x, 10);
    const resource = world.group.children.find(item => item.userData.resource);
    expect(resource).toBeDefined();
    const resourceX = resource!.position.x;
    world.rebase(-PLANET_WIDTH * 2, 0);
    expect(world.loadedChunkCount).toBe(9);
    expect(resource!.position.x).toBeCloseTo(resourceX - PLANET_WIDTH * 2);
    expect(world.resourceLocation(resource!).x).toBeCloseTo(resourceX - PLANET_WIDTH * 2);
    expect(world.findNearest(resource!.position.x, resource!.position.z, 0.1)).toBe(resource);
    expect(world.heightAt(30, 10)).toBeCloseTo(height);
    world.updateChunks(30, 10, true);
    expect(world.loadedChunkCount).toBe(9);
    world.dispose();
  });

  it('keeps terrain edits and gathered nodes consistent across the longitude seam', () => {
    const world = new World(1847);
    world.updateChunks(1536, 180, true);
    world.dig(1540, 180);
    expect(world.heightAt(1540, 180)).toBeCloseTo(world.heightAt(1540 - PLANET_WIDTH, 180));
    const resource = world.group.children.find(item => item.userData.resource && item.position.x > 1536);
    expect(resource).toBeDefined();
    const { x, z } = resource!.position;
    expect(world.gatherNearest(x, z, 0.1)).toBeDefined();
    world.updateChunks(x - PLANET_WIDTH, z, true);
    expect(world.gatherNearest(x - PLANET_WIDTH, z, 0.1)).toBeUndefined();
    world.dispose();
  });

  it('fades trees between the camera and its focus and restores them afterwards', () => {
    const world = new World(1847);
    const tree = world.group.children.find(item => item.userData.resource === 'wood');
    expect(tree).toBeDefined();
    world.group.updateMatrixWorld(true);
    const origin = tree!.position.clone().add(new THREE.Vector3(0, 0.8, 5));
    const player = tree!.position.clone().add(new THREE.Vector3(0, 0, -5));
    world.updateTreeOcclusion(origin, player, 1 / 30);
    const trunk = tree!.children[0] as THREE.Mesh;
    expect((trunk.material as THREE.MeshStandardMaterial).opacity).toBeLessThan(1);
    for (let i = 0; i < 30; i++) {
      world.updateTreeOcclusion(origin, tree!.position.clone().add(new THREE.Vector3(0, 0, 4)), 1 / 30);
    }
    expect((trunk.material as THREE.MeshStandardMaterial).opacity).toBe(1);
    world.dispose();
  });
});
