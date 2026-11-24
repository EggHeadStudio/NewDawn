import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { biomeAt, safeSpawn, seededNoise, terrainHeight, World } from './world';
import { CHUNK_SIZE, PLANET_HEIGHT, PLANET_WIDTH, nearestPlanetPosition, planetCoordinates } from './planet';
import { requiresPickaxe, type DepositKind } from './economy';

describe('procedural world', () => {
  it('supports bounded terrain edits and undo', () => {
    const world = new World(1847, 1);
    const before = world.heightAt(0, 0);
    const changes = world.editTerrain(0, 0, 3, 'raise');
    expect(changes.length).toBeGreaterThan(0);
    expect(world.heightAt(0, 0)).toBeGreaterThan(before);
    world.undoTerrain(changes);
    expect(world.heightAt(0, 0)).toBeCloseTo(before, 4);
  });
  it('is deterministic for a given seed and coordinate', () => {
    expect(terrainHeight(12.5, -8, 1847)).toBe(terrainHeight(12.5, -8, 1847));
    expect(seededNoise(4, 7, 1847)).toBe(seededNoise(4, 7, 1847));
  });

  it('produces distinguishable playable biomes', () => {
    const biomes = new Set<string>();
    for (let z = -40; z <= 40; z += 4) {
      for (let x = -40; x <= 40; x += 4) biomes.add(biomeAt(x, z, 1847));
    }
    expect(biomes.size).toBeGreaterThanOrEqual(3);
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
    expect(planetCoordinates(10, PLANET_HEIGHT / 2 + 5)).toEqual({ x: -1526, z: PLANET_HEIGHT / 2 - 5, reflected: true });
    expect(terrainHeight(10, PLANET_HEIGHT / 2 + 5, 1847))
      .toBeCloseTo(terrainHeight(-1526, PLANET_HEIGHT / 2 - 5, 1847), 7);
    expect(terrainHeight(0, PLANET_HEIGHT / 2, 1847)).toBeCloseTo(terrainHeight(900, PLANET_HEIGHT / 2, 1847), 7);
    expect(nearestPlanetPosition(-1530, 0, 1530, 0)).toEqual({ x: 1542, z: 0 });
    expect(nearestPlanetPosition(-1526, 763, 10, 773)).toEqual({ x: 10, z: 773 });
  });

  it('shares exact terrain vertices across adjacent chunk boundaries', () => {
    const world = new World(1847);
    const terrain = (key: string) => world.group.children.find(item => item.userData.chunk === key) as THREE.Mesh;
    const edge = (mesh: THREE.Mesh, x: number) => {
      const positions = mesh.geometry.attributes.position;
      const values = new Map<number, number>();
      for (let i = 0; i < positions.count; i++) {
        if (positions.getX(i) === x) values.set(positions.getZ(i), positions.getY(i));
      }
      return values;
    };
    expect(edge(terrain('0,0'), CHUNK_SIZE)).toEqual(edge(terrain('1,0'), CHUNK_SIZE));
    world.dig(CHUNK_SIZE, 8);
    expect(edge(terrain('0,0'), CHUNK_SIZE)).toEqual(edge(terrain('1,0'), CHUNK_SIZE));
    world.dispose();
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
    world.updateChunks(-1536, 180, true);
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
    world.updateChunks(-1536, 180, true);
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
    world.updateTreeOcclusion(origin, player);
    const trunk = tree!.children[0] as THREE.Mesh;
    expect((trunk.material as THREE.MeshStandardMaterial).opacity).toBeLessThan(1);
    world.updateTreeOcclusion(origin, tree!.position.clone().add(new THREE.Vector3(0, 0, 4)));
    expect((trunk.material as THREE.MeshStandardMaterial).opacity).toBe(1);
    world.dispose();
  });
});
