import { buildingCosts, type BuildingKind, type Inventory, type Tool } from './gameplay';
import type { Outfit } from './assets';
import type { NpcState } from './npc';
import { safeSpawn } from './world';
import { isAppearance, type CharacterAppearance } from './appearance';
import { isWildlifeState, type AnimalState } from './wildlife';
import { FLOOR_HEIGHT, isStructuralPiece, type StructuralPiece } from './construction';
import { isMineralInventory, type MineralInventory } from './economy';
import { isIngots, isSmeltingJob, type Ingots, type SmeltingJob } from './smelting';

export interface SaveData {
  version: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  seed: number;
  outfit: Outfit;
  appearance?: CharacterAppearance;
  playerName?: string;
  npcAppearanceSeed?: number;
  wildlife?: AnimalState[];
  player: { x: number; z: number; y?: number };
  npc: { x: number; z: number };
  resources: Inventory;
  buildings: Array<{ kind: BuildingKind; x: number; z: number; y: number; rotation: number; charge?: number; smelting?: SmeltingJob }>;
  structures?: StructuralPiece[];
  autoRoof?: boolean;
  terrain: Record<string, number>;
  depleted?: string[];
  minerals?: MineralInventory;
  mining?: Record<string, number>;
  ingots?: Ingots;
  ironPickaxe?: boolean;
  npcState?: NpcState;
  health?: number;
  tools?: Tool[];
  calendar: { minute: number; day: number; speed?: number };
  vehicle: { x: number; z: number };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function isPosition(value: unknown, limit: number) {
  return isObject(value) && isNumber(value.x) && isNumber(value.z)
    && Math.abs(value.x) <= limit && Math.abs(value.z) <= limit;
}

export function isSaveData(value: unknown): value is SaveData {
  if (!isObject(value) || (value.version !== 1 && value.version !== 2 && value.version !== 3 && value.version !== 4 && value.version !== 5 && value.version !== 6 && value.version !== 7 && value.version !== 8)
    || !isNumber(value.seed) || !safeSpawn(value.seed) || !['ember', 'sage', 'azure'].includes(String(value.outfit))
    || !isPosition(value.player, value.version >= 6 ? 10000000 : 48)
    || !isPosition(value.npc, value.version >= 6 ? 10000000 : 48)
    || !isPosition(value.vehicle, value.version >= 6 ? 10000000 : 48)
    || !isObject(value.resources) || !isObject(value.terrain) || !isObject(value.calendar)
    || !Array.isArray(value.buildings)) return false;
  if (!['wood', 'stone', 'food', 'water'].every(k => isNumber(value.resources && (value.resources as Record<string, unknown>)[k]) && ((value.resources as Record<string, number>)[k] >= 0))) return false;
  if (!isNumber(value.calendar.minute) || value.calendar.minute < 0 || value.calendar.minute >= 1440
    || !isNumber(value.calendar.day) || value.calendar.day < 1
    || (value.calendar.speed !== undefined && (!isNumber(value.calendar.speed) || value.calendar.speed < 0.5 || value.calendar.speed > 8))) return false;
  if (!Object.entries(value.terrain).every(([key, n]) => /^-?\d+,-?\d+$/.test(key) && isNumber(n) && n >= -1.8 && n <= 0)) return false;
  const coordinateLimit = value.version >= 6 ? 10000000 : 48;
  const version = value.version;
  if (!value.buildings.every(b => isObject(b) && typeof b.kind === 'string'
    && Object.hasOwn(buildingCosts, b.kind) && isPosition(b, coordinateLimit) && isNumber(b.y) && isNumber(b.rotation)
    && (b.charge === undefined || (isNumber(b.charge) && b.charge >= 0 && b.charge <= 20))
    && (version >= 8 || b.kind !== 'smelter')
    && (b.smelting === undefined || (version >= 8 && b.kind === 'smelter' && isSmeltingJob(b.smelting))))) return false;
  if (value.version >= 7) {
    if (!isObject(value.player) || !isNumber(value.player.y) || Math.abs(value.player.y) > 10000
      || !Array.isArray(value.structures) || value.structures.length > 10000
      || !value.structures.every(isStructuralPiece) || (value.autoRoof !== undefined && typeof value.autoRoof !== 'boolean')) return false;
    const ids = new Set<string>();
    const slots = new Set<string>();
    const frames = new Set<string>();
    const horizontalSurfaces = new Set<string>();
    const doors: string[] = [];
    for (const piece of value.structures as StructuralPiece[]) {
      if (ids.has(piece.id)) return false;
      ids.add(piece.id);
      const location = `${piece.x},${piece.z},${piece.y.toFixed(4)},${piece.rotation}`;
      const category = piece.kind === 'wall' || piece.kind === 'doorframe' ? 'edge' : piece.kind;
      const slot = `${piece.x},${piece.z},${piece.y.toFixed(4)},${category},${category === 'edge' || category === 'door' ? piece.rotation : 0}`;
      if (slots.has(slot)) return false;
      slots.add(slot);
      if (piece.kind === 'doorframe') frames.add(location);
      if (piece.kind === 'door') doors.push(location);
      if (piece.kind === 'floor' || piece.kind === 'roof') {
        const height = piece.kind === 'roof' ? piece.y + FLOOR_HEIGHT : piece.y;
        const surface = `${piece.x},${piece.z},${height.toFixed(4)}`;
        if (horizontalSurfaces.has(surface)) return false;
        horizontalSurfaces.add(surface);
      }
    }
    if (doors.some(location => !frames.has(location))) return false;
  } else if (value.structures !== undefined) return false;
  if (value.version === 8 && (!isMineralInventory(value.minerals) || !isIngots(value.ingots)
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
