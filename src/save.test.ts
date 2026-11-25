import { describe, expect, it } from 'vitest';
import { isSaveData } from './save';
import { defaultAppearance } from './appearance';
import { emptyMinerals } from './economy';
import { PLANET_WIDTH, planetPositionToGeographic } from './planet';

function oldSave() {
  return {
    version: 1, seed: 1847, outfit: 'ember',
    player: { x: 0, z: 5 }, npc: { x: -4, z: 2 }, vehicle: { x: 8, z: 4 },
    resources: { wood: 3, stone: 2, food: 3, water: 3 },
    buildings: [{ kind: 'storage', x: 4, z: 4, y: 1, rotation: 0 }],
    terrain: { '0,0': -0.35 }, calendar: { minute: 360, day: 1 },
  };
}

describe('saved worlds', () => {
  it('accepts legacy saves and current state', () => {
    expect(isSaveData(oldSave())).toBe(true);
    expect(isSaveData({ ...oldSave(), version: 2, depleted: ['0,3'], health: 80, tools: ['axe'], npcState: { recruited: true, job: 'wood', carrying: 'wood' } })).toBe(true);
    const identity = { appearance: defaultAppearance(), playerName: 'Survivor', npcAppearanceSeed: 53917 };
    expect(isSaveData({ ...oldSave(), ...identity, version: 3 })).toBe(true);
    expect(isSaveData({ ...oldSave(), ...identity, version: 4, wildlife: [] })).toBe(true);
    expect(isSaveData({ ...oldSave(), ...identity, version: 5, wildlife: [] })).toBe(true);
    expect(isSaveData({ ...oldSave(), ...identity, version: 6, wildlife: [], player: { x: 500, z: -200 } })).toBe(true);
  });
  it('rejects malformed, unsafe, and unsupported saves', () => {
    expect(isSaveData({ ...oldSave(), version: 8 })).toBe(false);
    expect(isSaveData({ ...oldSave(), version: 3 })).toBe(false);
    expect(isSaveData({ ...oldSave(), resources: { wood: -2 } })).toBe(false);
    expect(isSaveData({ ...oldSave(), buildings: [{ kind: 'invalid' }] })).toBe(false);
    expect(isSaveData({ ...oldSave(), depleted: [1] })).toBe(false);
  });
  it('validates version 7 structures and preserves legacy prefab buildings', () => {
    const frame = { id: 'frame', kind: 'doorframe', x: 24, z: 1, y: 2, level: 0, rotation: 0, open: false };
    const door = { ...frame, id: 'door', kind: 'door', open: true };
    const save = { ...oldSave(), version: 7, appearance: defaultAppearance(), playerName: 'Survivor',
      npcAppearanceSeed: 53917, wildlife: [], player: { x: 24, y: 2, z: 0 }, structures: [frame, door] };
    expect(isSaveData(save)).toBe(true);
    expect(isSaveData({ ...save, structures: [door] })).toBe(false);
    expect(isSaveData({ ...save, structures: [frame, frame] })).toBe(false);
    expect(isSaveData({ ...save, structures: [{ ...frame, x: 23 }] })).toBe(false);
    expect(isSaveData({ ...save, structures: [{ ...frame, y: NaN }] })).toBe(false);
  });
  it('validates version 8 mining state without changing legacy saves', () => {
    const save = { ...oldSave(), version: 8, appearance: defaultAppearance(), playerName: 'Survivor',
      npcAppearanceSeed: 53917, wildlife: [], player: { x: 0, y: 1, z: 5 }, structures: [],
      minerals: { ...emptyMinerals(), ironOre: 2 }, mining: { '6,6': 2 }, ingots: { iron: 0, copper: 0 }, ironPickaxe: false };
    expect(isSaveData(save)).toBe(true);
    expect(isSaveData({ ...save, minerals: { ...save.minerals, ironOre: -1 } })).toBe(false);
    expect(isSaveData({ ...save, minerals: { ...save.minerals, coal: 0.5 } })).toBe(false);
    expect(isSaveData({ ...save, mining: { '6,6': 4 } })).toBe(false);
    expect(isSaveData({ ...save, mining: { bad: 1 } })).toBe(false);
    expect(isSaveData({ ...save, mining: undefined })).toBe(false);
    expect(isSaveData({ ...save, ironPickaxe: true })).toBe(false);
    expect(isSaveData({ ...save, ironPickaxe: true, tools: ['pickaxe'] })).toBe(true);
    expect(isSaveData({ ...save, buildings: [{ kind: 'smelter', x: 4, z: 4, y: 1, rotation: 0,
      smelting: { ore: 'ironOre', remaining: 3 } }] })).toBe(true);
    expect(isSaveData({ ...save, buildings: [{ kind: 'smelter', x: 4, z: 4, y: 1, rotation: 0,
      smelting: { ore: 'ironOre', remaining: -1 } }] })).toBe(false);
  });
  it('validates version 9 glass, furnace jobs and window attachment without weakening version 8', () => {
    const frame = { id: 'frame', kind: 'windowframe', x: 0, z: 1, y: 2, level: 0, rotation: 0, open: false };
    const window = { ...frame, id: 'window', kind: 'window' };
    const save = { ...oldSave(), version: 9, appearance: defaultAppearance(), playerName: 'Survivor',
      npcAppearanceSeed: 53917, wildlife: [], player: { x: 0, y: 2, z: 0 }, structures: [frame, window],
      minerals: emptyMinerals(), mining: {}, ingots: { iron: 0, copper: 0, glass: 1 }, ironPickaxe: false };
    expect(isSaveData(save)).toBe(true);
    expect(isSaveData({ ...save, version: 8 })).toBe(false);
    expect(isSaveData({ ...save, structures: [window] })).toBe(false);
    expect(isSaveData({ ...save, structures: [frame, window, { ...window, id: 'duplicate' }] })).toBe(false);
    expect(isSaveData({ ...save, ingots: { iron: 0, copper: 0 } })).toBe(false);
    expect(isSaveData({ ...save, ingots: { iron: 0, copper: 0, glass: -1 } })).toBe(false);
    expect(isSaveData({ ...save, pendingRoofs: [{ y: 2, level: 0 }] })).toBe(true);
    expect(isSaveData({ ...save, pendingRoofs: [{ y: NaN, level: 0 }] })).toBe(false);
    expect(isSaveData({ ...save, pendingRoofs: [{ y: 2, level: 4 }] })).toBe(false);
    expect(isSaveData({ ...save, pendingRoofs: [{ y: 2, level: 0 }, { y: 2, level: 0 }] })).toBe(false);
    const roof = { id: 'roof', kind: 'roof', x: 0, z: 0, y: 2, level: 0, rotation: 0, open: false, automatic: true,
      roofShape: { style: 'gable', axis: 0, heights: [0, 0.9, 0] } };
    const withRoof = { ...save, structures: [frame, window, roof], roofStyle: 'gable', roofAxis: 'x',
      pendingRoofs: [{ y: 4.4, level: 1, style: 'single', axis: 'z' }] };
    expect(isSaveData(JSON.parse(JSON.stringify(withRoof)))).toBe(true);
    expect(isSaveData({ ...withRoof, roofStyle: 'hip' })).toBe(false);
    expect(isSaveData({ ...withRoof, pendingRoofs: [{ y: 4.4, level: 1, style: 'hip' }] })).toBe(false);
    expect(isSaveData({ ...withRoof, structures: [frame, window, { ...roof, automatic: false }] })).toBe(false);
    expect(isSaveData({ ...withRoof, structures: [frame, window, { ...roof, roofShape: { ...roof.roofShape, heights: [0, 99, 0] } }] })).toBe(false);
    const furnace = { kind: 'smelter', x: 4, z: 4, y: 1, rotation: 0, smelting: { ore: 'sand', remaining: 3 } };
    expect(isSaveData({ ...save, buildings: [furnace] })).toBe(true);
    expect(isSaveData({ ...save, version: 8, structures: [], buildings: [furnace] })).toBe(false);
  });
  it('validates version 10/11 roads, paint and atlas state', () => {
    const save = { ...oldSave(), version: 11, appearance: defaultAppearance(), playerName: 'Survivor',
      npcAppearanceSeed: 53917, wildlife: [], player: { x: 0, y: 2, z: 0 }, structures: [],
      minerals: emptyMinerals(), mining: {}, ingots: { iron: 0, copper: 0, glass: 0 }, ironPickaxe: false,
      roads: [{ id: 'road-0-0', kind: 'dirt', x: 0, z: 0, height: 1, rotation: 0, width: 2 }],
      paint: [{ pieceId: 'wall-1', surface: 'front', color: '#a94f43',
        strokes: [{ x: 0.5, y: 0.5, color: '#a94f43', size: 0.1 }] }],
      atlas: { explored: ['4/8/8'], markers: [], zoom: 4, centerLatitude: 0, centerLongitude: 0, level: 'world' } };
    expect(isSaveData(save)).toBe(true);
    expect(isSaveData({ ...save, atlas: { ...save.atlas, zoom: 99 } })).toBe(false);
    expect(isSaveData({ ...save, roads: [{ ...save.roads[0], kind: 'unknown' }] })).toBe(false);
    expect(isSaveData({ ...save, stones: 12, selectedWeapon: 'stones' })).toBe(true);
    expect(isSaveData({ ...save, stones: -1 })).toBe(false);
    expect(isSaveData({ ...save, player: { x: PLANET_WIDTH / 2 - 4, y: 1, z: 180 },
      npc: { x: -PLANET_WIDTH / 2 + 5, z: 180 }, vehicle: { x: 0, z: 0 },
      buildings: [{ kind: 'storage', x: -PLANET_WIDTH / 2 + 5, z: 180, y: 1, rotation: 0 }] })).toBe(true);
    expect(isSaveData({ ...save, player: { x: PLANET_WIDTH * 3, y: 1, z: 0 } })).toBe(false);
  });
  it('requires valid canonical player and vehicle positions in version 12 saves', () => {
    const save = { ...oldSave(), version: 12, appearance: defaultAppearance(), playerName: 'Survivor',
      npcAppearanceSeed: 53917, wildlife: [], player: { x: 0, y: 1, z: 5 }, structures: [],
      minerals: emptyMinerals(), mining: {}, ingots: { iron: 0, copper: 0, glass: 0 }, ironPickaxe: false,
      roads: [], paint: [], atlas: { explored: [], markers: [], zoom: 4, centerLatitude: 0,
        centerLongitude: 0, level: 'world' },
      planetPositions: {
        player: planetPositionToGeographic(0, 5),
        vehicle: planetPositionToGeographic(8, 4),
      } };
    expect(isSaveData(save)).toBe(true);
    expect(isSaveData({ ...save, planetPositions: undefined })).toBe(false);
    expect(isSaveData({ ...save, planetPositions: { ...save.planetPositions,
      player: { ...save.planetPositions.player, latitude: 91 } } })).toBe(false);
    expect(isSaveData({ ...save, planetPositions: { ...save.planetPositions,
      vehicle: { ...save.planetPositions.vehicle, longitude: 180 } } })).toBe(false);
    expect(isSaveData({ ...save, planetPositions: { ...save.planetPositions,
      player: planetPositionToGeographic(PLANET_WIDTH / 4, 5) } })).toBe(false);
    const withNpc = { ...save, planetPositions: { ...save.planetPositions,
      npc: planetPositionToGeographic(-4, 2) } };
    expect(isSaveData(withNpc)).toBe(true);
    expect(isSaveData({ ...withNpc, planetPositions: { ...withNpc.planetPositions,
      npc: planetPositionToGeographic(PLANET_WIDTH / 4, 2) } })).toBe(false);
  });
});
