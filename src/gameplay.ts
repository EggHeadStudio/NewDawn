export type Resource = 'wood' | 'stone' | 'food' | 'water';
export type Inventory = Record<Resource, number>;
export type BuildingKind = 'shelter' | 'storage' | 'lamp' | 'generator' | 'turbine' | 'battery' | 'cable';
export type Cost = Partial<Inventory>;
export type Tool = 'axe' | 'pickaxe';
export const toolCosts: Record<Tool, Cost> = {
  axe: { wood: 3, stone: 2 },
  pickaxe: { wood: 2, stone: 3 },
};

export function craftTool(inventory: Inventory, tools: Tool[], tool: Tool) {
  if (tools.includes(tool) || !spend(inventory, toolCosts[tool])) return false;
  tools.push(tool);
  return true;
}

export const buildingCosts: Record<BuildingKind, Cost> = {
  shelter: { wood: 8, stone: 4 },
  storage: { wood: 6 },
  lamp: { stone: 2, wood: 2 },
  generator: { wood: 4, stone: 6 },
  turbine: { wood: 10, stone: 3 },
  battery: { wood: 3, stone: 4 },
  cable: { wood: 1, stone: 1 },
};

export function canAfford(inventory: Inventory, cost: Cost) {
  return (Object.keys(cost) as Resource[]).every(resource => inventory[resource] >= (cost[resource] ?? 0));
}

export function spend(inventory: Inventory, cost: Cost) {
  if (!canAfford(inventory, cost)) return false;
  for (const resource of Object.keys(cost) as Resource[]) inventory[resource] -= cost[resource] ?? 0;
  return true;
}

export interface Position { x: number; z: number }
export interface BuildingPosition extends Position { kind: BuildingKind }

export function buildingRadius(kind: BuildingKind) {
  return kind === 'shelter' ? 1.8 : kind === 'storage' ? 1.45 : kind === 'lamp' || kind === 'cable' ? 0.4 : 0.9;
}

export function canPlace(position: Position, kind: BuildingKind, height: number, buildings: BuildingPosition[], player: Position) {
  const radius = buildingRadius(kind);
  return height > 0.15 && Math.abs(position.x) < 46 && Math.abs(position.z) < 46
    && Math.hypot(position.x - player.x, position.z - player.z) > radius + 0.5
    && buildings.every(other => Math.hypot(position.x - other.x, position.z - other.z) >= radius + buildingRadius(other.kind) + 0.25);
}

export function isNight(minutes: number) {
  return minutes < 360 || minutes >= 1200;
}

export function daylightAt(minutes: number) {
  return Math.max(0.08, Math.sin((minutes - 360) / 720 * Math.PI));
}
