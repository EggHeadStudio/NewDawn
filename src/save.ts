import { buildingCosts, type BuildingKind, type Inventory, type Tool } from './gameplay';
import type { Outfit } from './assets';
import type { NpcState } from './npc';
import { safeSpawn } from './world';
import { isAppearance, type CharacterAppearance } from './appearance';
import { isWildlifeState, type AnimalState } from './wildlife';
import { FLOOR_HEIGHT, isStructuralPiece, type RoofStyle, type StructuralPiece } from './construction';
import { isMineralInventory, type MineralInventory } from './economy';
import { isIngots, isSmeltingJob, type SavedIngots, type SmeltingJob } from './smelting';
import type { RoofAxis, RoofRequest } from './roof';
import { isTorchState, type TorchState } from './fire';
import { isSurfacePaint, type SurfacePaint } from './paint';
import type { RoadSegment } from './roads';
import { geographicDistanceMeters, isAtlasState, type AtlasState, type GeographicPosition } from './geography';
import { PLANET_WIDTH, planetPositionToGeographic } from './planet';

export interface SaveData {
  version: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  seed: number;
  outfit: Outfit;
  appearance?: CharacterAppearance;
  playerName?: string;
  npcAppearanceSeed?: number;
  wildlife?: AnimalState[];
  player: { x: number; z: number; y?: number };
  npc: { x: number; z: number };
  resources: Inventory;
  buildings: Array<{ kind: BuildingKind; x: number; z: number; y: number; rotation: number; charge?: number; smelting?: SmeltingJob; id?: string; lit?: boolean }>;
  torch?: TorchState;
  structures?: StructuralPiece[];
  autoRoof?: boolean;
  pendingRoofs?: RoofRequest[];
  roofStyle?: RoofStyle;
  roofAxis?: RoofAxis;
  terrain: Record<string, number>;
  roads?: RoadSegment[];
  paint?: SurfacePaint[];
  atlas?: AtlasState;
  stones?: number;
  selectedWeapon?: 'fists' | 'stick' | 'axe' | 'stones';
  depleted?: string[];
  minerals?: MineralInventory;
  mining?: Record<string, number>;
  ingots?: SavedIngots;
  ironPickaxe?: boolean;
  npcState?: NpcState;
  health?: number;
  tools?: Tool[];
  calendar: { minute: number; day: number; speed?: number };
  vehicle: { x: number; z: number };
  planetPositions?: { player: GeographicPosition; vehicle: GeographicPosition; npc?: GeographicPosition };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function isPosition(value: unknown, limit: number): value is Record<string, unknown> & { x: number; z: number } {
  return isObject(value) && isNumber(value.x) && isNumber(value.z)
    && Math.abs(value.x) <= limit && Math.abs(value.z) <= limit;
}

function isGeographicPosition(value: unknown): value is GeographicPosition {
  return isObject(value) && value.planetId === 'new-dawn-earth'
    && isNumber(value.latitude) && value.latitude >= -90 && value.latitude <= 90
    && isNumber(value.longitude) && value.longitude >= -180 && value.longitude < 180
    && isNumber(value.altitude) && Math.abs(value.altitude) <= 10000
    && typeof value.regionId === 'string' && value.regionId.length > 0 && value.regionId.length <= 64;
}

function matchesProjectedPosition(value: GeographicPosition, position: unknown) {
  if (!isPosition(position, PLANET_WIDTH * 2)) return false;
  return geographicDistanceMeters(value, planetPositionToGeographic(position.x, position.z)) < 1;
}

export function isSaveData(value: unknown): value is SaveData {
  if (!isObject(value) || (value.version !== 1 && value.version !== 2 && value.version !== 3 && value.version !== 4 && value.version !== 5 && value.version !== 6 && value.version !== 7 && value.version !== 8 && value.version !== 9 && value.version !== 10 && value.version !== 11 && value.version !== 12)
    || !isNumber(value.seed) || !safeSpawn(value.seed) || !['ember', 'sage', 'azure'].includes(String(value.outfit))
    || !isPosition(value.player, value.version >= 6 ? PLANET_WIDTH * 2 : 48)
    || !isPosition(value.npc, value.version >= 6 ? PLANET_WIDTH * 2 : 48)
    || !isPosition(value.vehicle, value.version >= 6 ? PLANET_WIDTH * 2 : 48)
    || !isObject(value.resources) || !isObject(value.terrain) || !isObject(value.calendar)
    || !Array.isArray(value.buildings)) return false;
  if (value.planetPositions !== undefined) {
    const positions = value.planetPositions;
    if (!isObject(positions) || !isGeographicPosition(positions.player) || !isGeographicPosition(positions.vehicle)
      || (positions.npc !== undefined && (!isGeographicPosition(positions.npc)
        || (value.version >= 12 && !matchesProjectedPosition(positions.npc as GeographicPosition, value.npc))))
      || (value.version >= 12 && (!matchesProjectedPosition(positions.player, value.player)
        || !matchesProjectedPosition(positions.vehicle, value.vehicle)))) return false;
  } else if (value.version >= 12) return false;
  if (!['wood', 'stone', 'food', 'water'].every(k => isNumber(value.resources && (value.resources as Record<string, unknown>)[k]) && ((value.resources as Record<string, number>)[k] >= 0))) return false;
  if (!isNumber(value.calendar.minute) || value.calendar.minute < 0 || value.calendar.minute >= 1440
    || !isNumber(value.calendar.day) || value.calendar.day < 1
    || (value.calendar.speed !== undefined && (!isNumber(value.calendar.speed) || value.calendar.speed < 0.5 || value.calendar.speed > 8))) return false;
  if (!Object.entries(value.terrain).every(([key, n]) => /^-?\d+,-?\d+$/.test(key) && isNumber(n) && n >= -1.8 && n <= 0)) return false;
  const coordinateLimit = value.version >= 6 ? PLANET_WIDTH * 2 : 48;
  const version = value.version;
  if (!value.buildings.every(b => isObject(b) && typeof b.kind === 'string'
    && Object.hasOwn(buildingCosts, b.kind) && isPosition(b, coordinateLimit) && isNumber(b.y) && isNumber(b.rotation)
    && (b.charge === undefined || (isNumber(b.charge) && b.charge >= 0 && b.charge <= 20))
    && (version >= 8 || b.kind !== 'smelter')
    && (b.kind !== 'torchpost' || (version >= 9 && typeof b.id === 'string' && b.id.length > 0 && b.id.length <= 128 && typeof b.lit === 'boolean'))
    && (b.smelting === undefined || (version >= 8 && b.kind === 'smelter' && isSmeltingJob(b.smelting)
      && (version >= 9 || b.smelting.ore !== 'sand'))))) return false;
  const postIds = value.buildings.filter(b => isObject(b) && b.kind === 'torchpost').map(b => (b as Record<string, unknown>).id);
  if (new Set(postIds).size !== postIds.length) return false;
  if (value.torch !== undefined && (value.version < 9 || !isTorchState(value.torch))) return false;
  if (value.version >= 7) {
    if (!isObject(value.player) || !isNumber(value.player.y) || Math.abs(value.player.y) > 10000
      || !Array.isArray(value.structures) || value.structures.length > 10000
      || !value.structures.every(isStructuralPiece) || (value.autoRoof !== undefined && typeof value.autoRoof !== 'boolean')) return false;
    const ids = new Set<string>();
    const slots = new Set<string>();
    const frames = new Set<string>();
    const windowFrames = new Set<string>();
    const horizontalSurfaces = new Set<string>();
    const doors: string[] = [];
    const windows: string[] = [];
    for (const piece of value.structures as StructuralPiece[]) {
      if (value.version < 9 && (piece.kind === 'windowframe' || piece.kind === 'window')) return false;
      if (value.version < 9 && piece.roofShape !== undefined) return false;
      if (ids.has(piece.id)) return false;
      ids.add(piece.id);
      const location = `${piece.x},${piece.z},${piece.y.toFixed(4)},${piece.rotation}`;
      const category = piece.kind === 'wall' || piece.kind === 'doorframe' || piece.kind === 'windowframe' ? 'edge' : piece.kind;
      const slot = `${piece.x},${piece.z},${piece.y.toFixed(4)},${category},${category === 'edge' || category === 'door' || category === 'window' ? piece.rotation : 0}`;
      if (slots.has(slot)) return false;
      slots.add(slot);
      if (piece.kind === 'doorframe') frames.add(location);
      if (piece.kind === 'windowframe') windowFrames.add(location);
      if (piece.kind === 'door') doors.push(location);
      if (piece.kind === 'window') windows.push(location);
      if (piece.kind === 'floor' || piece.kind === 'roof') {
        const height = piece.kind === 'roof' ? piece.y + FLOOR_HEIGHT : piece.y;
        const surface = `${piece.x},${piece.z},${height.toFixed(4)}`;
        if (horizontalSurfaces.has(surface)) return false;
        horizontalSurfaces.add(surface);
      }
    }
    if (doors.some(location => !frames.has(location)) || windows.some(location => !windowFrames.has(location))) return false;
  } else if (value.structures !== undefined) return false;
  if (value.pendingRoofs !== undefined) {
    if (value.version < 9 || !Array.isArray(value.pendingRoofs) || value.pendingRoofs.length > 10000
      || !value.pendingRoofs.every(request => isObject(request) && isNumber(request.y) && Math.abs(request.y) <= 10000
        && isNumber(request.level) && Number.isInteger(request.level) && request.level >= 0 && request.level <= 3
        && (request.style === undefined || ['flat', 'gable', 'single'].includes(String(request.style)))
        && (request.axis === undefined || ['auto', 'x', 'z'].includes(String(request.axis))))) return false;
    const keys = value.pendingRoofs.map(request => `${request.level}:${request.y.toFixed(4)}`);
    if (new Set(keys).size !== keys.length) return false;
  }
  if ((value.roofStyle !== undefined && (value.version < 9 || !['flat', 'gable', 'single'].includes(String(value.roofStyle))))
    || (value.roofAxis !== undefined && (value.version < 9 || !['auto', 'x', 'z'].includes(String(value.roofAxis))))) return false;
  if (value.roads !== undefined) {
    if (value.version >= 10 && (!Array.isArray(value.roads) || value.roads.length > 10000)) return false;
    if (value.version >= 10) {
    const ids = new Set<string>();
    for (const road of value.roads as unknown[]) {
      if (!isObject(road) || typeof road.id !== 'string' || road.id.length > 128 || ids.has(String(road.id))
        || !['dirt', 'gravel', 'stone'].includes(String(road.kind))
        || !isNumber(road.x) || !isNumber(road.z) || !isNumber(road.height) || !isNumber(road.rotation)
        || !isNumber(road.width) || road.width < 1 || road.width > 4) return false;
      ids.add(String(road.id));
    }
    }
  }
  if (value.paint !== undefined) {
    if (value.version >= 10 && (!Array.isArray(value.paint) || value.paint.length > 10000
      || !value.paint.every(isSurfacePaint))) return false;
  }
  if (value.atlas !== undefined) {
    if (value.version >= 11 && !isAtlasState(value.atlas)) return false;
  }
  if (value.stones !== undefined && (!isNumber(value.stones) || !Number.isInteger(value.stones) || value.stones < 0 || value.stones > 100000)) return false;
  if (value.selectedWeapon !== undefined && !['fists', 'stick', 'axe', 'stones'].includes(String(value.selectedWeapon))) return false;
  if (value.version >= 8 && (!isMineralInventory(value.minerals) || !isIngots(value.ingots, value.version >= 9)
    || typeof value.ironPickaxe !== 'boolean'
    || (value.ironPickaxe && (!Array.isArray(value.tools) || !value.tools.includes('pickaxe')))
    || !isObject(value.mining)
    || Object.keys(value.mining).length > 100000
    || !Object.entries(value.mining).every(([key, n]) => /^-?\d+,-?\d+$/.test(key)
      && typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 3))) return false;
  if (value.depleted !== undefined && (!Array.isArray(value.depleted) || !value.depleted.every(id => typeof id === 'string' && /^-?\d+,-?\d+$/.test(id)))) return false;
  if (value.version >= 3 && (value.appearance === undefined || value.playerName === undefined || value.npcAppearanceSeed === undefined)) return false;
  if (value.version >= 4 && value.wildlife === undefined) return false;
  if (value.wildlife !== undefined && !isWildlifeState(value.wildlife)) return false;
  if (value.appearance !== undefined && !isAppearance(value.appearance)) return false;
  if (value.playerName !== undefined && (typeof value.playerName !== 'string' || value.playerName.trim().length === 0 || value.playerName.length > 24)) return false;
  if (value.npcAppearanceSeed !== undefined && (!isNumber(value.npcAppearanceSeed) || !Number.isInteger(value.npcAppearanceSeed) || value.npcAppearanceSeed < 0 || value.npcAppearanceSeed > 0xffffffff)) return false;
  if (value.health !== undefined && (!isNumber(value.health) || value.health < 0 || value.health > 100)) return false;
  if (value.tools !== undefined && (!Array.isArray(value.tools) || !value.tools.every(tool => tool === 'axe' || tool === 'pickaxe'))) return false;
  if (value.npcState !== undefined) {
    if (!isObject(value.npcState) || typeof value.npcState.recruited !== 'boolean'
      || !['idle', 'wood', 'stone'].includes(String(value.npcState.job))
      || ![null, 'wood', 'stone'].includes(value.npcState.carrying as string | null)) return false;
  }
  return true;
}
