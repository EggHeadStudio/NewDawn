// Node is available to Vitest, but this project does not install its type declarations.
// @ts-ignore
import { readFileSync } from 'node:fs';
// @ts-ignore
import { createContext, Script } from 'node:vm';
import * as THREE from 'three';
import * as ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { defaultAppearance } from './appearance';
import { dampAngle } from './camera';
import { floorSurface, pieceBlocks } from './construction';
import { emptyMinerals } from './economy';
import { buildingRadius } from './gameplay';
import { geographicBearing, geographicDistanceMeters } from './geography';
import { chooseNpcActivity } from './npc';
import {
  geographicToPlanetPosition, nearestPlanetPosition, planetDistanceMeters, planetOffset,
  planetPositionToGeographic,
} from './planet';
import { PlanetaryRuntimeFrame } from './runtime-frame';
import { isSaveData, toolsFromSave, type SaveData } from './save';
import { treeYield } from './tree-harvest';
import { World } from './world';

// Exercise the actual, non-exported runtime functions without importing main.ts,
// which creates the browser renderer. Only browser IO, rendering and UI are stubbed.
const mainSource = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
const mainFile = ts.createSourceFile('main.ts', mainSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const runtimeNames = ['worldDistance', 'projectGeographicPosition', 'roverSurfaceAt', 'nearestGatherTarget', 'gather', 'updateNpc', 'saveGame', 'loadGame'];
const runtimeSource = runtimeNames.map(name => {
  const declaration = mainFile.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === name);
  if (!declaration) throw new Error(`Missing production function ${name}`);
  return declaration.getText(mainFile);
}).join('\n');
const runtimeScript = new Script(ts.transpileModule(runtimeSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText);

function expectedYield(tree: THREE.Object3D) {
  const height = tree.userData.natureMature ? (tree.userData.vegetationFamily === 'conifer' ? 9 : 7)
    : tree.userData.natureYoung ? 5.4 : tree.userData.treeSpecies === 'pine' ? 5 : 4;
  return treeYield(height, tree.scale.x);
}

function selectTree(world: World, requiredRemainder?: 1 | 2) {
  const tree = world.group.children.find(object => {
    if (object.userData.resource !== 'wood') return false;
    const total = expectedYield(object);
    if (total < 7 || total % 3 === 0 || (requiredRemainder && total % 3 !== requiredRemainder)) return false;
    const location = world.resourceLocation(object);
    const player = { x: location.x - 0.7, z: location.z };
    const mira = { x: location.x + 0.7, z: location.z };
    return world.findNearest(player.x, player.z, 3.2) === object
      && world.findNearest(mira.x, mira.z, 40, 'wood') === object
      && !world.findNearestDeposit(player.x, player.z, 1);
  });
  if (!tree) throw new Error('No suitable deterministic tree in fixture');
  return tree;
}

function fixture(requiredRemainder?: 1 | 2) {
  const world = new World(1847, 1);
  const tree = selectTree(world, requiredRemainder);
  const location = { ...world.resourceLocation(tree) };
  const records = new Map<string, SaveData>();
  const primaryWrites: SaveData[] = [];
  const errors: string[] = [];
  const toastMessages: string[] = [];
  let releaseOpen: (() => void) | undefined;
  let openGate: Promise<void> | undefined;

  // An in-memory IndexedDB-shaped transaction; saves are committed asynchronously
  // and a delayed open can hold the production save queue.
  async function openDatabase() {
    if (openGate) await openGate;
    return {
      transaction() {
        let pending = 0;
        const tx: any = {
          oncomplete: undefined,
          onerror: undefined,
          onabort: undefined,
          objectStore() {
            return {
              put(value: SaveData, key: string) {
                const copy = structuredClone(value);
                schedule(() => {
                  records.set(key, copy);
                  if (key === 'primary') primaryWrites.push(copy);
                });
              },
              get(key: string) {
                const request: any = { result: undefined, onsuccess: undefined };
                schedule(() => {
                  request.result = records.get(key);
                  request.onsuccess?.();
                });
                return request;
              },
            };
          },
        };
        function schedule(action: () => void) {
          pending++;
          queueMicrotask(() => {
            action();
            pending--;
            queueMicrotask(() => { if (pending === 0) tx.oncomplete?.(); });
          });
        }
        return tx;
      },
      close() {},
    };
  }

  const player = new THREE.Group();
  const npc = new THREE.Group();
  const vehicle = new THREE.Group();
  const storage = new THREE.Group();
  player.position.set(location.x - 0.7, world.heightAt(location.x - 0.7, location.z), location.z);
  npc.position.set(location.x + 0.7, world.heightAt(location.x + 0.7, location.z), location.z);
  vehicle.position.set(location.x + 30, world.heightAt(location.x + 30, location.z), location.z);
  storage.position.set(location.x + 8, world.heightAt(location.x + 8, location.z), location.z);
  storage.userData.building = 'storage';
  const geo = (object: THREE.Object3D) =>
    planetPositionToGeographic(object.position.x, object.position.z, object.position.y);
  const ctx: any = createContext({
    THREE, structuredClone, Promise, Math, world, player, npc, vehicle,
    playerGeographic: geo(player), npcGeographic: geo(npc), vehicleGeographic: geo(vehicle),
    runtimeFrame: new PlanetaryRuntimeFrame(player.position),
    seed: 1847, outfit: 'ember', appearance: defaultAppearance(), characterName: 'Survivor',
    npcAppearanceSeed: 55764, wildlife: [], enemies: [],
    resources: { wood: 0, stone: 0, food: 3, water: 3 },
    mineralInventory: emptyMinerals(), ingots: { iron: 0, copper: 0, glass: 0 },
    ironPickaxe: false, tools: [], torch: { crafted: false, equipped: false, lit: false },
    buildings: [storage],
    buildingRecords: [{ kind: 'storage', x: storage.position.x, z: storage.position.z, y: storage.position.y, rotation: 0 }],
    structures: [], roads: [], surfacePaint: [], pendingRoofs: new Map(),
    autoRoof: true, roofStyle: 'flat', roofAxis: 'auto',
    atlasState: { explored: [], markers: [], zoom: 1, centerLatitude: 0, centerLongitude: 0, level: 'world' },
    npcState: { recruited: true, job: 'wood', carrying: null, carryingAmount: undefined },
    health: 100, stones: 0, selectedWeapon: 'saw', backpackEquipped: true,
    onboarding: { mode: 'free', gathered: false, openedPack: false },
    gameStarted: true, driving: false, buildMode: false, attackCooldown: 0,
    structureCollisionDirty: false, roverSteeringYaw: 0,
    animationAction: 'chop', animationActionTime: 0, gameMinutes: 360, day: 1, gameSpeed: 2.2,
    saveQueue: Promise.resolve(), openDatabase,
    readSaveRecord: async (key: string) => records.get(key),
    isSaveData, toolsFromSave, defaultAppearance, emptyMinerals, buildingRadius, floorSurface, pieceBlocks,
    geographicBearing, geographicDistanceMeters, geographicToPlanetPosition, nearestPlanetPosition,
    planetDistanceMeters, planetOffset, planetPositionToGeographic, chooseNpcActivity, dampAngle,
    gameplayBlocked: () => false,
    effects: { burst() {} },
    setAuthoredBackpackVisible: (character: THREE.Group, visible: boolean) => {
      character.userData.backpackVisible = visible;
    },
    animateCharacter() {}, disposeCharacter() {}, updateResources() {}, updateObjective() {},
    refreshRoads() {}, refreshPaintMarkers() {}, updatePowerLines() {}, rebaseWorld() {}, updateRoverVisual() {},
    constructionRenderer: { refresh() {} },
    scene: { add() {} },
    document: { querySelector: () => ({ value: '', checked: false }) },
    toast: (message: string) => toastMessages.push(message),
    console: { error: (...args: unknown[]) => errors.push(args.map(String).join(' ')) },
  });
  ctx.createBuilding = (kind: string) => {
    const building = new THREE.Group();
    building.userData.building = kind;
    return building;
  };
  ctx.resetWildlife = (animals: unknown[]) => { ctx.wildlife = animals; };
  ctx.resetWorld = () => {
    ctx.world.dispose();
    ctx.world = new World(ctx.seed, 1);
    ctx.player = new THREE.Group();
    ctx.npc = new THREE.Group();
    ctx.vehicle = new THREE.Group();
    ctx.buildings.length = 0;
    ctx.buildingRecords.length = 0;
    ctx.structures.length = 0;
    ctx.roads.length = 0;
    ctx.surfacePaint.length = 0;
    ctx.pendingRoofs.clear();
    ctx.tools.length = 0;
    ctx.backpackEquipped = true;
    Object.assign(ctx.resources, { wood: 0, stone: 0, food: 3, water: 3 });
    Object.assign(ctx.npcState, { recruited: false, job: 'idle', carrying: null, carryingAmount: undefined });
    ctx.gameStarted = false;
  };
  ctx.startGame = () => {
    ctx.gameStarted = true;
    ctx.runtimeFrame = new PlanetaryRuntimeFrame(ctx.player.position);
  };
  runtimeScript.runInContext(ctx);

  return {
    ctx, tree, location, records, primaryWrites, errors, toastMessages,
    holdSaves() { openGate = new Promise<void>(resolve => { releaseOpen = resolve; }); },
    releaseSaves() { releaseOpen?.(); openGate = undefined; },
    dispose() { ctx.world.dispose(); },
  };
}

function playerWork(ctx: any) {
  // Represents waiting for the real 0.75-second input cooldown, without running a renderer.
  ctx.attackCooldown = 0;
  ctx.gather();
}

function movePlayer(ctx: any, x: number, z: number) {
  ctx.player.position.set(x, ctx.world.heightAt(x, z), z);
  ctx.playerGeographic = planetPositionToGeographic(x, z, ctx.player.position.y);
  ctx.runtimeFrame = new PlanetaryRuntimeFrame(ctx.player.position);
  ctx.world.updateChunks(x, z, true);
}

function deliver(ctx: any) {
  for (let i = 0; i < 500 && ctx.npcState.carrying; i++) ctx.updateNpc(1 / 30);
  expect(ctx.npcState.carrying).toBeNull();
}

describe('Mira timber conservation audit', () => {
  it('interleaves Mira and the player, streams a partial tree, and reloads while carrying', async () => {
    const f = fixture();
    const { ctx, location, tree } = f;
    const id = tree.userData.resourceId as string;
    try {
      f.holdSaves();
      ctx.updateNpc(1 / 30);
      expect(ctx.world.treeHarvestState(tree)).toEqual({ phase: 'standing', progress: 1 });
      const miraPosition = ctx.npc.position.clone();
      movePlayer(ctx, location.x + 150, location.z + 150);
      expect(ctx.world.workTree(tree, true, location)).toBeUndefined();
      ctx.updateNpc(0.8);
      expect(ctx.world.treeHarvestSnapshot()[id]).toEqual({ phase: 'standing', progress: 1 });
      expect(ctx.npc.position.x).toBeCloseTo(miraPosition.x);
      expect(ctx.npc.position.z).toBeCloseTo(miraPosition.z);
      expect(ctx.npcState.carrying).toBeNull();
      ctx.npcState.job = 'idle';
      movePlayer(ctx, location.x - 0.7, location.z);
      let restoredTree = ctx.world.group.children.find((object: THREE.Object3D) => object.userData.resourceId === id);
      expect(restoredTree).toBeDefined();
      expect(ctx.world.treeHarvestState(restoredTree)).toEqual({ phase: 'standing', progress: 1 });

      playerWork(ctx);
      playerWork(ctx);
      const fallen = ctx.world.treeHarvestState(restoredTree);
      expect(fallen.phase).toBe('fallen');
      const total = fallen.total as number;
      expect(total).toBe(expectedYield(restoredTree));
      ctx.world.animate(0, 0, 1.6);
      playerWork(ctx);
      expect(ctx.world.treeHarvestState(restoredTree)).toMatchObject({ phase: 'fallen', progress: 1, total });
      movePlayer(ctx, location.x + 150, location.z + 150);
      movePlayer(ctx, location.x - 0.7, location.z);
      restoredTree = ctx.world.group.children.find((object: THREE.Object3D) => object.userData.resourceId === id);
      expect(ctx.world.treeHarvestState(restoredTree)).toMatchObject({ phase: 'fallen', progress: 1, total });
      playerWork(ctx);
      const remainder = total % 3;
      while (ctx.world.treeHarvestState(restoredTree).remaining > remainder + 3) playerWork(ctx);
      expect(ctx.resources.wood + ctx.world.treeHarvestState(restoredTree).remaining).toBe(total);

      ctx.npcState.job = 'wood';
      ctx.updateNpc(0.8);
      expect(ctx.npcState).toMatchObject({ carrying: 'wood', carryingAmount: 3 });
      expect(ctx.world.treeHarvestState(restoredTree)).toMatchObject({ phase: 'logs', remaining: remainder });
      expect(ctx.resources.wood + ctx.npcState.carryingAmount + remainder).toBe(total);

      movePlayer(ctx, location.x + 150, location.z + 150);
      ctx.backpackEquipped = false;
      const saving = ctx.saveGame(false);
      await Promise.resolve();
      expect(f.primaryWrites).toHaveLength(0);
      f.releaseSaves();
      expect(await saving).toBe(true);
      const saved = f.records.get('primary')!;
      expect(isSaveData(saved)).toBe(true);
      expect(saved.backpackEquipped).toBe(false);
      expect(saved.npcState).toMatchObject({ carrying: 'wood', carryingAmount: 3 });
      expect(saved.treeHarvest?.[id]).toMatchObject({ phase: 'logs', total, remaining: remainder });
      expect(f.primaryWrites[0].treeHarvest?.[id]).toEqual({ phase: 'standing', progress: 1 });
      for (const snapshot of f.primaryWrites) {
        expect(isSaveData(snapshot)).toBe(true);
        const state = snapshot.treeHarvest?.[id];
        if (state?.phase !== 'logs') continue;
        const carried = snapshot.npcState?.carrying === 'wood' ? snapshot.npcState.carryingAmount ?? 0 : 0;
        expect(snapshot.resources.wood + carried + state.remaining).toBe(total);
      }
      expect(await ctx.loadGame()).toBe(true);
      expect(ctx.backpackEquipped).toBe(false);
      expect(ctx.player.userData.backpackVisible).toBe(false);
      expect(ctx.npcState).toMatchObject({ carrying: 'wood', carryingAmount: 3 });
      expect(ctx.world.treeHarvestSnapshot()[id]).toMatchObject({ phase: 'logs', remaining: remainder });

      movePlayer(ctx, location.x - 0.7, location.z);
      playerWork(ctx);
      expect(ctx.world.depletedSnapshot()).toContain(id);
      expect(ctx.resources.wood + ctx.npcState.carryingAmount).toBe(total);
      deliver(ctx);
      expect(ctx.resources.wood).toBe(total);
      await ctx.saveQueue;
      expect(isSaveData(f.records.get('primary'))).toBe(true);
      expect(await ctx.loadGame()).toBe(true);
      expect(ctx.resources.wood).toBe(total);
      expect(ctx.npcState.carrying).toBeNull();
      movePlayer(ctx, location.x - 0.7, location.z);
      expect(ctx.world.group.children.some((object: THREE.Object3D) => object.userData.resourceId === id)).toBe(false);
      expect(f.errors).toEqual([]);
    } finally {
      f.releaseSaves();
      f.dispose();
    }
  });

  it.each([1, 2] as const)('delivers the exact final %i-unit bundle after reloading', async expectedRemainder => {
    const f = fixture(expectedRemainder);
    const { ctx, location, tree } = f;
    const id = tree.userData.resourceId as string;
    try {
      ctx.npcState.job = 'idle';
      for (let i = 0; i < 3; i++) playerWork(ctx);
      const total = ctx.world.treeHarvestState(tree).total as number;
      ctx.world.animate(0, 0, 1.6);
      playerWork(ctx);
      playerWork(ctx);
      while (ctx.world.treeHarvestState(tree).remaining > 3) playerWork(ctx);
      const remaining = ctx.world.treeHarvestState(tree).remaining as number;
      expect(remaining).toBe(total % 3);
      expect(remaining).toBe(expectedRemainder);

      ctx.npcState.job = 'wood';
      ctx.updateNpc(1 / 30);
      expect(ctx.npcState).toMatchObject({ carrying: 'wood', carryingAmount: remaining });
      expect(ctx.world.depletedSnapshot()).toContain(id);
      expect(ctx.resources.wood + remaining).toBe(total);
      expect(await ctx.saveGame(false)).toBe(true);
      expect(await ctx.loadGame()).toBe(true);
      expect(ctx.npcState).toMatchObject({ carrying: 'wood', carryingAmount: remaining });
      deliver(ctx);
      expect(ctx.resources.wood).toBe(total);
      expect(await ctx.saveGame(false)).toBe(true);
      expect(await ctx.loadGame()).toBe(true);
      expect(ctx.resources.wood).toBe(total);
      expect(ctx.npcState.carrying).toBeNull();
      movePlayer(ctx, location.x + 150, location.z);
      movePlayer(ctx, location.x - 0.7, location.z);
      expect(ctx.world.group.children.some((object: THREE.Object3D) => object.userData.resourceId === id)).toBe(false);
      expect(f.errors).toEqual([]);
    } finally {
      f.dispose();
    }
  });

  it('migrates a legacy carried bundle without restoring its depleted tree', async () => {
    const f = fixture();
    const { ctx, location, tree } = f;
    const id = tree.userData.resourceId as string;
    try {
      // The old gather path removed the whole tree and assigned a fixed three-unit load.
      expect(ctx.world.gatherNearest(location.x, location.z, 0.1, 'wood')).toMatchObject({ resource: 'wood' });
      ctx.npcState.carrying = 'wood';
      ctx.npcState.carryingAmount = 3;
      ctx.resources.wood = 2;
      expect(await ctx.saveGame(false)).toBe(true);
      const legacy: any = structuredClone(f.records.get('primary'));
      legacy.version = 12;
      legacy.selectedWeapon = 'fists';
      delete legacy.treeHarvest;
      delete legacy.npcState.carryingAmount;
      delete legacy.backpackEquipped;
      delete legacy.axeRequiresCrafting;
      expect(isSaveData(legacy)).toBe(true);
      f.records.set('primary', legacy);

      expect(await ctx.loadGame()).toBe(true);
      expect(ctx.backpackEquipped).toBe(true);
      expect(ctx.player.userData.backpackVisible).toBe(true);
      expect(f.records.get('pre-timber-backup')).toEqual(legacy);
      expect(f.records.get('pre-equipment-backup')).toEqual(legacy);
      expect(ctx.npcState).toMatchObject({ carrying: 'wood', carryingAmount: 3 });
      expect(ctx.world.depletedSnapshot()).toContain(id);
      deliver(ctx);
      expect(ctx.resources.wood).toBe(5);
      expect(await ctx.saveGame(false)).toBe(true);
      const migrated = f.records.get('primary')!;
      expect(migrated.version).toBe(13);
      expect(isSaveData(migrated)).toBe(true);
      expect(await ctx.loadGame()).toBe(true);
      expect(ctx.resources.wood).toBe(5);
      expect(ctx.npcState.carrying).toBeNull();
      expect(ctx.world.depletedSnapshot()).toContain(id);
      expect(f.errors).toEqual([]);
    } finally {
      f.dispose();
    }
  });

  it('does not overwrite a valid save when the current harvest state is invalid', async () => {
    const f = fixture();
    const { ctx, tree, location } = f;
    const id = tree.userData.resourceId as string;
    try {
      expect(await ctx.saveGame(false)).toBe(true);
      const previous = structuredClone(f.records.get('primary'));
      expect(ctx.world.workTree(tree, true, location)).toMatchObject({ kind: 'felling' });
      ctx.world.restoreDepleted([id]);
      expect(await ctx.saveGame(false)).toBe(false);
      expect(f.records.get('primary')).toEqual(previous);
      expect(f.errors).toContainEqual(expect.stringContaining('Invalid world state'));
      expect(f.toastMessages).toContain('Could not save world. Check browser storage and console.');
      expect(await ctx.loadGame()).toBe(true);
    } finally {
      f.dispose();
    }
  });

  it('retains accessible timber and a valid save when edited terrain streams out and back', async () => {
    const f = fixture();
    const { ctx } = f;
    try {
      ctx.npcState.job = 'idle';
      movePlayer(ctx, -999_996, 4_500_000);
      const tree = ctx.world.group.children.find((object: THREE.Object3D) =>
        object.userData.resourceId === '-999996,4500000');
      expect(tree).toBeDefined();
      expect(tree!.userData.resource).toBe('wood');
      expect(tree!.userData.legacy).toBe(false);
      const id = tree!.userData.resourceId as string;
      const location = { ...ctx.world.resourceLocation(tree!) };
      ctx.npc.position.set(location.x, ctx.world.heightAt(location.x, location.z), location.z);
      ctx.npcGeographic = planetPositionToGeographic(location.x, location.z, ctx.npc.position.y);
      ctx.npcState.job = 'wood';
      ctx.updateNpc(1 / 30);
      expect(ctx.world.treeHarvestState(tree)).toEqual({ phase: 'standing', progress: 1 });
      ctx.updateNpc(0.75);
      ctx.updateNpc(0.75);
      const total = ctx.world.treeHarvestState(tree).total as number;
      ctx.world.animate(0, 0, 1.6);
      ctx.updateNpc(0.75);
      ctx.updateNpc(0.75);
      ctx.updateNpc(0.75);
      const remainder = ctx.world.treeHarvestState(tree).remaining as number;
      expect(ctx.npcState).toMatchObject({ carrying: 'wood', carryingAmount: 3 });
      expect(remainder).toBe(total - 3);
      expect(remainder).toBeGreaterThan(0);
      ctx.npcState.job = 'idle';
      for (let i = 0; i < 10 && ctx.world.heightAt(location.x, location.z) > 0.35; i++) {
        ctx.world.editTerrain(location.x, location.z, 3, 'lower');
      }
      const height = ctx.world.heightAt(location.x, location.z);
      expect(height).toBeGreaterThan(0.1);
      expect(height).toBeLessThanOrEqual(0.35);
      movePlayer(ctx, location.x + 150, location.z + 150);
      movePlayer(ctx, location.x, location.z);
      const replacement = ctx.world.group.children.find((object: THREE.Object3D) => object.userData.resourceId === id);
      expect(await ctx.saveGame(false)).toBe(true);
      expect(isSaveData(f.records.get('primary'))).toBe(true);
      playerWork(ctx);
      expect(await ctx.saveGame(false)).toBe(true);
      const saved = f.records.get('primary')!;
      const valid = isSaveData(saved);
      const loaded = await ctx.loadGame();
      expect({
        regenerated: replacement?.userData.resource,
        playerWood: saved.resources.wood,
        playerStone: saved.resources.stone,
        carried: saved.npcState?.carryingAmount,
        remaining: saved.treeHarvest?.[id]?.phase === 'logs' ? saved.treeHarvest[id].remaining : 0,
        depleted: saved.depleted?.includes(id),
        valid,
        loaded,
      }).toEqual({
        regenerated: 'wood',
        playerWood: Math.min(3, remainder),
        playerStone: 0,
        carried: 3,
        remaining: Math.max(0, remainder - 3),
        depleted: remainder <= 3,
        valid: true,
        loaded: true,
      });
    } finally {
      f.dispose();
    }
  });
});
