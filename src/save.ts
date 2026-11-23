import { buildingCosts, type BuildingKind, type Inventory, type Tool } from './gameplay';
import type { Outfit } from './assets';
import type { NpcState } from './npc';
import { safeSpawn } from './world';
import { isAppearance, type CharacterAppearance } from './appearance';
import { isWildlifeState, type AnimalState } from './wildlife';

export interface SaveData {
  version: 1 | 2 | 3 | 4 | 5;
  seed: number;
  outfit: Outfit;
  appearance?: CharacterAppearance;
  playerName?: string;
  npcAppearanceSeed?: number;
  wildlife?: AnimalState[];
  player: { x: number; z: number };
  npc: { x: number; z: number };
  resources: Inventory;
  buildings: Array<{ kind: BuildingKind; x: number; z: number; y: number; rotation: number; charge?: number }>;
  terrain: Record<string, number>;
  depleted?: string[];
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
function isPosition(value: unknown) {
  return isObject(value) && isNumber(value.x) && isNumber(value.z)
    && Math.abs(value.x) <= 48 && Math.abs(value.z) <= 48;
}

export function isSaveData(value: unknown): value is SaveData {
  if (!isObject(value) || (value.version !== 1 && value.version !== 2 && value.version !== 3 && value.version !== 4 && value.version !== 5)
    || !isNumber(value.seed) || !safeSpawn(value.seed) || !['ember', 'sage', 'azure'].includes(String(value.outfit))
    || !isPosition(value.player) || !isPosition(value.npc) || !isPosition(value.vehicle)
    || !isObject(value.resources) || !isObject(value.terrain) || !isObject(value.calendar)
    || !Array.isArray(value.buildings)) return false;
  if (!['wood', 'stone', 'food', 'water'].every(k => isNumber(value.resources && (value.resources as Record<string, unknown>)[k]) && ((value.resources as Record<string, number>)[k] >= 0))) return false;
  if (!isNumber(value.calendar.minute) || value.calendar.minute < 0 || value.calendar.minute >= 1440
    || !isNumber(value.calendar.day) || value.calendar.day < 1
    || (value.calendar.speed !== undefined && (!isNumber(value.calendar.speed) || value.calendar.speed < 0.5 || value.calendar.speed > 8))) return false;
  if (!Object.entries(value.terrain).every(([key, n]) => /^-?\d+,-?\d+$/.test(key) && isNumber(n) && n >= -1.8 && n <= 0)) return false;
  if (!value.buildings.every(b => isObject(b) && typeof b.kind === 'string'
    && Object.hasOwn(buildingCosts, b.kind) && isPosition(b) && isNumber(b.y) && isNumber(b.rotation)
    && (b.charge === undefined || (isNumber(b.charge) && b.charge >= 0 && b.charge <= 20)))) return false;
  if (value.depleted !== undefined && (!Array.isArray(value.depleted) || !value.depleted.every(id => typeof id === 'string' && /^-?\d+,-?\d+$/.test(id)))) return false;
  if ((value.version === 3 || value.version === 4 || value.version === 5) && (value.appearance === undefined || value.playerName === undefined || value.npcAppearanceSeed === undefined)) return false;
  if ((value.version === 4 || value.version === 5) && value.wildlife === undefined) return false;
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
