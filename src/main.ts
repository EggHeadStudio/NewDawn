import * as THREE from 'three';
import './style.css';
import { World, safeSpawn, seededNoise } from './world';
import { cameraRelativeMovement, clampCameraDistance, dampAngle, defaultCameraSettings } from './camera';
import { buildingCosts, buildingRadius, canAfford, placementProblem, craftTool, isNight, spend, type BuildingKind, type Inventory, type Tool } from './gameplay';
import { isSaveData } from './save';
import { chooseNpcActivity, stepToward, type NpcJob, type NpcState } from './npc';
import { areConnected, updatePower, type PowerNode } from './power';
import { Effects, Precipitation } from './effects';
import { seasonForDay, weatherForDay } from './calendar';
import { appearanceFromSeed, appearanceLabels, appearanceOptions, defaultAppearance, type CharacterAppearance } from './appearance';
import { CharacterPreview } from './character-preview';
import { createWildlife, updateWildlife, type AnimalState } from './wildlife';
import { animateAnimal, createAnimal, disposeAnimal } from './animal-assets';
import { disposeCharacter } from './characters';
import { attachAuthoredCharacter, updateAuthoredCharacter } from './authored-character';
import { chooseEnemyKind, enemyIntent, enemyProfiles, stepEnemyProjectile, type EnemyKind } from './enemies';
import { enterImmersiveMode, setupPwa, UPDATE_RESUME_KEY } from './pwa';
import { nearestPlanetPosition, planetCoordinates, PLANET_HEIGHT, PLANET_WIDTH } from './planet';
import { connectionLayout, roadCosts, type RoadKind, type RoadSegment } from './roads';
import { paintColors, type PaintPreset, type SurfacePaint } from './paint';
import { addPiece, FLOOR_HEIGHT, floorSurface, isEdgePiece, pieceBlocks, pieceCosts, removePiece, replacePiece, replacementProblem, replacementTarget, snapPiece, suggestFloorEdge, type PieceKind, type PieceRotation, type RoofStyle, type StructuralPiece } from './construction';
import { reconcileRoof, reshapeRoof, type RoofAxis, type RoofRequest } from './roof';
import { ConstructionRenderer, createPieceGhost } from './construction-render';
import { emptyMinerals } from './economy';
import { advanceSmelting, startSmelting, type SmeltableOre, type SmeltingJob } from './smelting';
import { environmentLighting } from './environment-lighting';
import { craftTorch, nearbyFireLights, togglePostFlame, toggleTorchEquipment, toggleTorchFlame, type TorchState } from './fire';
import { attachHandTorch, createHandTorch, createTorchPost, FireSparks } from './fire-render';
import {
  createCharacter, createShelter, createStorage, createLamp, createGenerator,
  createWindTurbine, createVehicle, createEnemy, createBattery, createCable, createSmelter, type Outfit,
} from './assets';

type Resources = Inventory;
type BuildingRecord = PowerNode & { y: number; rotation: number; smelting?: SmeltingJob; id?: string; lit?: boolean };
type TorchPostRecord = BuildingRecord & { kind: 'torchpost'; id: string; lit: boolean };
function isTorchPost(record: BuildingRecord): record is TorchPostRecord {
  return record.kind === 'torchpost' && typeof record.id === 'string' && typeof record.lit === 'boolean';
}
type BuildKind = BuildingKind | PieceKind;

function isPieceKind(kind: BuildKind): kind is PieceKind {
  return Object.hasOwn(pieceCosts, kind);
}

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <canvas id="game"></canvas>
  <div id="menu" class="screen active">
    <div class="menu-vignette"></div>
    <div class="brand"><div class="brand-mark">ND</div><div><span>EggHeadStudio</span><h1>NEW DAWN</h1></div></div>
    <div class="menu-card">
      <h2>BEGIN A WORLD</h2>
      <label>World name <input id="worldName" value="Pinehaven"/></label>
      <label>World seed <input id="worldSeed" type="number" value="1847"/></label>
      <label>Character name <input id="playerName" maxlength="24" value="Survivor" autocomplete="off"/></label>
      <label>Outfit
        <div id="outfits" class="outfits"><button data-outfit="ember" class="selected">Ember</button><button data-outfit="sage">Sage</button><button data-outfit="azure">Azure</button></div>
      </label>
      <button id="customizeCharacter" class="secondary">CUSTOMIZE CHARACTER</button>
      <button id="newGame" class="primary">NEW WORLD</button>
      <button id="continueGame" class="secondary">CONTINUE</button>
      <button id="exportSave" class="secondary">EXPORT SAVE</button>
      <button id="importSave" class="secondary">IMPORT SAVE</button>
      <input id="importSaveFile" class="hidden" type="file" accept=".json,application/json" aria-label="Choose a save file" />
      <button id="installGame" class="secondary hidden">INSTALL GAME</button>
      <p id="iosInstallHint" class="hidden">On iPhone or iPad, use Share → Add to Home Screen for the best full-screen experience.</p>
    </div>
    <div id="characterPanel" class="character-panel hidden" role="dialog" aria-modal="true" aria-labelledby="characterTitle">
      <div class="character-card">
        <div class="character-preview-wrap">
          <h2 id="characterTitle">YOUR SURVIVOR</h2>
          <canvas id="characterPreview" aria-label="3D character preview. Drag to rotate."></canvas>
          <div class="preview-controls"><button id="previewLeft" type="button" aria-label="Rotate character left">←</button><span>DRAG TO ROTATE</span><button id="previewRight" type="button" aria-label="Rotate character right">→</button></div>
        </div>
        <div class="character-options"><h3>APPEARANCE</h3><p class="appearance-notice">Some choices are approximated; modern clothes, caps and helmets are not yet available.</p><div id="appearanceFields"></div><button id="finishCharacter" class="primary" type="button">DONE</button></div>
      </div>
    </div>
  </div>
  <div id="hud" class="hidden">
    <div class="topbar">
      <div class="vitals"><div class="vital"><span>♥</span><div><i id="healthBar"></i></div></div><div class="vital stamina"><span>◆</span><div><i id="staminaBar"></i></div></div></div>
      <div class="time-card"><strong id="timeText">06:00</strong><span id="seasonText">SPRING · DAY 1</span></div>
      <button id="pauseButton" class="icon-button">Ⅱ</button>
    </div>
    <canvas id="minimap" width="180" height="180" role="button" tabindex="0" aria-label="Show local map coordinates"></canvas>
    <div id="objective" class="objective"><span id="survivorLabel">FIRST STEPS</span><strong id="objectiveText">Gather wood and stone</strong></div>
    <div id="vehicleIndicator" class="vehicle-indicator hidden" aria-live="off">SPEED 0.0</div>
    <div id="shelterStatus" class="shelter-status hidden" aria-live="polite"></div>
    <div id="resources" class="resources"></div>
    <div id="controlsHint">Click world for mouse look · WASD move · E interact · Space gather · B build</div>
    <div id="joystick"><div id="stick"></div></div>
    <div class="mobile-actions"><button id="exitVehicle" class="hidden">EXIT</button><button id="actionA">A<span>Gather</span></button><button id="actionB">B<span>Interact</span></button></div>
    <div class="quickbar"><button data-tool="axe" class="selected" aria-label="Gathering tool">⛏<small>Tool</small></button><button data-tool="build" aria-label="Build structures">▦<small>Build</small></button><button id="roadTool" aria-label="Build roads">╬<small>Road</small></button><button id="terrainTool" aria-label="Terrain editing tools">◇<small>Terrain</small></button><button id="paintTool" aria-label="Paint building surfaces">◒<small>Paint</small></button><button id="inventoryButton" aria-label="Open inventory">▣<small>Pack</small></button></div>
  </div>
  <div id="buildPanel" class="panel hidden" role="dialog" aria-labelledby="buildTitle"><h2 id="buildTitle">CHOOSE A BUILDING</h2><p>Select a structure to start placing it.</p><div id="buildCatalog"></div><button id="closeBuild" class="close" aria-label="Close build menu">×</button></div>
  <div id="placementToolbar" class="placement-toolbar hidden" aria-label="Building placement">
    <strong id="placementName"></strong><span id="placementStatus" role="status"></span><small id="placementCoordinates"></small>
    <div id="floorControls" class="floor-controls hidden"><button id="floorDown" type="button" aria-label="Lower building level">−</button><span id="floorLevel">LEVEL 0</span><button id="floorUp" type="button" aria-label="Raise building level">+</button><button id="removePiece" type="button">REMOVE</button><button id="autoOrient" class="hidden" type="button">AUTO EDGE</button><label><input id="autoRoof" type="checkbox" checked> Auto roof</label></div>
    <details id="roofControls" class="hidden"><summary>ROOF STYLE</summary><div class="roof-controls"><label>Roof <select id="roofStyle" aria-label="Automatic roof style"><option value="flat">Flat</option><option value="gable">Gable</option><option value="single">Single slope</option></select></label><label>Axis <select id="roofAxis" aria-label="Roof slope axis"><option value="auto">Auto</option><option value="x">East–west</option><option value="z">North–south</option></select></label><button id="applyRoof" type="button">APPLY TO AIMED ROOM</button><small>Reshape complete auto roof: 0 wood, no refund.</small></div></details>
    <div class="placement-buttons"><button id="rotateBuild" type="button">ROTATE <kbd>R</kbd></button><button id="changeBuild" type="button">CHANGE</button><button id="confirmBuild" type="button">PLACE</button><button id="cancelBuild" type="button">CANCEL</button></div>
    <small class="placement-hint">Point at ground · Click to place · Right-drag to orbit</small>
  </div>
  <div id="terrainToolbar" class="tool-toolbar hidden" aria-label="Terrain tools">
    <strong>TERRAIN</strong>
    <div class="tool-actions">
      <button data-terrain="lower" class="selected">DIG</button><button data-terrain="raise">RAISE</button>
      <button data-terrain="flatten">FLATTEN</button><button data-terrain="smooth">SMOOTH</button>
      <button data-terrain="slope">SLOPE</button>
    </div>
    <label>Brush <input id="terrainBrush" type="range" min="1" max="8" step="1" value="3"></label>
    <small id="terrainStatus">Drag or tap ground to edit</small>
    <button id="terrainUndo" class="secondary">UNDO</button><button id="terrainExit" class="secondary">EXIT TOOL</button>
  </div>
  <div id="paintToolbar" class="tool-toolbar hidden" aria-label="Building paint">
    <strong>PAINT</strong>
    <div class="paint-presets">
      ${Object.entries(paintColors).map(([key, preset]) => `<button data-paint="${key}" style="--paint:${preset.color}" title="${preset.label}" aria-label="${preset.label}"></button>`).join('')}
      <button id="paintErase" title="Eraser" aria-label="Eraser">ERASE</button>
    </div>
    <label>Brush <input id="paintBrush" type="range" min="1" max="20" step="1" value="5"></label>
    <small id="paintStatus">Aim at a wall or floor</small>
    <button id="paintUndo" class="secondary">UNDO</button><button id="paintExit" class="secondary">EXIT TOOL</button>
  </div>
  <div id="roadToolbar" class="tool-toolbar hidden" aria-label="Road construction">
    <strong>ROAD</strong>
    <div class="tool-actions"><button data-road="dirt" class="selected">DIRT</button><button data-road="gravel">GRAVEL · 2 STONE</button><button data-road="stone">STONE · 4 STONE</button></div>
    <small id="roadStatus">Aim at the ground and click or tap to grade and place</small>
    <button id="roadExit" class="secondary">EXIT TOOL</button>
  </div>
  <div id="npcPanel" class="panel hidden"><h2>MIRA · SURVIVOR</h2><p id="npcStatus">A friendly survivor.</p><button id="npcRecruit" class="primary">RECRUIT</button><button data-job="wood" class="secondary">GATHER WOOD</button><button data-job="stone" class="secondary">GATHER STONE</button><button data-job="idle" class="secondary">REST</button><button id="closeNpc" class="close" aria-label="Close survivor menu">×</button></div>
  <div id="craftPanel" class="panel hidden"><h2>CRAFTING</h2><p>Craft a pickaxe to mine ore, coal and limestone. Clay and sand can be gathered by hand.</p><button data-craft="axe" class="secondary">AXE · 3 WOOD, 2 STONE</button><button data-craft="pickaxe" class="secondary">PICKAXE · 2 WOOD, 3 STONE</button><p id="toolStatus"></p><button id="craftTorch" class="secondary">CRAFT TORCH · 2 WOOD, 1 COAL</button><button id="equipTorch" class="secondary">EQUIP TORCH</button><button id="igniteTorch" class="secondary">IGNITE TORCH</button><p id="torchStatus"></p><p id="mineralInventory"></p><button id="closeCraft" class="close" aria-label="Close crafting">×</button></div>
  <div id="smelterPanel" class="panel hidden"><h2>SMELTER &amp; FURNACE</h2><p id="smelterStatus"></p><button data-smelt="ironOre" class="secondary">IRON INGOT · 2 IRON ORE + 1 COAL</button><button data-smelt="copperOre" class="secondary">COPPER INGOT · 2 COPPER ORE + 1 COAL</button><button data-smelt="sand" class="secondary">GLASS · 2 SAND + 1 COAL</button><button id="forgePickaxe" class="secondary">IRON PICKAXE · 2 IRON + 2 WOOD</button><p>Close this panel to let production run. The iron pickaxe doubles mineral yield.</p><button id="closeSmelter" class="close" aria-label="Close smelter">×</button></div>
  <div id="pausePanel" class="panel hidden"><h2>PAUSED</h2>
    <label class="setting">Auto follow <input id="cameraFollow" type="checkbox" checked></label>
    <label class="setting">Camera distance <input id="cameraDistance" type="range" min="5" max="24" step="1" value="12"></label>
    <label class="setting">Rotation speed <input id="cameraSpeed" type="range" min="0.3" max="2" step="0.1" value="1"></label>
    <label class="setting">Smoothing <input id="cameraSmoothing" type="range" min="2" max="12" step="1" value="5"></label>
    <label class="setting">Mouse sensitivity <input id="mouseSensitivity" type="range" min="0.3" max="2" step="0.1" value="1"></label>
    <label class="setting">Invert vertical look <input id="invertMouse" type="checkbox"></label>
    <label class="setting">Legacy right-drag <input id="legacyCamera" type="checkbox"></label>
    <label class="setting">Game speed <input id="gameSpeed" type="range" min="0.5" max="8" step="0.1" value="2.2"></label>
    <label class="setting">Terrain distance <input id="renderDistance" type="range" min="1" max="3" step="1" value="1"></label>
    <label class="setting">Fog start <input id="fogStart" type="range" min="12" max="160" step="2" value="42"></label>
    <label class="setting">Fog end <input id="fogEnd" type="range" min="24" max="220" step="2" value="92"></label>
    <label class="setting">Quality <select id="graphicsQuality"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option></select></label>
    <p>Game version: ${__APP_VERSION__}</p><button id="exitFullscreen" class="secondary">EXIT FULLSCREEN</button>
    <button id="resumeGame" class="primary">RESUME</button><button id="saveGame" class="secondary">SAVE WORLD</button><button id="returnMenu" class="secondary">MAIN MENU</button></div>
  <div id="updatePanel" class="update-panel hidden" role="dialog" aria-labelledby="updateTitle"><strong id="updateTitle">New Dawn Update Available</strong><p>Save your world and restart to play the new version.</p><div><button id="applyUpdate" class="primary">UPDATE NOW</button><button id="laterUpdate" class="secondary">LATER</button></div></div>
  <div id="toast" class="toast"></div>
`;

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const effects = new Effects(scene);
const precipitation = new Precipitation(scene);
scene.background = new THREE.Color('#92c7cf');
scene.fog = new THREE.Fog('#92c7cf', 42, 92);
const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 160);
camera.position.set(12, 14, 18);

const ambient = new THREE.HemisphereLight('#dff4ff', '#55704a', 2);
scene.add(ambient);
const sun = new THREE.DirectionalLight('#fff1c2', 3);
sun.position.set(-25, 35, 18);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -35;
sun.shadow.camera.right = 35;
sun.shadow.camera.top = 35;
sun.shadow.camera.bottom = -35;
scene.add(sun);
const moon = new THREE.DirectionalLight('#8ca8dc', 0);
moon.position.set(18, 30, -20);
scene.add(moon);
const postLights = Array.from({ length: 4 }, () => {
  const light = new THREE.PointLight('#ffad57', 0, 9, 2);
  scene.add(light);
  return light;
});
const fireSparks = new FireSparks(scene);
const nightSky = new THREE.Color();
const dayAmbient = new THREE.Color('#dff4ff');
const nightAmbient = new THREE.Color('#91a9d8');
const dayGround = new THREE.Color('#55704a');
const nightGround = new THREE.Color('#46556c');
const twilightSky = new THREE.Color('#bd7865');
const noonSun = new THREE.Color('#fff1c2');
const twilightSun = new THREE.Color('#ffc184');

let seed = 1847;
let renderDistance = matchMedia('(pointer: coarse)').matches ? 1 : 2;
let world = new World(seed, renderDistance);
let graphicsQuality: 'low' | 'medium' | 'high' = 'medium';
let fogStart = 42;
let fogEnd = 92;
scene.add(world.group);
function updateTerrainFog() {
  if (!(scene.fog instanceof THREE.Fog)) return;
  const qualityFar = graphicsQuality === 'low' ? 0.72 : graphicsQuality === 'high' ? 1.28 : 1;
  scene.fog.far = Math.min(fogEnd * qualityFar, renderDistance * 24 + 12);
  scene.fog.near = Math.min(fogStart, scene.fog.far - 8);
  camera.far = renderDistance * 24 + 140;
  camera.updateProjectionMatrix();
}
updateTerrainFog();

let outfit: Outfit = 'ember';
let appearance: CharacterAppearance = { ...defaultAppearance(outfit), clothing: 'tunic' };
let characterName = 'Survivor';
let npcAppearanceSeed = ((seed >>> 0) + 53917) >>> 0;
let characterLoadErrorShown = false;
function useAuthoredCharacter(character: THREE.Group, look: CharacterAppearance) {
  attachAuthoredCharacter(character, look, error => {
    console.error('Could not load authored character; using procedural fallback', error);
    if (!characterLoadErrorShown) {
      characterLoadErrorShown = true;
      toast('Character assets could not be loaded; using fallback');
    }
  });
}
let player = createCharacter(appearance);
useAuthoredCharacter(player, appearance);
let handTorch = createHandTorch();
attachHandTorch(player, handTorch.group);
player.position.set(0, world.heightAt(0, 0), 5);
scene.add(player);

let npc = createCharacter(appearanceFromSeed(npcAppearanceSeed));
useAuthoredCharacter(npc, appearanceFromSeed(npcAppearanceSeed));
npc.position.set(-4, world.heightAt(-4, 2), 2);
scene.add(npc);

const vehicle = createVehicle();
vehicle.position.set(8, world.heightAt(8, 4), 4);
scene.add(vehicle);

const resources: Resources = { wood: 0, stone: 0, food: 3, water: 3 };
const mineralInventory = emptyMinerals();
const ingots = { iron: 0, copper: 0, glass: 0 };
let ironPickaxe = false;
let activeSmelter: BuildingRecord | null = null;
const tools: Tool[] = [];
const torch: TorchState = { crafted: false, equipped: false, lit: false };
let visiblePostLights: TorchPostRecord[] = [];
let postLightTimer = 0;
const buildings: THREE.Group[] = [];
const buildingRecords: BuildingRecord[] = [];
const structures: StructuralPiece[] = [];
const constructionRenderer = new ConstructionRenderer();
scene.add(constructionRenderer.group);
const powerLines = new THREE.Group();
scene.add(powerLines);
const enemies: THREE.Group[] = [];
const enemyProjectiles: { mesh: THREE.Mesh; velocity: THREE.Vector3; remaining: number; damage: number }[] = [];
const projectileGeometry = new THREE.IcosahedronGeometry(0.13, 1);
const projectileMaterial = new THREE.MeshStandardMaterial({ color: '#cf9bee', emissive: '#854db3', emissiveIntensity: 1.5 });
let wildlife: AnimalState[] = [];
const animalModels = new Map<string, THREE.Group>();
const npcState: NpcState = { recruited: false, job: 'idle', carrying: null };
let health = 100;
let attackCooldown = 0;
let enemyHitCooldown = 0;
let spawnCooldown = 0;
let animationActionTime = 0;
let animationAction: 'chop' | 'mine' | 'build' | 'attack' | 'hurt' = 'chop';
let buildMode = false;
let buildKind: BuildKind = 'shelter';
let buildGhost: THREE.Group | null = null;
let buildRotation = 0;
let manualBuildOrientation = false;
let buildLevel = 0;
let autoRoof = true;
let roofStyle: RoofStyle = 'flat';
let roofAxis: RoofAxis = 'auto';
const pendingRoofs = new Map<string, RoofRequest>();
const buildAim = new THREE.Vector2();
const buildTarget = new THREE.Vector3();
const placementRay = new THREE.Raycaster();
const placementPointer = new THREE.Vector2();
let placementFootprint: THREE.Mesh | null = null;
let ghostMaterial: THREE.MeshBasicMaterial | null = null;
let targetOnTerrain = true;
type ToolMode = 'normal' | 'terrain' | 'road' | 'paint';
let toolMode: ToolMode = 'normal';
let terrainOperation: 'lower' | 'raise' | 'flatten' | 'smooth' | 'slope' = 'lower';
let terrainBrush = 3;
let terrainTargetHeight = 0;
let terrainHistory: Array<{ key: string; previous: number; next: number }> = [];
const terrainHistoryLimit: Array<Array<{ key: string; previous: number; next: number }>> = [];
let roadKind: RoadKind = 'dirt';
const roads: RoadSegment[] = [];
const roadModels = new Map<string, THREE.Group>();
const surfacePaint: SurfacePaint[] = [];
const paintHistory: SurfacePaint[][] = [];
let paintPreset: PaintPreset = 'natural';
let paintErase = false;
let paintBrush = 5;
let driving = false;
let vehicleSpeed = 0;
let accelerateTouch = false;
let brakeTouch = false;
let paused = false;
let updatePending = false;
let pausedBeforeUpdate = false;
let gameStarted = false;
let gameMinutes = 360;
let day = 1;
let gameSpeed = 2.2;
let autoSaveTimer = 0;

const keys = new Set<string>();
const move = new THREE.Vector2();
let cameraAngle = 0.78;
const cameraSettings = { ...defaultCameraSettings };
let cameraPitch = 0.48;
let manualCameraUntil = 0;
let mouseSensitivity = 1;
let invertMouse = false;
let legacyCamera = false;
let pointerLockUnavailable = typeof canvas.requestPointerLock !== 'function';
let lastPointerUnlock = -Infinity;
let movementBasis = cameraAngle;
let previousInput = new THREE.Vector2();
const cameraRay = new THREE.Raycaster();
const cameraFocus = new THREE.Vector3();
const cameraDesired = new THREE.Vector3();
let cameraReady = false;
let preview: CharacterPreview | undefined;

const appearanceFields = document.querySelector<HTMLDivElement>('#appearanceFields')!;
for (const key of Object.keys(appearanceOptions) as Array<keyof CharacterAppearance>) {
  const label = document.createElement('label');
  label.textContent = appearanceLabels[key];
  const select = document.createElement('select');
  select.id = `appearance-${key}`;
  for (const value of appearanceOptions[key]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value.charAt(0).toUpperCase() + value.slice(1);
    select.append(option);
  }
  select.value = appearance[key];
  select.addEventListener('change', () => {
    const value = appearanceOptions[key].find(option => option === select.value);
    if (!value) return;
    appearance = { ...appearance, [key]: value };
    outfit = appearance.outfit;
    syncOutfitButtons();
    preview?.setAppearance(appearance);
  });
  label.append(select);
  appearanceFields.append(label);
}
function syncOutfitButtons() {
  document.querySelectorAll<HTMLButtonElement>('#outfits button').forEach(button => button.classList.toggle('selected', button.dataset.outfit === outfit));
  (document.querySelector('#appearance-outfit') as HTMLSelectElement).value = outfit;
}

document.querySelector('#customizeCharacter')!.addEventListener('click', () => {
  document.querySelector('#characterPanel')!.classList.remove('hidden');
  if (!preview) preview = new CharacterPreview(document.querySelector<HTMLCanvasElement>('#characterPreview')!);
  preview.setAppearance(appearance);
});
document.querySelector('#finishCharacter')!.addEventListener('click', () => document.querySelector('#characterPanel')!.classList.add('hidden'));
document.querySelector('#previewLeft')!.addEventListener('click', () => preview?.rotate(-Math.PI / 4));
document.querySelector('#previewRight')!.addEventListener('click', () => preview?.rotate(Math.PI / 4));

function onResize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 700 ? 1.25 : 1.75));
}
addEventListener('resize', onResize);
onResize();

addEventListener('keydown', event => {
  if (event.code === 'Escape' && gameStarted) {
    if (document.pointerLockElement === canvas) {
      event.preventDefault();
      document.exitPointerLock();
      return;
    }
    if (!document.querySelector('#updatePanel')!.classList.contains('hidden')) return;
    if (!document.querySelector('#pausePanel')!.classList.contains('hidden')) togglePause();
    else if (!document.querySelector('#buildPanel')!.classList.contains('hidden') || buildMode) cancelBuild();
    else if (!document.querySelector('#craftPanel')!.classList.contains('hidden')) document.querySelector('#craftPanel')!.classList.add('hidden');
    else if (!document.querySelector('#smelterPanel')!.classList.contains('hidden')) document.querySelector('#smelterPanel')!.classList.add('hidden');
    else if (!document.querySelector('#npcPanel')!.classList.contains('hidden')) document.querySelector('#npcPanel')!.classList.add('hidden');
    else if (toolMode !== 'normal') exitToolModes();
    else if (performance.now() - lastPointerUnlock > 300) togglePause();
    return;
  }
  if (!gameStarted || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || gameplayBlocked()
    || (event.target instanceof HTMLButtonElement && event.target.getClientRects().length > 0
      && ['Space', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code))) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  keys.add(event.code);
  if (event.repeat) return;
  if (event.code === 'KeyB') toggleBuild();
  if (event.code === 'KeyI') document.querySelector<HTMLButtonElement>('#inventoryButton')!.click();
  if (event.code === 'KeyE') interact();
  if (event.code === 'Space') buildMode ? placeBuilding() : gather();
  if (event.code === 'KeyR' && buildMode) rotateBuild();
  if (event.code === 'BracketLeft' && buildMode && isPieceKind(buildKind)) changeFloor(-1);
  if (event.code === 'BracketRight' && buildMode && isPieceKind(buildKind)) changeFloor(1);
  if (event.code === 'KeyM') showMap();
});
addEventListener('keyup', event => keys.delete(event.code));
addEventListener('blur', () => { keys.clear(); move.set(0, 0); });

const cameraPointers = new Map<number, { x: number; y: number }>();
let placementTouch: { id: number; x: number; y: number } | null = null;
let rightDragDistance = 0;
let leftClickStart: { x: number; y: number } | null = null;
function manualCamera() {
  manualCameraUntil = performance.now() + 2000;
  previousInput.set(0, 0);
}
function releasePointerLock() {
  if (document.pointerLockElement === canvas) document.exitPointerLock();
}
function updateCameraHint(action?: string) {
  const hint = document.querySelector('#controlsHint')!;
  const text = document.pointerLockElement === canvas
    ? 'MOUSE LOOK ACTIVE · Esc releases cursor · WASD move · E interact · B build'
    : legacyCamera || pointerLockUnavailable
      ? 'Right-drag camera · WASD move · E interact · Space gather · B build'
      : 'Click world for mouse look · WASD move · E interact · Space gather · B build';
  hint.textContent = action ? text.replace('E interact', `E ${action}`) : text;
}
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas && (!gameStarted || gameplayBlocked() || buildMode || legacyCamera)) {
    releasePointerLock();
  } else if (document.pointerLockElement !== canvas) {
    lastPointerUnlock = performance.now();
    clearMovement();
  }
  updateCameraHint();
});
document.addEventListener('pointerlockerror', () => {
  pointerLockUnavailable = true;
  updateCameraHint();
  toast('Mouse look unavailable; use right-drag camera');
});
document.addEventListener('mousemove', event => {
  if (document.pointerLockElement !== canvas || gameplayBlocked() || buildMode) return;
  cameraAngle -= event.movementX * 0.006 * mouseSensitivity;
  cameraPitch = THREE.MathUtils.clamp(cameraPitch + event.movementY * 0.004 * mouseSensitivity * (invertMouse ? -1 : 1), 0.25, 1.05);
  manualCamera();
});
canvas.addEventListener('contextmenu', event => event.preventDefault());
canvas.addEventListener('pointerdown', event => {
  if (!gameStarted || gameplayBlocked() || pointerOverHud(event.clientX, event.clientY)) return;
  if (toolMode !== 'normal') {
    if (toolMode === 'terrain') {
      applyTerrainAtClient(event.clientX, event.clientY);
      if (event.pointerType !== 'mouse') canvas.setPointerCapture(event.pointerId);
    } else if (toolMode === 'road') {
      placeRoadAtClient(event.clientX, event.clientY);
    } else if (toolMode === 'paint') {
      paintAtClient(event.clientX, event.clientY);
      if (event.pointerType !== 'mouse') canvas.setPointerCapture(event.pointerId);
    }
    return;
  }
  if (event.pointerType === 'mouse' && event.button === 0) {
    if (buildGhost) leftClickStart = { x: event.clientX, y: event.clientY };
    else if (!buildMode && !legacyCamera && !pointerLockUnavailable && document.pointerLockElement !== canvas) {
      try {
        const request = canvas.requestPointerLock();
        if (request) void request.catch(error => {
          console.warn('Mouse look could not be activated', error);
          pointerLockUnavailable = true;
          updateCameraHint();
          toast('Mouse look unavailable; use right-drag camera');
        });
      } catch (error) {
        console.warn('Mouse look could not be activated', error);
        pointerLockUnavailable = true;
        updateCameraHint();
        toast('Mouse look unavailable; use right-drag camera');
      }
    }
    return;
  }
  if (event.pointerType === 'mouse' && event.button !== 2) return;
  if (event.pointerType === 'mouse' && !buildMode && !legacyCamera && !pointerLockUnavailable) return;
  if (event.pointerType !== 'mouse' && buildGhost && cameraPointers.size === 0) {
    if (!placementTouch) {
      placementTouch = { id: event.pointerId, x: event.clientX, y: event.clientY };
      canvas.setPointerCapture(event.pointerId);
      aimBuilding(event.clientX, event.clientY - 55);
      return;
    }
    cameraPointers.set(placementTouch.id, { x: placementTouch.x, y: placementTouch.y });
    placementTouch = null;
  } else if (event.pointerType !== 'mouse' && event.clientX < innerWidth / 2 && cameraPointers.size === 0) return;
  rightDragDistance = 0;
  cameraPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  canvas.setPointerCapture(event.pointerId);
  manualCamera();
});
canvas.addEventListener('pointermove', event => {
  if (toolMode === 'terrain' && (event.buttons & 1 || event.pointerType !== 'mouse')) applyTerrainAtClient(event.clientX, event.clientY);
  if (toolMode === 'road' && event.buttons & 1) placeRoadAtClient(event.clientX, event.clientY);
  if (toolMode === 'paint' && (event.buttons & 1 || event.pointerType !== 'mouse')) paintAtClient(event.clientX, event.clientY);
  if (placementTouch?.id === event.pointerId) {
    placementTouch.x = event.clientX;
    placementTouch.y = event.clientY;
    aimBuilding(event.clientX, event.clientY - 55);
    return;
  }
  const previous = cameraPointers.get(event.pointerId);
  if (!previous) {
    if (event.pointerType === 'mouse' && buildGhost && !gameplayBlocked()) aimBuilding(event.clientX, event.clientY);
    return;
  }
  const points = [...cameraPointers.values()];
  const before = points.length === 2 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0;
  const dx = event.clientX - previous.x;
  const dy = event.clientY - previous.y;
  rightDragDistance += Math.hypot(dx, dy);
  cameraPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (cameraPointers.size === 2) {
    const updated = [...cameraPointers.values()];
    const after = Math.hypot(updated[0].x - updated[1].x, updated[0].y - updated[1].y);
    cameraSettings.distance = clampCameraDistance(cameraSettings.distance - (after - before) * 0.045);
    (document.querySelector('#cameraDistance') as HTMLInputElement).value = String(cameraSettings.distance);
    if (buildMode) {
      cameraAngle -= dx * 0.003 * cameraSettings.rotationSpeed;
      cameraPitch = THREE.MathUtils.clamp(cameraPitch + dy * 0.002 * cameraSettings.rotationSpeed, 0.25, 1.05);
    }
  } else if (!buildMode || event.pointerType === 'mouse') {
    cameraAngle -= dx * 0.006 * cameraSettings.rotationSpeed;
    cameraPitch = THREE.MathUtils.clamp(cameraPitch + dy * 0.004 * cameraSettings.rotationSpeed, 0.25, 1.05);
  }
  manualCamera();
});
function endCameraPointer(event: PointerEvent) {
  if (placementTouch?.id === event.pointerId) placementTouch = null;
  const wasCamera = cameraPointers.delete(event.pointerId);
  if (event.type !== 'pointerup' || gameplayBlocked()) { leftClickStart = null; return; }
  if (wasCamera && event.pointerType === 'mouse' && event.button === 2 && rightDragDistance < 5 && buildMode) cancelBuild();
  if (event.pointerType === 'mouse' && event.button === 0 && leftClickStart && buildGhost
    && Math.hypot(event.clientX - leftClickStart.x, event.clientY - leftClickStart.y) < 5) {
    aimBuilding(event.clientX, event.clientY);
    placeBuilding();
  }
  leftClickStart = null;
}
canvas.addEventListener('pointerup', endCameraPointer);
canvas.addEventListener('pointercancel', endCameraPointer);
canvas.addEventListener('lostpointercapture', endCameraPointer);
canvas.addEventListener('wheel', event => {
  if (!gameStarted || gameplayBlocked()) return;
  event.preventDefault();
  cameraSettings.distance = clampCameraDistance(cameraSettings.distance + event.deltaY * 0.012);
  (document.querySelector('#cameraDistance') as HTMLInputElement).value = String(cameraSettings.distance);
}, { passive: false });

const stickArea = document.querySelector<HTMLDivElement>('#joystick')!;
const stick = document.querySelector<HTMLDivElement>('#stick')!;
let stickPointer: number | null = null;
stickArea.addEventListener('pointerdown', startStick);
stickArea.addEventListener('pointermove', moveStick);
stickArea.addEventListener('pointerup', stopStick);
stickArea.addEventListener('pointercancel', stopStick);
stickArea.addEventListener('lostpointercapture', stopStick);
function startStick(event: PointerEvent) {
  if (gameplayBlocked() || stickPointer !== null) return;
  stickPointer = event.pointerId;
  stickArea.setPointerCapture(event.pointerId);
  moveStick(event);
}
function moveStick(event: PointerEvent) {
  if (gameplayBlocked() || event.pointerId !== stickPointer || !stickArea.hasPointerCapture(event.pointerId)) return;
  const rect = stickArea.getBoundingClientRect();
  const dx = event.clientX - (rect.left + rect.width / 2);
  const dy = event.clientY - (rect.top + rect.height / 2);
  const length = Math.min(38, Math.hypot(dx, dy));
  const angle = Math.atan2(dy, dx);
  const x = Math.cos(angle) * length;
  const y = Math.sin(angle) * length;
  stick.style.transform = `translate(${x}px, ${y}px)`;
  move.set(x / 38, y / 38);
}
function stopStick(event: PointerEvent) {
  if (event.pointerId !== stickPointer) return;
  stickPointer = null;
  move.set(0, 0);
  stick.style.transform = 'translate(0, 0)';
}

const actionA = document.querySelector<HTMLButtonElement>('#actionA')!;
const actionB = document.querySelector<HTMLButtonElement>('#actionB')!;
for (const selector of ['#hud', '#placementToolbar']) {
  document.querySelector(selector)!.addEventListener('click', event => {
    if (event instanceof MouseEvent && event.detail > 0 && event.target instanceof Element) event.target.closest('button')?.blur();
  });
}
function setupAction(button: HTMLButtonElement, action: () => void, setDrivingInput: (pressed: boolean) => void) {
  let touch: { id: number; x: number; y: number } | null = null;
  let touchTap: boolean | null = null;
  button.addEventListener('pointerdown', event => {
    if (gameplayBlocked()) return;
    touchTap = event.pointerType === 'touch' ? false : null;
    if (driving) {
      setDrivingInput(true);
      button.setPointerCapture(event.pointerId);
    } else if (event.pointerType === 'touch') {
      touch = { id: event.pointerId, x: event.clientX, y: event.clientY };
      button.setPointerCapture(event.pointerId);
    }
  });
  button.addEventListener('pointerup', event => {
    setDrivingInput(false);
    if (!touch || touch.id !== event.pointerId) return;
    const rect = button.getBoundingClientRect();
    const tapped = Math.hypot(event.clientX - touch.x, event.clientY - touch.y) < 15
      && event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    touch = null;
    touchTap = tapped;
  });
  button.addEventListener('pointercancel', () => { touch = null; touchTap = null; setDrivingInput(false); });
  button.addEventListener('lostpointercapture', () => {
    if (touch) { touch = null; touchTap = null; }
    setDrivingInput(false);
  });
  button.addEventListener('click', event => {
    if (event.detail !== 0 && touchTap !== null) {
      const tapped = touchTap;
      touchTap = null;
      if (!tapped) return;
    }
    if (!driving && !gameplayBlocked()) action();
  });
}
setupAction(actionA, () => buildMode ? placeBuilding() : gather(), pressed => { accelerateTouch = pressed; });
setupAction(actionB, () => buildMode ? cancelBuild() : interact(), pressed => { brakeTouch = pressed; });
document.querySelector('#exitVehicle')!.addEventListener('click', interact);
document.querySelector('#minimap')!.addEventListener('click', showMap);
document.querySelector<HTMLCanvasElement>('#minimap')!.addEventListener('keydown', event => {
  if (event.code === 'Enter' || event.code === 'Space') {
    event.preventDefault();
    event.stopPropagation();
    showMap();
  }
});
document.querySelector('[data-tool="build"]')!.addEventListener('click', toggleBuild);
document.querySelector('[data-tool="axe"]')!.addEventListener('click', () => { if (buildMode) toggleBuild(); });
document.querySelector('#rotateBuild')!.addEventListener('click', rotateBuild);
document.querySelector('#floorDown')!.addEventListener('click', () => changeFloor(-1));
document.querySelector('#floorUp')!.addEventListener('click', () => changeFloor(1));
document.querySelector('#removePiece')!.addEventListener('click', removeTargetPiece);
document.querySelector('#autoOrient')!.addEventListener('click', () => {
  manualBuildOrientation = false;
  updateBuildTarget(buildAim.x, buildAim.y);
  updatePlacement();
});
document.querySelector<HTMLInputElement>('#autoRoof')!.addEventListener('change', event => {
  autoRoof = (event.target as HTMLInputElement).checked;
  if (autoRoof && buildGhost && isPieceKind(buildKind)) {
    const result = reconcileRoofs(selectedPiece());
    constructionRenderer.refresh(structures, surfacePaint);
    updateResources();
    if (result) toast(result);
  }
  void saveGame(false);
});
document.querySelector<HTMLSelectElement>('#roofStyle')!.addEventListener('change', event => {
  roofStyle = (event.target as HTMLSelectElement).value as RoofStyle;
  void saveGame(false);
});
document.querySelector<HTMLSelectElement>('#roofAxis')!.addEventListener('change', event => {
  roofAxis = (event.target as HTMLSelectElement).value as RoofAxis;
  void saveGame(false);
});
document.querySelector('#applyRoof')!.addEventListener('click', () => {
  if (!buildGhost || gameplayBlocked() || !isPieceKind(buildKind)) return;
  const cell = snapPiece('floor', buildAim.x, buildAim.y, 0);
  const result = reshapeRoof(structures, { y: buildTarget.y, level: buildLevel, style: roofStyle, axis: roofAxis }, cell.x, cell.z);
  if (result.status === 'changed') {
    constructionRenderer.refresh(structures, surfacePaint);
    toast(result.fallback ? 'Irregular room: using a connected single-slope roof · 0 wood' : 'Roof reshaped · 0 wood');
    void saveGame(false);
  } else {
    toast(result.status === 'upper-conflict' ? 'Upper structure blocks a pitched roof'
      : result.status === 'adjacent-roof' ? 'Adjacent room roof blocks reshaping; remove it first'
      : result.status === 'incomplete' ? 'Room needs a complete automatic roof before reshaping'
        : result.status === 'too-large' ? 'Room too large for roof planning' : 'Aim inside an enclosed room');
  }
});
document.querySelector('#confirmBuild')!.addEventListener('click', placeBuilding);
document.querySelector('#cancelBuild')!.addEventListener('click', cancelBuild);
document.querySelector('#changeBuild')!.addEventListener('click', showBuildCatalog);
document.querySelector('#cameraFollow')!.addEventListener('change', event => { cameraSettings.autoFollow = (event.target as HTMLInputElement).checked; });
document.querySelector('#cameraDistance')!.addEventListener('input', event => { cameraSettings.distance = clampCameraDistance(Number((event.target as HTMLInputElement).value)); });
document.querySelector('#cameraSpeed')!.addEventListener('input', event => { cameraSettings.rotationSpeed = Number((event.target as HTMLInputElement).value); });
document.querySelector('#cameraSmoothing')!.addEventListener('input', event => { cameraSettings.smoothing = Number((event.target as HTMLInputElement).value); });
document.querySelector('#mouseSensitivity')!.addEventListener('input', event => { mouseSensitivity = Number((event.target as HTMLInputElement).value); });
document.querySelector('#invertMouse')!.addEventListener('change', event => { invertMouse = (event.target as HTMLInputElement).checked; });
document.querySelector('#legacyCamera')!.addEventListener('change', event => {
  legacyCamera = (event.target as HTMLInputElement).checked;
  if (legacyCamera) releasePointerLock();
  updateCameraHint();
});
document.querySelector('#gameSpeed')!.addEventListener('input', event => { gameSpeed = Number((event.target as HTMLInputElement).value); });
const renderDistanceInput = document.querySelector<HTMLInputElement>('#renderDistance')!;
renderDistanceInput.value = String(renderDistance);
renderDistanceInput.addEventListener('input', () => {
  renderDistance = Number(renderDistanceInput.value);
  world.setRenderDistance(renderDistance);
  updateTerrainFog();
});
const fogStartInput = document.querySelector<HTMLInputElement>('#fogStart')!;
const fogEndInput = document.querySelector<HTMLInputElement>('#fogEnd')!;
const graphicsQualityInput = document.querySelector<HTMLSelectElement>('#graphicsQuality')!;
try {
  const savedGraphics = JSON.parse(localStorage.getItem('new-dawn-graphics') ?? '{}') as { fogStart?: number; fogEnd?: number; quality?: string };
  fogStart = typeof savedGraphics.fogStart === 'number' ? savedGraphics.fogStart : fogStart;
  fogEnd = typeof savedGraphics.fogEnd === 'number' ? savedGraphics.fogEnd : fogEnd;
  graphicsQuality = savedGraphics.quality === 'low' || savedGraphics.quality === 'high' ? savedGraphics.quality : 'medium';
} catch {}
fogStartInput.value = String(fogStart);
fogEndInput.value = String(fogEnd);
graphicsQualityInput.value = graphicsQuality;
function persistGraphics() {
  localStorage.setItem('new-dawn-graphics', JSON.stringify({ fogStart, fogEnd, quality: graphicsQuality }));
  updateTerrainFog();
}
fogStartInput.addEventListener('input', () => { fogStart = Number(fogStartInput.value); persistGraphics(); });
fogEndInput.addEventListener('input', () => { fogEnd = Number(fogEndInput.value); persistGraphics(); });
graphicsQualityInput.addEventListener('change', () => {
  graphicsQuality = graphicsQualityInput.value as typeof graphicsQuality;
  renderer.shadowMap.enabled = graphicsQuality !== 'low';
  sun.shadow.mapSize.set(graphicsQuality === 'high' ? 2048 : graphicsQuality === 'medium' ? 1024 : 512, graphicsQuality === 'high' ? 2048 : graphicsQuality === 'medium' ? 1024 : 512);
  persistGraphics();
});

document.querySelectorAll<HTMLButtonElement>('#outfits button').forEach(button => button.addEventListener('click', () => {
  outfit = button.dataset.outfit as Outfit;
  appearance = { ...appearance, outfit };
  syncOutfitButtons();
  preview?.setAppearance(appearance);
}));

document.querySelector('#newGame')!.addEventListener('click', () => {
  seed = Number((document.querySelector('#worldSeed') as HTMLInputElement).value) || 1847;
  if (!safeSpawn(seed)) { toast('No safe spawn found for this seed. Try another.'); return; }
  enterImmersiveMode();
  characterName = (document.querySelector('#playerName') as HTMLInputElement).value.trim() || 'Survivor';
  npcAppearanceSeed = ((seed >>> 0) + 53917) >>> 0;
  resetWorld();
  startGame();
});
document.querySelector('#continueGame')!.addEventListener('click', () => { enterImmersiveMode(); void loadGame(); });
document.querySelector('#exportSave')!.addEventListener('click', () => { void exportSave(); });
document.querySelector('#importSave')!.addEventListener('click', () => document.querySelector<HTMLInputElement>('#importSaveFile')!.click());
document.querySelector<HTMLInputElement>('#importSaveFile')!.addEventListener('change', event => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) void importSave(file);
});
document.querySelector('#exitFullscreen')!.addEventListener('click', () => {
  if (document.fullscreenElement) void document.exitFullscreen().catch(error => console.warn('Could not exit fullscreen', error));
});
document.querySelector('#pauseButton')!.addEventListener('click', togglePause);
document.querySelector('#resumeGame')!.addEventListener('click', togglePause);
document.querySelector('#saveGame')!.addEventListener('click', () => saveGame(true));
document.querySelector('#returnMenu')!.addEventListener('click', () => location.reload());
document.querySelector('#closeBuild')!.addEventListener('click', cancelBuild);
document.querySelector('#inventoryButton')!.addEventListener('click', () => {
  if (paused || driving || buildMode || !document.querySelector('#npcPanel')!.classList.contains('hidden')
    || !document.querySelector('#smelterPanel')!.classList.contains('hidden')) return;
  releasePointerLock();
  document.querySelector('#toolStatus')!.textContent = `Tools: ${tools.join(', ') || 'none'}`;
  refreshTorchPanel();
  document.querySelector('#craftPanel')!.classList.toggle('hidden');
  clearMovement();
});
document.querySelector('#closeCraft')!.addEventListener('click', () => document.querySelector('#craftPanel')!.classList.add('hidden'));
document.querySelector('#terrainTool')!.addEventListener('click', enterTerrainTool);
document.querySelector('#roadTool')!.addEventListener('click', enterRoadTool);
document.querySelector('#paintTool')!.addEventListener('click', enterPaintTool);
document.querySelector('#terrainExit')!.addEventListener('click', exitToolModes);
document.querySelector('#roadExit')!.addEventListener('click', exitToolModes);
document.querySelector('#paintExit')!.addEventListener('click', exitToolModes);
document.querySelectorAll<HTMLButtonElement>('[data-terrain]').forEach(button => button.addEventListener('click', () => {
  terrainOperation = button.dataset.terrain as typeof terrainOperation;
  document.querySelectorAll('[data-terrain]').forEach(candidate => candidate.classList.toggle('selected', candidate === button));
  if (terrainOperation === 'slope') document.querySelector('#terrainStatus')!.textContent = 'Slope smoothing: drag to shape a ramp';
}));
document.querySelector('#terrainBrush')!.addEventListener('input', event => {
  terrainBrush = Number((event.target as HTMLInputElement).value);
  document.querySelector('#terrainStatus')!.textContent = `Brush radius ${terrainBrush}`;
});
document.querySelector('#terrainUndo')!.addEventListener('click', () => {
  const changes = terrainHistoryLimit.pop();
  if (!changes) { toast('No terrain edit to undo'); return; }
  world.undoTerrain(changes);
  toast('Terrain edit undone');
  void saveGame(false);
});
document.querySelectorAll<HTMLButtonElement>('[data-road]').forEach(button => button.addEventListener('click', () => {
  roadKind = button.dataset.road as RoadKind;
  document.querySelectorAll('[data-road]').forEach(candidate => candidate.classList.toggle('selected', candidate === button));
}));
document.querySelectorAll<HTMLButtonElement>('[data-paint]').forEach(button => button.addEventListener('click', () => {
  paintPreset = button.dataset.paint as PaintPreset;
  paintErase = false;
  document.querySelector('#paintStatus')!.textContent = `${paintColors[paintPreset].label} selected`;
}));
document.querySelector('#paintErase')!.addEventListener('click', () => {
  paintErase = true;
  document.querySelector('#paintStatus')!.textContent = 'Eraser selected';
});
document.querySelector('#paintBrush')!.addEventListener('input', event => {
  paintBrush = Number((event.target as HTMLInputElement).value);
});
document.querySelector('#paintUndo')!.addEventListener('click', () => {
  const previous = paintHistory.pop();
  if (!previous) { toast('No paint edit to undo'); return; }
  surfacePaint.splice(0, surfacePaint.length, ...previous);
  constructionRenderer.refresh(structures, surfacePaint);
  refreshPaintMarkers();
  void saveGame(false);
});
document.querySelectorAll<HTMLButtonElement>('[data-craft]').forEach(button => button.addEventListener('click', () => {
  const tool = button.dataset.craft as Tool;
  if (tools.includes(tool)) { toast('Already crafted'); return; }
  if (!craftTool(resources, tools, tool)) { toast('Not enough resources'); return; }
  updateResources();
  document.querySelector('#toolStatus')!.textContent = `Tools: ${tools.join(', ')}`;
  toast(`${tool} crafted`);
}));
function refreshTorchPanel() {
  document.querySelector('#torchStatus')!.textContent = !torch.crafted ? 'Torch: not crafted'
    : !torch.equipped ? 'Torch: unequipped' : torch.lit ? 'Torch: equipped and burning' : 'Torch: equipped and extinguished';
  const craft = document.querySelector<HTMLButtonElement>('#craftTorch')!;
  const equip = document.querySelector<HTMLButtonElement>('#equipTorch')!;
  const ignite = document.querySelector<HTMLButtonElement>('#igniteTorch')!;
  craft.disabled = torch.crafted;
  equip.disabled = !torch.crafted;
  ignite.disabled = !torch.equipped;
  equip.textContent = torch.equipped ? 'UNEQUIP TORCH' : 'EQUIP TORCH';
  ignite.textContent = torch.lit ? 'EXTINGUISH TORCH' : 'IGNITE TORCH';
}
document.querySelector('#craftTorch')!.addEventListener('click', () => {
  if (!craftTorch(torch, resources, mineralInventory)) { toast('Need 2 wood and 1 coal'); return; }
  updateResources();
  refreshTorchPanel();
  toast('Torch crafted');
  void saveGame(false);
});
document.querySelector('#equipTorch')!.addEventListener('click', () => {
  if (!toggleTorchEquipment(torch)) { toast('Craft a torch first'); return; }
  refreshTorchPanel();
  toast(torch.equipped ? 'Torch equipped' : 'Torch unequipped');
  void saveGame(false);
});
document.querySelector('#igniteTorch')!.addEventListener('click', () => {
  if (!toggleTorchFlame(torch)) { toast('Equip a torch first'); return; }
  refreshTorchPanel();
  toast(torch.lit ? 'Torch lit' : 'Torch extinguished');
  void saveGame(false);
});
function refreshSmelter() {
  const job = activeSmelter?.smelting;
  document.querySelector('#smelterStatus')!.textContent = job
    ? `Processing ${job.ore}: ${Math.ceil(job.remaining)} seconds remaining.`
    : `Ready. Iron: ${ingots.iron} · Copper: ${ingots.copper} · Glass: ${ingots.glass}`;
}
document.querySelector('#closeSmelter')!.addEventListener('click', () => document.querySelector('#smelterPanel')!.classList.add('hidden'));
document.querySelectorAll<HTMLButtonElement>('[data-smelt]').forEach(button => button.addEventListener('click', () => {
  if (!activeSmelter) return;
  if (activeSmelter.smelting) { toast('Smelter is busy'); return; }
  const job = startSmelting(mineralInventory, activeSmelter.smelting, button.dataset.smelt as SmeltableOre);
  if (!job) { toast('Need 2 material and 1 coal'); return; }
  activeSmelter.smelting = job;
  updateResources();
  refreshSmelter();
  toast('Smelting started');
  void saveGame(false);
}));
document.querySelector('#forgePickaxe')!.addEventListener('click', () => {
  if (ironPickaxe) { toast('Iron pickaxe already forged'); return; }
  if (!tools.includes('pickaxe')) { toast('Craft a basic pickaxe first'); return; }
  if (ingots.iron < 2 || resources.wood < 2) { toast('Need 2 iron ingots and 2 wood'); return; }
  ingots.iron -= 2;
  resources.wood -= 2;
  ironPickaxe = true;
  updateResources();
  refreshSmelter();
  toast('Iron pickaxe forged');
  void saveGame(false);
});
document.querySelector('#npcRecruit')!.addEventListener('click', () => {
  npcState.recruited = true;
  toast('Mira joined your settlement');
  refreshNpcPanel();
  updateObjective();
});
document.querySelectorAll<HTMLButtonElement>('[data-job]').forEach(button => button.addEventListener('click', () => {
  if (!npcState.recruited) { toast('Recruit Mira first'); return; }
  npcState.job = button.dataset.job as NpcJob;
  refreshNpcPanel();
  updateObjective();
}));
document.querySelector('#closeNpc')!.addEventListener('click', () => document.querySelector('#npcPanel')!.classList.add('hidden'));

function refreshNpcPanel() {
  document.querySelector('#npcStatus')!.textContent = npcState.recruited
    ? `Assigned: ${npcState.job}. ${npcState.carrying ? `Carrying ${npcState.carrying}.` : 'Build storage for deliveries.'}`
    : 'A friendly survivor. Recruit Mira to assign a gathering task.';
  (document.querySelector('#npcRecruit') as HTMLButtonElement).disabled = npcState.recruited;
}

const catalog: Array<{ kind: BuildKind; name: string; cost: Partial<Resources>; icon: string }> = [
  { kind: 'floor', name: 'Wood floor', cost: pieceCosts.floor, icon: '▦' },
  { kind: 'wall', name: 'Wood wall', cost: pieceCosts.wall, icon: '▤' },
  { kind: 'doorframe', name: 'Door frame', cost: pieceCosts.doorframe, icon: '⊓' },
  { kind: 'door', name: 'Wood door', cost: pieceCosts.door, icon: '▯' },
  { kind: 'windowframe', name: 'Window frame', cost: pieceCosts.windowframe, icon: '⊞' },
  { kind: 'window', name: 'Glass window', cost: pieceCosts.window, icon: '◫' },
  { kind: 'roof', name: 'Wood roof', cost: pieceCosts.roof, icon: '▱' },
  { kind: 'stairs', name: 'Wood stairs', cost: pieceCosts.stairs, icon: '◢' },
  { kind: 'shelter', name: 'Shelter', cost: buildingCosts.shelter, icon: '⌂' },
  { kind: 'storage', name: 'Storage', cost: buildingCosts.storage, icon: '▣' },
  { kind: 'lamp', name: 'Lamp', cost: buildingCosts.lamp, icon: '◉' },
  { kind: 'generator', name: 'Generator', cost: buildingCosts.generator, icon: '⚙' },
  { kind: 'turbine', name: 'Wind Turbine', cost: buildingCosts.turbine, icon: '✣' },
  { kind: 'battery', name: 'Battery', cost: buildingCosts.battery, icon: '▰' },
  { kind: 'cable', name: 'Cable post', cost: buildingCosts.cable, icon: '⌁' },
  { kind: 'smelter', name: 'Smelter', cost: buildingCosts.smelter, icon: '♨' },
  { kind: 'torchpost', name: 'Wooden Torch Post', cost: buildingCosts.torchpost, icon: '♨' },
];
const buildCatalog = document.querySelector('#buildCatalog')!;
catalog.forEach(item => {
  const button = document.createElement('button');
  button.dataset.building = item.kind;
  button.innerHTML = `<span>${item.icon}</span><strong>${item.name}</strong><small>${item.cost.wood ? `${item.cost.wood} wood ` : ''}${item.cost.stone ? `${item.cost.stone} stone ` : ''}${item.kind === 'window' ? '1 glass' : ''}</small>`;
  button.addEventListener('click', () => selectBuild(item.kind));
  buildCatalog.append(button);
});

function resetWorld() {
  scene.remove(world.group);
  world.dispose();
  world = new World(seed, renderDistance);
  scene.add(world.group);
  scene.remove(player);
  scene.remove(npc);
  disposeCharacter(player);
  disposeCharacter(npc);
  npc = createCharacter(appearanceFromSeed(npcAppearanceSeed));
  useAuthoredCharacter(npc, appearanceFromSeed(npcAppearanceSeed));
  scene.add(npc);
  buildings.forEach((building, index) => {
    scene.remove(building);
    if (buildingRecords[index]?.kind !== 'torchpost') return;
    building.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => material.dispose());
    });
  });
  buildings.length = 0;
  buildingRecords.length = 0;
  visiblePostLights = [];
  postLightTimer = 0;
  postLights.forEach(light => { light.intensity = 0; });
  structures.length = 0;
  pendingRoofs.clear();
  roads.splice(0, roads.length);
  surfacePaint.splice(0, surfacePaint.length);
  refreshRoads();
  constructionRenderer.refresh(structures, surfacePaint);
  autoRoof = true;
  roofStyle = 'flat';
  roofAxis = 'auto';
  (document.querySelector('#autoRoof') as HTMLInputElement).checked = true;
  (document.querySelector('#roofStyle') as HTMLSelectElement).value = roofStyle;
  (document.querySelector('#roofAxis') as HTMLSelectElement).value = roofAxis;
  constructionRenderer.refresh(structures, surfacePaint);
  updatePowerLines();
  enemies.forEach(enemy => { scene.remove(enemy); disposeCharacter(enemy); });
  enemies.length = 0;
  enemyProjectiles.forEach(projectile => scene.remove(projectile.mesh));
  enemyProjectiles.length = 0;
  spawnCooldown = 0;
  enemyHitCooldown = 0;
  Object.assign(resources, { wood: 0, stone: 0, food: 3, water: 3 });
  Object.assign(mineralInventory, emptyMinerals());
  Object.assign(ingots, { iron: 0, copper: 0, glass: 0 });
  ironPickaxe = false;
  activeSmelter = null;
  document.querySelector('#smelterPanel')!.classList.add('hidden');
  tools.length = 0;
  Object.assign(torch, { crafted: false, equipped: false, lit: false });
  Object.assign(npcState, { recruited: false, job: 'idle', carrying: null });
  health = 100;
  const spawn = safeSpawn(seed)!;
  resetWildlife(createWildlife(seed, spawn));
  npc.position.set(spawn.x - 4, world.heightAt(spawn.x - 4, spawn.z - 3), spawn.z - 3);
  vehicle.position.set(spawn.x + 8, world.heightAt(spawn.x + 8, spawn.z - 1), spawn.z - 1);
  player = createCharacter(appearance);
  useAuthoredCharacter(player, appearance);
  handTorch = createHandTorch();
  attachHandTorch(player, handTorch.group);
  player.position.set(spawn.x, world.heightAt(spawn.x, spawn.z), spawn.z);
  player.rotation.y = Math.PI + cameraAngle;
  scene.add(player);
  cameraReady = false;
  driving = false;
  vehicleSpeed = 0;
  document.querySelector('#hud')!.classList.remove('driving');
  document.querySelector('#vehicleIndicator')!.classList.add('hidden');
  updateResources();
  updateObjective();
  day = 1;
  gameMinutes = 360;
}

function startGame() {
  preview?.dispose();
  preview = undefined;
  gameStarted = true;
  paused = false;
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  document.querySelector('#menu')!.classList.remove('active');
  document.querySelector('#hud')!.classList.remove('hidden');
  document.querySelector('#pausePanel')!.classList.add('hidden');
  document.querySelector('#survivorLabel')!.textContent = characterName;
  updateCameraHint();
  toast('Find wood and stone to begin');
}

function togglePause() {
  if (!gameStarted || updatePending) return;
  paused = !paused;
  if (paused) {
    releasePointerLock();
    document.querySelector('#npcPanel')!.classList.add('hidden');
    document.querySelector('#craftPanel')!.classList.add('hidden');
    document.querySelector('#smelterPanel')!.classList.add('hidden');
  }
  clearMovement();
  document.querySelector('#pausePanel')!.classList.toggle('hidden', !paused);
}

function clearMovement() {
  keys.clear();
  move.set(0, 0);
  stickPointer = null;
  stick.style.transform = 'translate(0, 0)';
  accelerateTouch = false;
  brakeTouch = false;
}

function exitToolModes() {
  toolMode = 'normal';
  document.querySelector('#terrainToolbar')!.classList.add('hidden');
  document.querySelector('#roadToolbar')!.classList.add('hidden');
  document.querySelector('#paintToolbar')!.classList.add('hidden');
  document.querySelector('#hud')!.classList.remove('building');
  updateCameraHint();
}

function enterTerrainTool() {
  if (!gameStarted || driving) return;
  releasePointerLock();
  toolMode = 'terrain';
  document.querySelector('#roadToolbar')!.classList.add('hidden');
  document.querySelector('#paintToolbar')!.classList.add('hidden');
  document.querySelector('#terrainToolbar')!.classList.remove('hidden');
  toast('Terrain tool active');
}

function enterRoadTool() {
  if (!gameStarted || driving) return;
  releasePointerLock();
  toolMode = 'road';
  document.querySelector('#terrainToolbar')!.classList.add('hidden');
  document.querySelector('#paintToolbar')!.classList.add('hidden');
  document.querySelector('#roadToolbar')!.classList.remove('hidden');
  toast('Road tool active');
}

function enterPaintTool() {
  if (!gameStarted || driving) return;
  releasePointerLock();
  toolMode = 'paint';
  document.querySelector('#terrainToolbar')!.classList.add('hidden');
  document.querySelector('#roadToolbar')!.classList.add('hidden');
  document.querySelector('#paintToolbar')!.classList.remove('hidden');
  toast('Paint tool active');
}

function terrainPoint(clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect();
  const pointer = new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1);
  placementRay.setFromCamera(pointer, camera);
  const hit = world.intersectTerrain(placementRay);
  return hit ? new THREE.Vector3(hit.x, hit.y, hit.z) : null;
}

let terrainApplyCooldown = 0;
function applyTerrainAtClient(clientX: number, clientY: number) {
  if (performance.now() - terrainApplyCooldown < 180) return;
  const point = terrainPoint(clientX, clientY);
  if (!point) { document.querySelector('#terrainStatus')!.textContent = 'Point at the terrain'; return; }
  if (structures.some(piece => Math.hypot(piece.x - point.x, piece.z - point.z) < 2.2)
    || buildingRecords.some(record => Math.hypot(record.x - point.x, record.z - point.z) < buildingRadius(record.kind) + 1)
    || roads.some(road => Math.hypot(road.x - point.x, road.z - point.z) < 2)) {
    document.querySelector('#terrainStatus')!.textContent = 'Protected construction or road';
    return;
  }
  if (terrainOperation === 'flatten') terrainTargetHeight = world.heightAt(point.x, point.z);
  const changes = world.editTerrain(point.x, point.z, terrainBrush, terrainOperation === 'slope' ? 'smooth' : terrainOperation, terrainTargetHeight);
  if (changes.length) {
    terrainHistoryLimit.push(changes);
    if (terrainHistoryLimit.length > 20) terrainHistoryLimit.shift();
    document.querySelector('#terrainStatus')!.textContent = `${terrainOperation.toUpperCase()} · ${changes.length} vertices`;
  } else {
    document.querySelector('#terrainStatus')!.textContent = 'No terrain change at this elevation';
  }
  terrainApplyCooldown = performance.now();
  void saveGame(false);
}

const roadMeshes = new THREE.Group();
scene.add(roadMeshes);

function roadMesh(segment: RoadSegment) {
  const group = new THREE.Group();
  const layout = connectionLayout(segment.x, segment.z, roads);
  segment.rotation = layout.rotation;
  group.position.set(segment.x, segment.height + 0.035, segment.z);
  group.rotation.y = segment.rotation;
  const surfaceColor = segment.kind === 'dirt' ? '#8d7657' : segment.kind === 'gravel' ? '#77756b' : '#686e68';
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshStandardMaterial({
    color: surfaceColor, roughness: 0.96,
  }));
  surface.rotation.x = -Math.PI / 2;
  surface.receiveShadow = true;
  surface.name = 'road-surface';
  group.add(surface);
  if (layout.shape !== 'straight') {
    const shoulder = new THREE.Mesh(new THREE.RingGeometry(0.35, 1.08, 12, 1, 0, layout.shape === 'junction' ? Math.PI * 2 : Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: surfaceColor, roughness: 1 }));
    shoulder.rotation.x = -Math.PI / 2;
    shoulder.position.y = 0.006;
    shoulder.name = 'road-shoulder';
    group.add(shoulder);
  }
  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.035, 2), new THREE.MeshStandardMaterial({ color: '#b7ad8c', roughness: 1 }));
    edge.position.set(side * 0.82, 0.025, 0);
    edge.receiveShadow = true;
    group.add(edge);
  }
  return group;
}

function refreshRoads() {
  for (const model of roadModels.values()) {
    roadMeshes.remove(model);
    model.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => material.dispose());
    });
  }
  roadModels.clear();
  for (const segment of roads) {
    const model = roadMesh(segment);
    roadModels.set(segment.id, model);
    roadMeshes.add(model);
  }
}

function placeRoadAtClient(clientX: number, clientY: number) {
  const point = terrainPoint(clientX, clientY);
  if (!point) { document.querySelector('#roadStatus')!.textContent = 'Point at the terrain'; return; }
  const x = Math.round(point.x / 2) * 2;
  const z = Math.round(point.z / 2) * 2;
  if (roads.some(segment => segment.x === x && segment.z === z)) { document.querySelector('#roadStatus')!.textContent = 'Road already placed here'; return; }
  if (structures.some(piece => Math.hypot(piece.x - x, piece.z - z) < 2)
    || buildingRecords.some(record => Math.hypot(record.x - x, record.z - z) < buildingRadius(record.kind) + 0.5)) {
    document.querySelector('#roadStatus')!.textContent = 'Keep roads away from buildings';
    return;
  }
  const cost = roadCosts[roadKind];
  if (resources.stone < cost.stone) { document.querySelector('#roadStatus')!.textContent = 'Not enough stone'; return; }
  if (cost.stone) resources.stone -= cost.stone;
  world.editTerrain(x, z, 1.4, 'flatten', world.heightAt(x, z));
  const segment: RoadSegment = { id: `road-${x}-${z}-${roads.length}`, kind: roadKind, x, z, height: world.heightAt(x, z), rotation: 0, width: 2 };
  roads.push(segment);
  refreshRoads();
  updateResources();
  document.querySelector('#roadStatus')!.textContent = `${roadKind} road placed`;
  void saveGame(false);
}

const paintMarkers = new THREE.Group();
scene.add(paintMarkers);

function refreshPaintMarkers() {
  for (const child of [...paintMarkers.children]) {
    paintMarkers.remove(child);
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      (Array.isArray(child.material) ? child.material : [child.material]).forEach(material => material.dispose());
    }
  }
  for (const paint of surfacePaint) {
    const piece = structures.find(candidate => candidate.id === paint.pieceId);
    if (!piece) continue;
    for (const stroke of paint.strokes) {
      if (stroke.erase) continue;
      const marker = new THREE.Mesh(new THREE.CircleGeometry(stroke.size * 0.5, 8),
        new THREE.MeshBasicMaterial({ color: stroke.color, side: THREE.DoubleSide, depthWrite: false }));
      marker.position.set(piece.x + (stroke.x - 0.5) * 1.8, piece.y + 0.3 + stroke.y * 1.8, piece.z + 0.09);
      marker.rotation.y = (piece.rotation * Math.PI) / 2;
      paintMarkers.add(marker);
    }
  }
}

function paintAtClient(clientX: number, clientY: number) {
  const point = terrainPoint(clientX, clientY);
  if (!point) { document.querySelector('#paintStatus')!.textContent = 'Aim at a wall or floor'; return; }
  const candidates = structures.filter(piece => piece.kind === 'wall' || piece.kind === 'floor' || piece.kind === 'door' || piece.kind === 'roof')
    .map(piece => ({ piece, distance: Math.hypot(piece.x - point.x, piece.z - point.z) }))
    .sort((a, b) => a.distance - b.distance);
  const nearest = candidates[0];
  if (!nearest || nearest.distance > 1.8) { document.querySelector('#paintStatus')!.textContent = 'No paintable surface nearby'; return; }
  const piece = nearest.piece;
  let paint = surfacePaint.find(item => item.pieceId === piece.id);
  if (!paint) {
    paint = { pieceId: piece.id, surface: piece.kind === 'floor' || piece.kind === 'roof' ? 'floor' : 'front',
      color: paintColors[paintPreset].color, strokes: [] };
    surfacePaint.push(paint);
  }
  const color = paintErase ? '#000000' : paintColors[paintPreset].color;
  paint.color = paintErase ? paint.color : color;
  const strokeX = THREE.MathUtils.clamp(0.5 + (point.x - piece.x) / 1.8, 0, 1);
  const strokeY = THREE.MathUtils.clamp(0.5 + (point.y - piece.y - 0.3) / 1.8, 0, 1);
  paint.strokes.push({ x: strokeX, y: strokeY, color, size: paintBrush / 20, erase: paintErase });
  if (paint.strokes.length > 500) paint.strokes.shift();
  paintHistory.push(surfacePaint.map(item => ({ ...item, strokes: item.strokes.map(stroke => ({ ...stroke })) })));
  if (paintHistory.length > 20) paintHistory.shift();
  constructionRenderer.refresh(structures, surfacePaint);
  refreshPaintMarkers();
  document.querySelector('#paintStatus')!.textContent = paintErase ? 'Paint erased' : `Painted ${paintColors[paintPreset].label}`;
  void saveGame(false);
}

function gameplayBlocked() {
  return paused || updatePending || !document.querySelector('#buildPanel')!.classList.contains('hidden')
    || !document.querySelector('#craftPanel')!.classList.contains('hidden')
    || !document.querySelector('#smelterPanel')!.classList.contains('hidden')
    || !document.querySelector('#npcPanel')!.classList.contains('hidden')
    || !document.querySelector('#updatePanel')!.classList.contains('hidden');
}

function toggleBuild() {
  if (!gameStarted || driving || gameplayBlocked()) return;
  if (buildMode) { cancelBuild(); return; }
  releasePointerLock();
  buildMode = true;
  document.querySelector('#craftPanel')!.classList.add('hidden');
  document.querySelector('#npcPanel')!.classList.add('hidden');
  document.querySelector('#hud')!.classList.add('building');
  document.querySelector('#actionA span')!.textContent = 'Place';
  document.querySelector('#actionB span')!.textContent = 'Cancel';
  showBuildCatalog();
}

function showBuildCatalog() {
  if (!buildMode || gameplayBlocked()) return;
  clearMovement();
  document.querySelector('#buildPanel')!.classList.remove('hidden');
  document.querySelector('#placementToolbar')!.classList.add('hidden');
  if (buildGhost) buildGhost.visible = false;
}

function cancelBuild() {
  buildMode = false;
  clearMovement();
  placementTouch = null;
  cameraPointers.clear();
  leftClickStart = null;
  document.querySelector('#buildPanel')!.classList.add('hidden');
  document.querySelector('#placementToolbar')!.classList.add('hidden');
  document.querySelector('#hud')!.classList.remove('building');
  document.querySelector('#actionA span')!.textContent = 'Gather';
  document.querySelector('#actionB span')!.textContent = 'Interact';
  removeGhost();
}

function rotateBuild() {
  if (gameplayBlocked() || !buildGhost) return;
  buildRotation += Math.PI / 2;
  if (isPieceKind(buildKind) && isEdgePiece(buildKind)) manualBuildOrientation = true;
  if (isPieceKind(buildKind)) updateBuildTarget(buildAim.x, buildAim.y);
}

function changeFloor(delta: number) {
  if (gameplayBlocked() || !buildGhost || !isPieceKind(buildKind)) return;
  buildLevel = THREE.MathUtils.clamp(buildLevel + delta, 0, 3);
  document.querySelector('#floorLevel')!.textContent = `LEVEL ${buildLevel}`;
  updateBuildTarget(buildAim.x, buildAim.y);
}

function updateBuildTarget(x: number, z: number) {
  buildAim.set(x, z);
  if (!isPieceKind(buildKind)) {
    x = Math.round(x);
    z = Math.round(z);
    buildTarget.set(x, world.heightAt(x, z), z);
    return;
  }
  if (isEdgePiece(buildKind) && !manualBuildOrientation) {
    const targetKinds: PieceKind[] = buildKind === 'door' ? ['doorframe'] : buildKind === 'window' ? ['windowframe']
      : (['wall', 'doorframe', 'windowframe'] as PieceKind[]).filter(kind => kind !== buildKind);
    // Include the furthest terrain point that can snap to the frame's two-unit grid slot.
    const targetRadius = buildKind === 'door' || buildKind === 'window' ? Math.SQRT2 + 0.01 : 0.75;
    const existing = structures
      .filter(piece => targetKinds.includes(piece.kind) && piece.level === buildLevel && Math.hypot(piece.x - x, piece.z - z) <= targetRadius)
      .sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z)
        || a.x - b.x || a.z - b.z || a.rotation - b.rotation)[0];
    const edge = existing ?? suggestFloorEdge(x, z, buildLevel, structures);
    if (edge) {
      buildRotation = edge.rotation * Math.PI / 2;
      buildTarget.set(edge.x, edge.y, edge.z);
      return;
    }
  }
  const rotation = (Math.round(buildRotation / (Math.PI / 2)) % 2) as PieceRotation;
  const snapped = snapPiece(buildKind, x, z, rotation);
  const anchor = structures
    .filter(piece => Math.hypot(piece.x - snapped.x, piece.z - snapped.z) <= 3.1)
    .sort((a, b) => Math.hypot(a.x - snapped.x, a.z - snapped.z) - Math.hypot(b.x - snapped.x, b.z - snapped.z))[0];
  const base = anchor ? anchor.y - anchor.level * FLOOR_HEIGHT : Math.round(world.heightAt(snapped.x, snapped.z) * 4) / 4;
  buildTarget.set(snapped.x, base + buildLevel * FLOOR_HEIGHT, snapped.z);
}

function selectedPiece(): StructuralPiece {
  if (!isPieceKind(buildKind)) throw new Error('No structural piece selected');
  return {
    id: 'preview', kind: buildKind, x: buildTarget.x, z: buildTarget.z, y: buildTarget.y,
    level: buildLevel, rotation: (isEdgePiece(buildKind) ? Math.round(buildRotation / (Math.PI / 2)) % 2
      : buildKind === 'stairs' ? Math.round(buildRotation / (Math.PI / 2)) % 4 : 0) as PieceRotation,
    open: false,
  };
}

function newPieceId() {
  return Array.from(crypto.getRandomValues(new Uint32Array(4)), value => value.toString(16).padStart(8, '0')).join('');
}

function removeTargetPiece() {
  if (!buildGhost || gameplayBlocked() || !isPieceKind(buildKind)) return;
  const target = selectedPiece();
  const piece = structures.find(other => other.x === target.x && other.z === target.z
    && Math.abs(other.y - target.y) < 0.05 && other.kind === target.kind && other.rotation === target.rotation);
  if (!piece) { toast('Select the same piece and aim at it to remove'); return; }
  if (!removePiece(piece.id, structures, resources)) {
    toast(piece.kind === 'windowframe' ? 'Remove the glass before its frame' : 'Remove the door before its frame');
    return;
  }
  const removedId = piece.id;
  surfacePaint.splice(0, surfacePaint.length, ...surfacePaint.filter(paint => paint.pieceId !== removedId));
  refreshPaintMarkers();
  const roofMessage = piece.kind === 'wall' || piece.kind === 'doorframe' || piece.kind === 'windowframe' ? reconcileRoofs(piece) : null;
  constructionRenderer.refresh(structures, surfacePaint);
  updateResources();
  updatePlacement();
  toast(roofMessage ?? 'Piece removed; half its materials returned');
  void saveGame(false);
}

function roofKey(request: RoofRequest) {
  return `${request.level}:${request.y.toFixed(4)}`;
}

function reconcileRoofs(changed: RoofRequest) {
  const key = roofKey(changed);
  const request = pendingRoofs.get(key) ?? { y: changed.y, level: changed.level, style: roofStyle, axis: roofAxis };
  const result = reconcileRoof(structures, resources, request, autoRoof, newPieceId);
  if (result.status === 'insufficient' || result.status === 'limit') pendingRoofs.set(key, request);
  else if (result.status !== 'disabled') pendingRoofs.delete(key);
  if (result.status === 'too-large') return 'Room too large for automatic roofing';
  if (result.status === 'limit') return 'Structural piece limit prevents roofing';
  if (result.status === 'insufficient') return `Room enclosed; need ${result.required} wood for its roof`;
  if (result.status === 'built') return result.flatFallback ? `Room roofed · ${result.spent} wood · flat fallback (existing structures)`
    : result.fallback ? `Room roofed · ${result.spent} wood · irregular footprint uses single slope` : `Room roofed · ${result.spent} wood`;
  return null;
}

function retryPendingRoofs() {
  if (!autoRoof || !pendingRoofs.size) return;
  const pendingCount = pendingRoofs.size;
  let changed = false;
  for (const request of [...pendingRoofs.values()]) {
    const before = structures.slice();
    const message = reconcileRoofs(request);
    if (structures.length !== before.length || structures.some((piece, index) => piece !== before[index])) {
      changed = true;
      if (message) toast(message);
    }
  }
  if (changed) {
    constructionRenderer.refresh(structures, surfacePaint);
    updatePlacement();
  }
  if (changed || pendingRoofs.size !== pendingCount) {
    void saveGame(false);
  }
}

function selectBuild(kind: BuildKind) {
  if (!buildMode) return;
  buildKind = kind;
  manualBuildOrientation = false;
  removeGhost();
  buildGhost = isPieceKind(kind) ? createPieceGhost(kind) : createBuilding(kind);
  ghostMaterial = new THREE.MeshBasicMaterial({ color: '#85d6ad', transparent: true, opacity: 0.48, depthWrite: false, toneMapped: false });
  const originalMaterials = new Set<THREE.Material>();
  buildGhost.traverse(object => {
    if (object instanceof THREE.Mesh) {
      (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => originalMaterials.add(material));
      object.material = ghostMaterial!;
      object.castShadow = false;
    }
    if (object instanceof THREE.Light) object.visible = false;
  });
  originalMaterials.forEach(material => material.dispose());
  const radius = isPieceKind(kind) ? 0.95 : buildingRadius(kind);
  placementFootprint = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.88, radius, 48),
    new THREE.MeshBasicMaterial({ color: '#a6ffce', side: THREE.DoubleSide, depthTest: false, transparent: true, opacity: 0.95 }),
  );
  placementFootprint.rotation.x = -Math.PI / 2;
  placementFootprint.position.y = 0.12;
  placementFootprint.renderOrder = 10;
  buildGhost.add(placementFootprint);
  const x = Math.round(player.position.x + Math.sin(player.rotation.y) * 3.5);
  const z = Math.round(player.position.z + Math.cos(player.rotation.y) * 3.5);
  updateBuildTarget(x, z);
  buildGhost.position.copy(buildTarget);
  targetOnTerrain = true;
  scene.add(buildGhost);
  if (document.activeElement instanceof HTMLElement && document.querySelector('#buildPanel')!.contains(document.activeElement)) document.activeElement.blur();
  document.querySelector('#buildPanel')!.classList.add('hidden');
  document.querySelector('#placementToolbar')!.classList.remove('hidden');
  document.querySelector('#floorControls')!.classList.toggle('hidden', !isPieceKind(kind));
  document.querySelector('#roofControls')!.classList.toggle('hidden', !isPieceKind(kind));
  document.querySelector('#autoOrient')!.classList.toggle('hidden', !isPieceKind(kind) || !isEdgePiece(kind));
  document.querySelector('#floorLevel')!.textContent = `LEVEL ${buildLevel}`;
  const item = catalog.find(entry => entry.kind === kind)!;
  document.querySelector('#placementName')!.textContent = `${item.name} · ${Object.entries(item.cost).map(([resource, amount]) => `${amount} ${resource}`).join(' / ')}${kind === 'window' ? ' / 1 glass' : ''}`;
  updatePlacement();
}

function removeGhost() {
  if (buildGhost) {
    scene.remove(buildGhost);
    buildGhost.traverse(object => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
    ghostMaterial?.dispose();
    if (placementFootprint?.material instanceof THREE.Material) placementFootprint.material.dispose();
  }
  buildGhost = null;
  ghostMaterial = null;
  placementFootprint = null;
}

function aimBuilding(clientX: number, clientY: number) {
  if (!buildGhost || gameplayBlocked()) return false;
  if (pointerOverHud(clientX, clientY)) {
    targetOnTerrain = false;
    updatePlacement();
    return false;
  }
  const rect = canvas.getBoundingClientRect();
  placementPointer.set((clientX - rect.left) / rect.width * 2 - 1, -(clientY - rect.top) / rect.height * 2 + 1);
  placementRay.setFromCamera(placementPointer, camera);
  const point = world.intersectTerrain(placementRay);
  targetOnTerrain = Boolean(point);
  if (point) {
    updateBuildTarget(point.x, point.z);
  }
  updatePlacement();
  return targetOnTerrain;
}

function pointerOverHud(x: number, y: number) {
  return [...document.querySelectorAll<HTMLElement>('#minimap, #objective, #resources, .vitals, .time-card, #placementToolbar')]
    .some(element => {
      if (!element.getClientRects().length) return false;
      const rect = element.getBoundingClientRect();
      return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    });
}

function placementIssue() {
  if (!targetOnTerrain) return 'Point at the terrain';
  if (isPieceKind(buildKind)) {
    const piece = selectedPiece();
    if (structures.length >= 10000 && !replacementTarget(piece, structures)) return 'Structural piece limit reached';
    const ground = world.heightAt(piece.x, piece.z);
    if (ground <= 0.15) return 'Choose dry ground';
    if (buildingRecords.some(other => Math.hypot(piece.x - other.x, piece.z - other.z) < buildingRadius(other.kind) + 1)) return 'Too close to another building';
    if (pieceBlocks(piece, player.position.x, player.position.y, player.position.z)
      || pieceBlocks(piece, npc.position.x, npc.position.y, npc.position.z)) return 'Move away from the character';
    if (Math.hypot(piece.x - vehicle.position.x, piece.z - vehicle.position.z) < 1.5 && Math.abs(piece.y - vehicle.position.y) < 2) return 'Move away from the rover';
    if (world.findNearest(piece.x, piece.z, 1) || world.findNearestDeposit(piece.x, piece.z, 1)) return 'Clear nearby resources';
    const structuralProblem = replacementProblem(piece, structures, resources);
    if (structuralProblem) return structuralProblem;
    return piece.kind === 'window' && ingots.glass < 1 ? 'Need 1 glass' : null;
  }
  const problem = placementProblem(buildTarget, buildKind, buildTarget.y, buildingRecords, player.position);
  if (problem) return problem;
  const footprint = buildingRadius(buildKind);
  if (structures.some(piece => Math.hypot(piece.x - buildTarget.x, piece.z - buildTarget.z) < footprint + 1)) return 'Too close to another building';
  if (Math.hypot(buildTarget.x - npc.position.x, buildTarget.z - npc.position.z) < footprint + 0.6) return 'Move away from Mira';
  if (Math.hypot(buildTarget.x - vehicle.position.x, buildTarget.z - vehicle.position.z) < footprint + 1.2) return 'Move away from the rover';
  if (world.findNearest(buildTarget.x, buildTarget.z, footprint + 0.45) || world.findNearestDeposit(buildTarget.x, buildTarget.z, footprint + 0.45)) return 'Clear nearby resources';
  const radius = footprint * 0.7;
  const heights = [[radius, 0], [-radius, 0], [0, radius], [0, -radius]]
    .map(([x, z]) => world.heightAt(buildTarget.x + x, buildTarget.z + z));
  if (Math.max(...heights, buildTarget.y) - Math.min(...heights, buildTarget.y) > 1.5) return 'Ground is too steep';
  if (!canAfford(resources, buildingCosts[buildKind])) return 'Not enough resources';
  return null;
}

function updatePlacement() {
  if (!buildGhost || !ghostMaterial || !placementFootprint) return;
  const problem = placementIssue();
  ghostMaterial.color.set(problem ? '#ed756e' : '#85d6ad');
  (placementFootprint.material as THREE.MeshBasicMaterial).color.set(problem ? '#ff8b82' : '#a6ffce');
  const status = document.querySelector('#placementStatus')!;
  const replacement = isPieceKind(buildKind) ? replacementTarget(selectedPiece(), structures) : undefined;
  const message = problem ?? (replacement ? `Replace ${replacement.kind} · cost 2 wood · refund 1 wood` : 'Ready to place');
  if (status.textContent !== message) status.textContent = message;
  status.classList.toggle('invalid', Boolean(problem));
  const coordinates = document.querySelector('#placementCoordinates')!;
  const grid = `Grid ${buildTarget.x}, ${buildTarget.z}${isPieceKind(buildKind) ? ` · Level ${buildLevel} · Elev ${buildTarget.y.toFixed(2)}` : ''}`;
  if (coordinates.textContent !== grid) coordinates.textContent = grid;
}

function createBuilding(kind: BuildingKind) {
  if (kind === 'storage') return createStorage();
  if (kind === 'lamp') return createLamp();
  if (kind === 'generator') return createGenerator();
  if (kind === 'turbine') return createWindTurbine();
  if (kind === 'battery') return createBattery();
  if (kind === 'cable') return createCable();
  if (kind === 'smelter') return createSmelter();
  if (kind === 'torchpost') return createTorchPost();
  return createShelter();
}

function placeBuilding() {
  if (!buildGhost || gameplayBlocked()) return;
  const item = catalog.find(entry => entry.kind === buildKind)!;
  const problem = placementIssue();
  if (problem) { toast(problem); return; }
  if (isPieceKind(buildKind)) {
    const piece = { ...selectedPiece(), id: newPieceId() };
    const replacing = Boolean(replacementTarget(piece, structures));
    if (!(replacing ? replacePiece(piece, structures, resources) : addPiece(piece, structures, resources))) { toast('Cannot place this piece'); return; }
    if (piece.kind === 'window') ingots.glass--;
    const roofMessage = piece.kind === 'wall' || piece.kind === 'doorframe' || piece.kind === 'windowframe' ? reconcileRoofs(piece) : null;
    constructionRenderer.refresh(structures, surfacePaint);
    animationAction = 'build';
    animationActionTime = 0.6;
    effects.burst(buildTarget, 'build');
    updateResources();
    updatePlacement();
    toast(roofMessage ?? `${item.name} ${replacing ? 'replaced' : 'constructed'}`);
    void saveGame(false);
    return;
  }
  if (!spend(resources, item.cost)) { toast('Not enough resources'); return; }
  const building = createBuilding(buildKind);
  animationAction = 'build';
  animationActionTime = 0.6;
  building.position.copy(buildTarget);
  building.rotation.y = buildRotation;
  scene.add(building);
  buildings.push(building);
  buildingRecords.push({ kind: buildKind, x: building.position.x, z: building.position.z, y: building.position.y, rotation: buildRotation, charge: 0, powered: false,
    ...(buildKind === 'torchpost' ? { id: newPieceId(), lit: false } : {}) });
  postLightTimer = 0;
  effects.burst(building.position, 'build');
  updatePowerLines();
  updateResources();
  updatePlacement();
  toast(`${item.name} constructed`);
  updateObjective();
  saveGame(false);
}

function gather() {
  if (!gameStarted || gameplayBlocked() || driving || buildMode) return;
  const enemy = enemies.find(item => item.position.distanceTo(player.position) < 2.8);
  if (enemy) {
    if (attackCooldown > 0) return;
    attackCooldown = 0.6;
    animationAction = 'attack';
    animationActionTime = 0.5;
    enemy.userData.health = (enemy.userData.health as number) - 1;
    enemy.userData.hurtAnimation = 0.35;
    effects.burst(enemy.position, 'damage');
    if (enemy.userData.health <= 0) {
      scene.remove(enemy);
      disposeCharacter(enemy);
      enemies.splice(enemies.indexOf(enemy), 1);
      toast(`${enemy.userData.enemyKind as string} defeated`);
    } else toast('Hit!');
    return;
  }
  const animal = wildlife.find(item => Math.hypot(item.x - player.position.x, item.z - player.position.z) < 2);
  if (animal) {
    if (attackCooldown > 0) return;
    attackCooldown = 0.6;
    animationAction = 'attack';
    animationActionTime = 0.5;
    animal.health--;
    effects.burst(new THREE.Vector3(animal.x, world.heightAt(animal.x, animal.z), animal.z), 'damage');
    if (animal.health <= 0) {
      wildlife.splice(wildlife.indexOf(animal), 1);
      removeAnimal(animal.id);
      if (animal.species !== 'wolf') {
        resources.food += animal.species === 'deer' ? 3 : 1;
        updateResources();
      }
      toast(animal.species === 'wolf' ? 'Wolf driven off' : 'Food collected');
    } else toast(`${animal.species} hit`);
    return;
  }
  const deposit = world.findNearestDeposit(player.position.x, player.position.z, 3.2);
  const natural = world.findNearest(player.position.x, player.position.z, 3.2);
  if (deposit && (!natural || deposit.position.distanceTo(player.position) < natural.position.distanceTo(player.position))) {
    if (attackCooldown > 0) return;
    const result = world.mineDeposit(deposit, tools.includes('pickaxe'));
    if (!result) return;
    if (result.needsPickaxe) { toast('Craft a pickaxe to mine this deposit'); return; }
    attackCooldown = 0.6;
    animationAction = 'mine';
    animationActionTime = 0.6;
    effects.burst(result.position, 'stone');
    const amount = ironPickaxe ? 2 : 1;
    if (result.mineral === 'stone') resources.stone += amount;
    else mineralInventory[result.mineral] += amount;
    toast(`+${amount} ${result.mineral} · ${result.progress}/3`);
    updateResources();
    void saveGame(false);
    return;
  }
  const found = world.gatherNearest(player.position.x, player.position.z, 3.2);
  if (!found) { toast('Move closer to a tree, rock, or berry bush'); return; }
  animationAction = found.resource === 'stone' ? 'mine' : 'chop';
  animationActionTime = 0.6;
  const amount = found.resource === 'wood' ? (tools.includes('axe') ? 5 : 3)
    : found.resource === 'stone' && tools.includes('pickaxe') ? 4 : 2;
  effects.burst(found.position, found.resource);
  resources[found.resource] += amount;
  toast(`+${amount} ${found.resource}`);
  updateResources();
  updateObjective();
}

function updateObjective() {
  const has = (kind: BuildingKind) => buildingRecords.some(b => b.kind === kind);
  let objective: string;
  if (!has('shelter')) objective = resources.wood >= 8 && resources.stone >= 4 ? 'Build a shelter' : 'Gather 8 wood and 4 stone';
  else if (!npcState.recruited) objective = 'Meet and recruit Mira';
  else if (!has('storage')) objective = 'Build storage for Mira';
  else if (npcState.job === 'idle') objective = 'Assign Mira a gathering task';
  else if (!has('turbine') || !has('generator') || !has('lamp')) objective = 'Build a turbine, generator and lamp';
  else if (!buildingRecords.some(b => b.kind === 'lamp' && b.powered)) objective = 'Connect your power network';
  else objective = 'Your settlement is growing';
  document.querySelector('#objectiveText')!.textContent = objective;
}

function nearestPost() {
  return buildingRecords.filter(isTorchPost)
    .map(record => ({ record, distance: Math.hypot(record.x - player.position.x, record.z - player.position.z) }))
    .filter(candidate => candidate.distance < 2.5)
    .sort((a, b) => a.distance - b.distance)[0];
}

function interact() {
  if (!gameStarted || gameplayBlocked() || buildMode) return;
  if (driving) {
    player.position.copy(vehicle.position).add(new THREE.Vector3(2, 0, 0));
    scene.add(player);
    driving = false;
    vehicleSpeed = 0;
    document.querySelector('#hud')!.classList.remove('driving');
    document.querySelector('#vehicleIndicator')!.classList.add('hidden');
    document.querySelector('#exitVehicle')!.classList.add('hidden');
    document.querySelector('#actionA span')!.textContent = 'Gather';
    document.querySelector('#actionB span')!.textContent = 'Interact';
    toast('Exited vehicle');
    return;
  }
  const door = structures.filter(piece => piece.kind === 'door' && Math.abs(piece.y - player.position.y) < 2)
    .map(piece => ({ piece, distance: Math.hypot(piece.x - player.position.x, piece.z - player.position.z) }))
    .filter(candidate => candidate.distance < 2.5)
    .sort((a, b) => a.distance - b.distance)[0];
  const smelter = buildingRecords.filter(record => record.kind === 'smelter')
    .map(record => ({ record, distance: Math.hypot(record.x - player.position.x, record.z - player.position.z) }))
    .filter(candidate => candidate.distance < 3.2).sort((a, b) => a.distance - b.distance)[0];
  const post = nearestPost();
  if (door && door.distance <= Math.min(vehicle.position.distanceTo(player.position), npc.position.distanceTo(player.position), smelter?.distance ?? Infinity, post?.distance ?? Infinity)) {
    if (door.piece.open && pieceBlocks({ ...door.piece, open: false }, player.position.x, player.position.y, player.position.z)) {
      toast('Step out of the doorway first');
      return;
    }
    door.piece.open = !door.piece.open;
    toast(door.piece.open ? 'Door opened' : 'Door closed');
    void saveGame(false);
    return;
  }
  if (post && post.distance <= Math.min(vehicle.position.distanceTo(player.position), npc.position.distanceTo(player.position), smelter?.distance ?? Infinity)) {
    if (!togglePostFlame(post.record, torch)) { toast('Equip and ignite your torch first'); return; }
    postLightTimer = 0;
    toast(post.record.lit ? 'Torch post lit' : 'Torch post extinguished');
    void saveGame(false);
    return;
  }
  if (smelter && smelter.distance <= Math.min(vehicle.position.distanceTo(player.position), npc.position.distanceTo(player.position))) {
    releasePointerLock();
    activeSmelter = smelter.record;
    refreshSmelter();
    clearMovement();
    document.querySelector('#smelterPanel')!.classList.remove('hidden');
  } else if (vehicle.position.distanceTo(player.position) < 3.2) {
    scene.remove(player);
    driving = true;
    vehicleSpeed = 0;
    document.querySelector('#hud')!.classList.add('driving');
    document.querySelector('#vehicleIndicator')!.classList.remove('hidden');
    document.querySelector('#exitVehicle')!.classList.remove('hidden');
    document.querySelector('#actionA span')!.textContent = 'Drive';
    document.querySelector('#actionB span')!.textContent = 'Brake';
    toast('Driving rover');
  } else if (npc.position.distanceTo(player.position) < 3) {
    releasePointerLock();
    refreshNpcPanel();
    clearMovement();
    document.querySelector('#npcPanel')!.classList.remove('hidden');
  } else {
    world.dig(player.position.x, player.position.z);
    animationAction = 'mine';
    animationActionTime = 0.6;
    effects.burst(player.position, 'stone');
    toast('Excavated terrain');
  }
}

function updateResources() {
  retryPendingRoofs();
  document.querySelector('#resources')!.innerHTML =
    `<div><b>🌲</b><span>${resources.wood}</span></div><div><b>◆</b><span>${resources.stone}</span></div><div><b>◒</b><span>${resources.food}</span></div><div><b>💧</b><span>${resources.water}</span></div>`;
  (document.querySelector('#healthBar') as HTMLElement).style.width = `${health}%`;
  document.querySelector('#mineralInventory')!.textContent = `Minerals: clay ${mineralInventory.clay} · sand ${mineralInventory.sand} · coal ${mineralInventory.coal} · copper ore ${mineralInventory.copperOre} · iron ore ${mineralInventory.ironOre} · limestone ${mineralInventory.limestone} · iron ingots ${ingots.iron} · copper ingots ${ingots.copper} · glass ${ingots.glass}${ironPickaxe ? ' · iron pickaxe' : ''}`;
}

function toast(message: string) {
  const element = document.querySelector('#toast')!;
  element.textContent = message;
  element.classList.add('visible');
  clearTimeout((toast as any)._timer);
  (toast as any)._timer = setTimeout(() => element.classList.remove('visible'), 1800);
}

function showMap() {
  if (gameStarted && !gameplayBlocked()) {
    const position = planetCoordinates(player.position.x, player.position.z);
    toast(`Local map: ${Math.round(position.x)}, ${Math.round(position.z)}`);
  }
}

let last = performance.now();
let accumulator = 0;
const simulationStep = 1 / 30;
function animate(now: number) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (preview && !document.querySelector('#characterPanel')!.classList.contains('hidden')) preview.render(now);
  if (!gameStarted || gameplayBlocked()) {
    accumulator = 0;
    renderer.render(scene, camera);
    return;
  }
  accumulator += dt;
  while (accumulator >= simulationStep) {
    updateGame(simulationStep);
    accumulator -= simulationStep;
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(animate);

function damagePlayer(damage: number, message: string) {
  if (enemyHitCooldown > 0) return;
  enemyHitCooldown = 1.5;
  health = Math.max(0, health - damage);
  animationAction = 'hurt';
  animationActionTime = 0.45;
  if (health === 0) {
    const spawn = safeSpawn(seed);
    if (spawn) player.position.set(spawn.x, world.heightAt(spawn.x, spawn.z), spawn.z);
    health = 100;
    toast('You were rescued and returned to camp');
  } else toast(message);
  updateResources();
}

function spawnEnemyProjectile(enemy: THREE.Group, damage: number) {
  if (enemyProjectiles.length >= 12) return;
  const mesh = new THREE.Mesh(projectileGeometry, projectileMaterial);
  mesh.position.copy(enemy.position).add(new THREE.Vector3(0, 1.3, 0));
  const velocity = player.position.clone().add(new THREE.Vector3(0, 1, 0)).sub(mesh.position).normalize().multiplyScalar(5);
  enemyProjectiles.push({ mesh, velocity, remaining: 3, damage });
  scene.add(mesh);
}

function updateEnemyProjectiles(dt: number) {
  for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
    const projectile = enemyProjectiles[i];
    const point = projectile.mesh.position;
    const result = stepEnemyProjectile(point, projectile.velocity, projectile.remaining, dt,
      player.position.clone().add(new THREE.Vector3(0, 1, 0)), position =>
        position.y < world.heightAt(position.x, position.z) || buildingRecords.some(b =>
          position.y < b.y + 2.5 && Math.hypot(position.x - b.x, position.z - b.z) < buildingRadius(b.kind)));
    projectile.remaining = result.remaining;
    if (result.finished) {
      if (result.hit) damagePlayer(projectile.damage, 'A necromancer struck you!');
      effects.burst(point, 'damage');
      scene.remove(projectile.mesh);
      enemyProjectiles.splice(i, 1);
    }
  }
}

function projectWorldEntities() {
  const project = (object: THREE.Object3D) => {
    const point = nearestPlanetPosition(object.position.x, object.position.z, player.position.x, player.position.z);
    const changed = point.x !== object.position.x || point.z !== object.position.z;
    if (changed) {
      if (planetCoordinates(object.position.x, object.position.z).reflected !== planetCoordinates(point.x, point.z).reflected) {
        object.rotation.y = Math.PI - object.rotation.y;
      }
      object.position.set(point.x, world.heightAt(point.x, point.z), point.z);
    }
    return changed;
  };
  project(npc);
  if (!driving) project(vehicle);
  let powerLinesChanged = false;
  buildings.forEach((building, index) => {
    if (!project(building)) return;
    buildingRecords[index].x = building.position.x;
    buildingRecords[index].z = building.position.z;
    buildingRecords[index].y = building.position.y;
    buildingRecords[index].rotation = building.rotation.y;
    powerLinesChanged = true;
  });
  if (powerLinesChanged) updatePowerLines();
  let structuresChanged = false;
  for (const piece of structures) {
    const point = nearestPlanetPosition(piece.x, piece.z, player.position.x, player.position.z);
    if (piece.x !== point.x || piece.z !== point.z) {
      if (planetCoordinates(piece.x, piece.z).reflected !== planetCoordinates(point.x, point.z).reflected) {
        if (piece.kind === 'stairs') {
          if (piece.rotation === 0) piece.rotation = 2;
          else if (piece.rotation === 2) piece.rotation = 0;
        }
        if (piece.roofShape?.axis === 1) {
          const [left, middle, right] = piece.roofShape.heights;
          piece.roofShape = { ...piece.roofShape, heights: [right, middle, left] };
        }
      }
      piece.x = point.x;
      piece.z = point.z;
      structuresChanged = true;
    }
  }
  if (structuresChanged) constructionRenderer.refresh(structures, surfacePaint);
}

function rebaseWorld() {
  const dx = Math.abs(player.position.x) > PLANET_WIDTH * 2
    ? -Math.trunc(player.position.x / PLANET_WIDTH) * PLANET_WIDTH : 0;
  const dz = Math.abs(player.position.z) > PLANET_HEIGHT * 2
    ? -Math.trunc(player.position.z / (PLANET_HEIGHT * 2)) * PLANET_HEIGHT * 2 : 0;
  if (!dx && !dz) return;
  const shift = (object: THREE.Object3D) => { object.position.x += dx; object.position.z += dz; };
  [player, npc, vehicle, ...buildings, ...enemies].forEach(shift);
  enemyProjectiles.forEach(projectile => shift(projectile.mesh));
  if (buildGhost) shift(buildGhost);
  buildTarget.x += dx;
  buildTarget.z += dz;
  buildAim.x += dx;
  buildAim.y += dz;
  buildingRecords.forEach(record => { record.x += dx; record.z += dz; });
  structures.forEach(piece => { piece.x += dx; piece.z += dz; });
  constructionRenderer.refresh(structures, surfacePaint);
  camera.position.x += dx;
  camera.position.z += dz;
  cameraFocus.x += dx;
  cameraFocus.z += dz;
  effects.shift(dx, dz);
  world.rebase(dx, dz);
  updatePowerLines();
}

function updateGame(dt: number) {
  effects.update(dt);
  for (const building of buildingRecords) {
    if (building.smelting && advanceSmelting(building.smelting, ingots, dt)) {
      delete building.smelting;
      updateResources();
      toast('Smelting complete');
      void saveGame(false);
    }
  }
  attackCooldown = Math.max(0, attackCooldown - dt);
  enemyHitCooldown = Math.max(0, enemyHitCooldown - dt);
  spawnCooldown = Math.max(0, spawnCooldown - dt);
  animationActionTime = Math.max(0, animationActionTime - dt);
  gameMinutes += dt * gameSpeed;
  if (gameMinutes >= 1440) { gameMinutes -= 1440; day++; }
  const hour = Math.floor(gameMinutes / 60);
  const minute = Math.floor(gameMinutes % 60);
  document.querySelector('#timeText')!.textContent = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  const season = seasonForDay(day);
  const weather = weatherForDay(day, seed);
  document.querySelector('#seasonText')!.textContent = `${season.toUpperCase()} · DAY ${day} · ${weather.toUpperCase()}`;
  world.setSeason(season);
  precipitation.update(weather, driving ? vehicle.position : player.position, dt, constructionRenderer.shelter);
  const shelterPosition = driving ? vehicle.position : player.position;
  const shelter = constructionRenderer.shelter.status(shelterPosition.x, shelterPosition.y, shelterPosition.z);
  const shelterStatus = document.querySelector<HTMLElement>('#shelterStatus')!;
  shelterStatus.classList.toggle('hidden', shelter === 'outside');
  if (shelterStatus.textContent !== shelter.toUpperCase()) shelterStatus.textContent = shelter.toUpperCase();
  const lighting = environmentLighting(gameMinutes, weather);
  ambient.intensity = THREE.MathUtils.damp(ambient.intensity, lighting.hemisphere, 5, dt);
  sun.intensity = THREE.MathUtils.damp(sun.intensity, lighting.sunlight, 5, dt);
  moon.intensity = THREE.MathUtils.damp(moon.intensity, lighting.moonlight, 5, dt);
  ambient.color.lerpColors(nightAmbient, dayAmbient, lighting.daylight);
  ambient.groundColor.lerpColors(nightGround, dayGround, lighting.daylight);
  sun.color.lerpColors(noonSun, twilightSun, lighting.twilight);
  nightSky.setHSL(0.60 - 0.07 * lighting.daylight, 0.38, lighting.skyBrightness);
  nightSky.lerp(twilightSky, lighting.twilight * 0.35);
  if (scene.background instanceof THREE.Color) scene.background.lerp(nightSky, 1 - Math.exp(-5 * dt));
  if (scene.fog instanceof THREE.Fog && scene.background instanceof THREE.Color) scene.fog.color.copy(scene.background);

  let actualMovement = 0;
  let inputX = gameplayBlocked() ? 0 : move.x;
  let inputZ = gameplayBlocked() ? 0 : move.y;
  if (!gameplayBlocked()) {
    if (keys.has('KeyA') || keys.has('ArrowLeft')) inputX -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) inputX += 1;
    if (keys.has('KeyW') || keys.has('ArrowUp')) inputZ -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) inputZ += 1;
  }
  const length = Math.hypot(inputX, inputZ);
  const speed = keys.has('ShiftLeft') ? 6.5 : 4;
  if (driving) {
    const throttle = !gameplayBlocked() && accelerateTouch ? 1 : !gameplayBlocked() && brakeTouch ? -1 : -inputZ;
    vehicleSpeed = THREE.MathUtils.clamp(vehicleSpeed + throttle * 5 * dt, -2.5, 6);
    if (Math.abs(throttle) < 0.08) vehicleSpeed *= Math.exp(-1.5 * dt);
    if (Math.abs(vehicleSpeed) > 0.1) vehicle.rotation.y -= inputX * Math.sign(vehicleSpeed) * 1.5 * dt;
    const dx = Math.cos(vehicle.rotation.y);
    const dz = -Math.sin(vehicle.rotation.y);
    const nextX = vehicle.position.x + dx * vehicleSpeed * dt;
    const nextZ = vehicle.position.z + dz * vehicleSpeed * dt;
    const blocked = buildingRecords.some(b => Math.hypot(nextX - b.x, nextZ - b.z) < (b.kind === 'shelter' ? 2.4 : 1.8))
      || structures.some(piece => pieceBlocks(piece, nextX, vehicle.position.y, nextZ, 1));
    if (!blocked && world.heightAt(nextX, nextZ) > -0.5) {
      vehicle.position.x = nextX;
      vehicle.position.z = nextZ;
    } else vehicleSpeed = 0;
    vehicle.position.y = world.heightAt(vehicle.position.x, vehicle.position.z);
    const wheels = vehicle.userData.wheels as THREE.Mesh[];
    wheels.forEach(wheel => wheel.rotateY(vehicleSpeed * dt / 0.32));
    document.querySelector('#vehicleIndicator')!.textContent = `SPEED ${Math.abs(vehicleSpeed).toFixed(1)}`;
    if (cameraSettings.autoFollow && Math.abs(vehicleSpeed) > 0.15 && performance.now() > manualCameraUntil) {
      cameraAngle = dampAngle(cameraAngle, Math.atan2(-dx, -dz), 2.2, dt);
    }
    previousInput.set(0, 0);
  } else if (length > 0.08) {
    inputX /= Math.max(1, length);
    inputZ /= Math.max(1, length);
    const inputDirection = new THREE.Vector2(inputX, inputZ).normalize();
    if (document.pointerLockElement === canvas || previousInput.lengthSq() === 0 || previousInput.distanceTo(inputDirection) > 0.35) {
      movementBasis = cameraAngle;
      previousInput.copy(inputDirection);
    }
    const direction = cameraRelativeMovement(inputX, inputZ, movementBasis);
    const dx = direction.x;
    const dz = direction.y;
    const target = player;
    const nextX = target.position.x + dx * speed * dt;
    const nextZ = target.position.z + dz * speed * dt;
    const collides = buildingRecords.some(b => Math.hypot(nextX - b.x, nextZ - b.z) < (b.kind === 'shelter' ? 2 : b.kind === 'storage' ? 1.6 : 1))
      || structures.some(piece => pieceBlocks(piece, nextX, target.position.y, nextZ));
    if (!collides && world.heightAt(nextX, nextZ) > -0.5) {
      target.position.x = nextX;
      target.position.z = nextZ;
      actualMovement = length;
    }
    target.position.y = floorSurface(structures, target.position.x, target.position.z, target.position.y, world.heightAt(target.position.x, target.position.z));
    const heading = Math.atan2(dx, dz);
    target.rotation.y = dampAngle(target.rotation.y, heading, 10, dt);
    if (!buildMode && document.pointerLockElement !== canvas && cameraSettings.autoFollow && performance.now() > manualCameraUntil) {
      cameraAngle = dampAngle(cameraAngle, Math.atan2(-dx, -dz), 2.2, dt);
    }
  } else previousInput.set(0, 0);

  if (driving) {
    player.position.copy(vehicle.position).add(new THREE.Vector3(0, 1, 0));
  }
  rebaseWorld();
  world.updateChunks(player.position.x, player.position.z);
  projectWorldEntities();
  constructionRenderer.update(dt, player.position, camera.position);

  const elapsed = performance.now();
  updateNpc(dt);
  updateWildlife(wildlife, dt, seed, player.position, (x, z) => world.heightAt(x, z), damage => {
    if (!driving) damagePlayer(damage, 'A wolf attacked!');
  });
  updateAnimalModels(elapsed);

  buildings.forEach(building => {
    if (building.userData.building === 'turbine') {
      const blades = building.userData.blades as THREE.Group;
      if (blades) blades.rotation.z += dt * 0.9;
    }
  });
  const wind = Math.max(0, 0.7 + 0.9 * Math.sin(gameMinutes / 1440 * Math.PI * 2));
  world.animate(elapsed, wind);
  const lampWasPowered = buildingRecords.some(b => b.kind === 'lamp' && b.powered);
  updatePower(buildingRecords, wind, dt);
  if (lampWasPowered !== buildingRecords.some(b => b.kind === 'lamp' && b.powered)) updateObjective();
  buildings.forEach((building, index) => {
    if (buildingRecords[index]?.kind === 'lamp') {
      const light = building.userData.light as THREE.PointLight;
      light.intensity = buildingRecords[index].powered ? 8 : 0;
    }
    if (buildingRecords[index]?.kind === 'smelter') {
      const embers = building.userData.embers as THREE.Mesh;
      embers.visible = Boolean(buildingRecords[index].smelting);
    }
  });

  if (isNight(gameMinutes) && enemies.length < 2 && spawnCooldown === 0) {
    const angle = seededNoise(day, elapsed * 0.001, seed) * Math.PI * 2;
    const x = player.position.x + Math.cos(angle) * 12;
    const z = player.position.z + Math.sin(angle) * 12;
    if (world.heightAt(x, z) > 0.2 && buildingRecords.every(b => Math.hypot(x - b.x, z - b.z) > 4)) {
      const kind = chooseEnemyKind(day, seededNoise(x, z, seed + day));
      const enemy = createEnemy(kind);
      if (kind === 'raider') useAuthoredCharacter(enemy, { ...defaultAppearance('sage'), hair: 'shaved', clothing: 'fur', hat: 'hood' });
      enemy.position.set(x, world.heightAt(x, z), z);
      enemy.userData.health = enemyProfiles[kind].health;
      enemy.userData.attackTimer = 0;
      enemy.userData.attackAnimation = 0;
      enemy.userData.hurtAnimation = 0;
      enemies.push(enemy);
      scene.add(enemy);
    }
    spawnCooldown = 20;
  }
  enemies.forEach(enemy => {
    const kind = enemy.userData.enemyKind as EnemyKind;
    const profile = enemyProfiles[kind];
    enemy.userData.attackTimer = Math.max(0, (enemy.userData.attackTimer as number) - dt);
    enemy.userData.attackAnimation = Math.max(0, (enemy.userData.attackAnimation as number) - dt);
    enemy.userData.hurtAnimation = Math.max(0, (enemy.userData.hurtAnimation as number) - dt);
    const direction = player.position.clone().sub(enemy.position).setY(0);
    const enemyDistance = direction.length();
    const intent = enemyIntent(kind, enemyDistance, enemy.userData.attackTimer === 0);
    let walking = 0;
    if (enemyDistance > 0 && enemyDistance < 18) {
      direction.normalize();
      const next = enemy.position.clone().addScaledVector(direction, dt * profile.speed * intent.movement);
      if (world.heightAt(next.x, next.z) > -0.5 && buildingRecords.every(b => Math.hypot(next.x - b.x, next.z - b.z) > buildingRadius(b.kind))) {
        enemy.position.x = next.x;
        enemy.position.z = next.z;
        walking = Math.abs(intent.movement);
      }
      enemy.position.y = world.heightAt(enemy.position.x, enemy.position.z);
      enemy.rotation.y = dampAngle(enemy.rotation.y, Math.atan2(direction.x, direction.z), 8, dt);
      if (intent.attack) {
        enemy.userData.attackTimer = profile.cooldown;
        enemy.userData.attackAnimation = 0.6;
        if (profile.ranged) spawnEnemyProjectile(enemy, profile.damage);
        else damagePlayer(profile.damage, `${kind} hit you!`);
      }
    }
    const hurt = enemy.userData.hurtAnimation as number;
    const attack = enemy.userData.attackAnimation as number;
    animateCharacter(enemy, dt, walking, kind === 'nightcreature', hurt > 0 ? 'hurt' : attack > 0 ? 'attack' : undefined, false, hurt || attack);
  });
  updateEnemyProjectiles(dt);

  if (buildGhost) {
    const blend = 1 - Math.exp(-14 * dt);
    buildGhost.position.x = THREE.MathUtils.lerp(buildGhost.position.x, buildTarget.x, blend);
    buildGhost.position.z = THREE.MathUtils.lerp(buildGhost.position.z, buildTarget.z, blend);
    buildGhost.position.y = isPieceKind(buildKind)
      ? THREE.MathUtils.lerp(buildGhost.position.y, buildTarget.y, blend)
      : world.heightAt(buildGhost.position.x, buildGhost.position.z);
    buildGhost.rotation.y = buildRotation;
    updatePlacement();
  }

  const focus = driving ? vehicle.position : player.position;
  const look = new THREE.Vector3(focus.x, focus.y + (driving ? 1.9 : 1.8), focus.z);
  if (!cameraReady) { cameraFocus.copy(look); cameraReady = true; }
  cameraFocus.lerp(look, 1 - Math.exp(-cameraSettings.smoothing * dt));
  const inRoom = !driving && Boolean(constructionRenderer.shelter.roomAt(player.position.x, player.position.y, player.position.z));
  const distance = Math.min(inRoom ? 6 : 24, cameraSettings.distance + (driving ? 2 : 0));
  const horizontal = distance * Math.cos(cameraPitch);
  cameraDesired.set(
    cameraFocus.x + Math.sin(cameraAngle) * horizontal,
    cameraFocus.y + distance * Math.sin(cameraPitch),
    cameraFocus.z + Math.cos(cameraAngle) * horizontal,
  );
  const rayDirection = cameraDesired.clone().sub(cameraFocus);
  const rayLength = rayDirection.length();
  rayDirection.normalize();
  cameraRay.set(cameraFocus, rayDirection);
  cameraRay.far = rayLength;
  const buildingHit = cameraRay.intersectObjects(buildings, true)[0];
  if (buildingHit && buildingHit.distance > 0.3) cameraDesired.copy(cameraFocus).addScaledVector(rayDirection, Math.max(0.5, buildingHit.distance - 0.35));
  const unobstructedDistance = cameraDesired.distanceTo(cameraFocus);
  cameraRay.far = unobstructedDistance;
  for (let distanceAlongRay = 0.75; distanceAlongRay < unobstructedDistance; distanceAlongRay += 0.5) {
    const sample = cameraFocus.clone().addScaledVector(rayDirection, distanceAlongRay);
    if (sample.y < world.heightAt(sample.x, sample.z) + 0.35) {
      cameraDesired.copy(cameraFocus).addScaledVector(rayDirection, Math.max(0.5, distanceAlongRay - 0.5));
      break;
    }
  }
  const cameraGround = world.heightAt(cameraDesired.x, cameraDesired.z) + 0.7;
  cameraDesired.y = Math.max(cameraDesired.y, cameraGround);
  camera.position.lerp(cameraDesired, 1 - Math.exp(-cameraSettings.smoothing * dt));
  camera.position.y = Math.max(camera.position.y, world.heightAt(camera.position.x, camera.position.z) + 0.5);
  camera.lookAt(cameraFocus);
  world.updateTreeOcclusion(camera.position, focus);

  animateCharacter(player, dt, actualMovement, keys.has('ShiftLeft'), animationActionTime > 0 ? animationAction : undefined);
  attachHandTorch(player, handTorch.group);
  handTorch.group.visible = torch.equipped && !driving;
  handTorch.fire.visible = torch.lit;
  const fireTime = elapsed / 1000;
  handTorch.light.intensity = torch.lit && !driving ? 26 + Math.sin(fireTime * 9) * 1.8 : 0;
  handTorch.fire.scale.y = 1 + Math.sin(fireTime * 8) * 0.1;
  postLightTimer -= dt;
  if (postLightTimer <= 0) {
    const posts = buildingRecords.filter(isTorchPost);
    visiblePostLights = nearbyFireLights(posts, player.position.x, player.position.z, postLights.length, 18);
    buildings.forEach((building, index) => {
      const record = buildingRecords[index];
      if (!isTorchPost(record)) return;
      const visible = Math.hypot(record.x - player.position.x, record.z - player.position.z) < renderDistance * 24 + 12;
      building.visible = visible;
      const fire = building.getObjectByName('post-flame');
      if (fire) fire.visible = visible && record.lit;
    });
    postLightTimer = 0.5;
  }
  const sparks: THREE.Vector3[] = [];
  if (torch.lit && torch.equipped && !driving) sparks.push(handTorch.fire.getWorldPosition(new THREE.Vector3()));
  postLights.forEach((light, index) => {
    const post = visiblePostLights[index];
    if (!post || !post.lit) { light.intensity = 0; return; }
    light.position.set(post.x, post.y + 1.95, post.z);
    light.intensity = 26 + Math.sin(fireTime * 8 + index * 2) * 1.6;
    sparks.push(light.position);
  });
  fireSparks.update(sparks, fireTime);
  if (!driving && !buildMode) {
    const post = nearestPost();
    const closestDoor = structures.filter(piece => piece.kind === 'door' && Math.abs(piece.y - player.position.y) < 2)
      .reduce((distance, piece) => Math.min(distance, Math.hypot(piece.x - player.position.x, piece.z - player.position.z)), Infinity);
    const closestSmelter = buildingRecords.filter(record => record.kind === 'smelter')
      .reduce((distance, record) => Math.min(distance, Math.hypot(record.x - player.position.x, record.z - player.position.z)), Infinity);
    const nearby = post && post.distance < Math.min(closestDoor, closestSmelter, vehicle.position.distanceTo(player.position), npc.position.distanceTo(player.position));
    const hint = nearby ? (post.record.lit ? 'Extinguish torch' : 'Light torch') : 'Interact';
    document.querySelector('#actionB span')!.textContent = hint;
    updateCameraHint(nearby ? hint : undefined);
  }
  drawMinimap();
  autoSaveTimer += dt;
  if (autoSaveTimer > 60) { autoSaveTimer = 0; saveGame(false); }
}

function removeAnimal(id: string) {
  const model = animalModels.get(id);
  if (!model) return;
  scene.remove(model);
  disposeAnimal(model);
  animalModels.delete(id);
}

function resetWildlife(states: AnimalState[]) {
  for (const id of [...animalModels.keys()]) removeAnimal(id);
  wildlife = states.map(animal => ({ ...animal }));
  for (const animal of wildlife) {
    const model = createAnimal(animal.species, Number(animal.id.split('-')[1]));
    animalModels.set(animal.id, model);
    scene.add(model);
  }
  updateAnimalModels(performance.now());
}

function updateAnimalModels(time: number) {
  const live = new Set(wildlife.map(animal => animal.id));
  for (const id of animalModels.keys()) if (!live.has(id)) removeAnimal(id);
  for (const animal of wildlife) {
    const model = animalModels.get(animal.id);
    if (!model) continue;
    const flying = animal.species === 'bird' && animal.behavior === 'fly';
    model.position.set(animal.x, world.heightAt(animal.x, animal.z) + (flying ? 2.5 + Math.sin(time * 0.002) * 0.3 : 0), animal.z);
    model.rotation.y = animal.heading;
    animateAnimal(model, animal.species, animal.behavior !== 'rest', time);
  }
}

function updatePowerLines() {
  for (const child of [...powerLines.children]) {
    powerLines.remove(child);
    if (child instanceof THREE.Line) {
      child.geometry.dispose();
      if (child.material instanceof THREE.Material) child.material.dispose();
    }
  }
  for (let i = 0; i < buildingRecords.length; i++) {
    for (let j = i + 1; j < buildingRecords.length; j++) {
      const a = buildingRecords[i];
      const b = buildingRecords[j];
      if (!areConnected(a, b)) continue;
      const neighbor = nearestPlanetPosition(b.x, b.z, a.x, a.z);
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(a.x, a.y + 0.95, a.z), new THREE.Vector3(neighbor.x, b.y + 0.95, neighbor.z),
      ]);
      powerLines.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#e9c271' })));
    }
  }
}

function updateNpc(dt: number) {
  const storage = buildings.find(b => b.userData.building === 'storage');
  const threat = enemies.find(enemy => enemy.position.distanceTo(npc.position) < 6);
  const activity = chooseNpcActivity(npcState, Boolean(storage), Boolean(threat));
  let destination: THREE.Vector3 | undefined;
  if (activity === 'gathering' && npcState.job !== 'idle') {
    const target = world.findNearest(npc.position.x, npc.position.z, 40, npcState.job);
    if (target) {
      destination = target.position;
      if (Math.hypot(npc.position.x - target.position.x, npc.position.z - target.position.z) < 1.3) {
        const found = world.gatherNearest(npc.position.x, npc.position.z, 1.4, npcState.job);
        if (found && found.resource !== 'food') {
          npcState.carrying = found.resource;
          npc.userData.workTimer = 0.6;
        }
        destination = undefined;
      }
    }
  } else if (activity === 'delivering' && storage) {
    destination = storage.position;
    if (Math.hypot(npc.position.x - storage.position.x, npc.position.z - storage.position.z) < 2) {
      if (npcState.carrying) resources[npcState.carrying] += npcState.carrying === 'wood' ? 3 : 2;
      npcState.carrying = null;
      destination = undefined;
      updateResources();
      updateObjective();
    }
  } else if (activity === 'taking cover' && threat) {
    const away = npc.position.clone().sub(threat.position).setY(0).normalize();
    destination = npc.position.clone().addScaledVector(away, 3);
  }
  const cargo = npc.getObjectByName('cargo');
  if (npcState.carrying && !cargo) {
    const parcel = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.4, 0.35), new THREE.MeshStandardMaterial({ color: '#b69662' }));
    parcel.position.set(0, 1.05, 0.48);
    parcel.name = 'cargo';
    npc.add(parcel);
  } else if (!npcState.carrying && cargo) { npc.remove(cargo); disposeCharacter(cargo); }
  if (destination) {
    const next = stepToward(npc.position, destination, 1.6, dt);
    const blocker = buildingRecords.find(b => Math.hypot(next.x - b.x, next.z - b.z) < 1.65 && Math.hypot(destination!.x - b.x, destination!.z - b.z) > 2);
    if (blocker) {
      const dx = npc.position.x - blocker.x;
      const dz = npc.position.z - blocker.z;
      const tangent = new THREE.Vector3(-dz, 0, dx).normalize();
      npc.position.addScaledVector(tangent, dt * 1.6);
    } else if (!structures.some(piece => pieceBlocks(piece, next.x, npc.position.y, next.z))) {
      npc.position.x = next.x;
      npc.position.z = next.z;
    }
    npc.rotation.y = dampAngle(npc.rotation.y, Math.atan2(destination.x - npc.position.x, destination.z - npc.position.z), 8, dt);
  }
  npc.position.y = world.heightAt(npc.position.x, npc.position.z);
  npc.userData.workTimer = Math.max(0, ((npc.userData.workTimer as number | undefined) ?? 0) - dt);
  animateCharacter(npc, dt, destination ? 1 : 0, false, npc.userData.workTimer > 0 ? (npcState.job === 'stone' ? 'mine' : 'chop') : undefined, Boolean(npcState.carrying) && npc.userData.workTimer === 0, npc.userData.workTimer as number);
}

function animateCharacter(character: THREE.Group, dt: number, movement: number, running = false, action?: typeof animationAction, carrying = false, actionTime = animationActionTime) {
  if (updateAuthoredCharacter(character, dt, movement, running, action, carrying)) return;
  const time = performance.now() * (running ? 0.011 : 0.007);
  const legL = character.getObjectByName('legL');
  const legR = character.getObjectByName('legR');
  const armL = character.getObjectByName('armL');
  const armR = character.getObjectByName('armR');
  const torso = character.getObjectByName('torso');
  const kneeL = character.getObjectByName('kneeL');
  const kneeR = character.getObjectByName('kneeR');
  const elbowL = character.getObjectByName('elbowL');
  const elbowR = character.getObjectByName('elbowR');
  const moving = movement > 0.1;
  const swing = moving ? Math.sin(time) * (running ? 0.75 : 0.48) : 0;
  const blend = 1 - Math.exp(-12 * dt);
  if (legL && legR) {
    legL.rotation.x = THREE.MathUtils.lerp(legL.rotation.x, swing, blend);
    legR.rotation.x = THREE.MathUtils.lerp(legR.rotation.x, -swing, blend);
  }
  if (kneeL && kneeR) {
    kneeL.rotation.x = THREE.MathUtils.lerp(kneeL.rotation.x, Math.max(0, -swing) * 0.8, blend);
    kneeR.rotation.x = THREE.MathUtils.lerp(kneeR.rotation.x, Math.max(0, swing) * 0.8, blend);
  }
  if (armL && armR) {
    const actionSwing = action === 'hurt' ? -0.5 : action ? -1.5 * Math.sin((1 - actionTime / 0.6) * Math.PI) : swing * 0.65;
    const enemyPose = character.userData.enemyKind === 'undead' || character.userData.enemyKind === 'nightcreature' ? -0.55 : 0;
    armL.rotation.x = THREE.MathUtils.lerp(armL.rotation.x, carrying ? -1.1 : enemyPose - swing * 0.65, blend);
    armR.rotation.x = THREE.MathUtils.lerp(armR.rotation.x, carrying ? -1.1 : actionSwing, blend);
  }
  if (elbowL && elbowR) {
    elbowL.rotation.x = THREE.MathUtils.lerp(elbowL.rotation.x, carrying ? -0.5 : -0.15, blend);
    elbowR.rotation.x = THREE.MathUtils.lerp(elbowR.rotation.x, carrying ? -0.5 : action ? -0.4 : -0.15, blend);
  }
  if (!character.userData.enemy) {
    for (const kind of ['chop', 'mine', 'weapon'] as const) {
      const tool = character.getObjectByName(`tool-${kind}`);
      if (tool) tool.visible = kind === (action === 'attack' ? 'weapon' : action === 'build' ? 'chop' : action);
    }
  }
  if (torso) torso.scale.y = 1 + Math.sin(performance.now() * 0.002) * 0.012;
}

function drawMinimap() {
  const map = document.querySelector<HTMLCanvasElement>('#minimap')!;
  const ctx = map.getContext('2d')!;
  const scale = 1.7;
  ctx.clearRect(0, 0, map.width, map.height);
  ctx.fillStyle = '#78a96a';
  ctx.fillRect(0, 0, map.width, map.height);
  for (let y = -45; y < 45; y += 4) {
    for (let x = -45; x < 45; x += 4) {
      const wx = player.position.x + x;
      const wz = player.position.z + y;
      const h = world.heightAt(wx, wz);
      ctx.fillStyle = h < 0 ? '#4e9daa' : h > 4.4 ? '#7d8580' : '#72a85d';
      ctx.fillRect(map.width / 2 + x * scale - 3, map.height / 2 + y * scale - 3, 7, 7);
    }
  }
  ctx.fillStyle = '#f4ce68';
  ctx.beginPath();
  ctx.arc(map.width / 2, map.height / 2, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f3f5e8';
  ctx.beginPath();
  ctx.moveTo(map.width / 2, map.height / 2 - 10);
  ctx.lineTo(map.width / 2 - 4, map.height / 2 - 3);
  ctx.lineTo(map.width / 2 + 4, map.height / 2 - 3);
  ctx.fill();
  buildings.forEach(building => {
    ctx.fillStyle = '#bf6c45';
    ctx.fillRect(map.width / 2 + (building.position.x - player.position.x) * scale, map.height / 2 + (building.position.z - player.position.z) * scale, 5, 5);
  });
  enemies.forEach(enemy => {
    ctx.fillStyle = '#b84d55';
    ctx.fillRect(map.width / 2 + (enemy.position.x - player.position.x) * scale, map.height / 2 + (enemy.position.z - player.position.z) * scale, 4, 4);
  });
  wildlife.forEach(animal => {
    ctx.fillStyle = animal.species === 'wolf' ? '#9a5962' : '#f2e4a5';
    ctx.fillRect(map.width / 2 + (animal.x - player.position.x) * scale, map.height / 2 + (animal.z - player.position.z) * scale, 3, 3);
  });
  ctx.strokeStyle = '#dfeada';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(map.width / 2, map.height / 2, 82, 0, Math.PI * 2);
  ctx.stroke();
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('new-dawn', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('saves');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readSaveRecord(key: string) {
  const db = await openDatabase();
  try {
    const request = db.transaction('saves', 'readonly').objectStore('saves').get(key);
    return await new Promise<unknown>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function exportSave() {
  try {
    const saved = await readSaveRecord('primary');
    if (!saved) { toast('No saved world found'); return; }
    if (!isSaveData(saved)) { toast('Save is invalid or from an unsupported version'); return; }
    const url = URL.createObjectURL(new Blob([JSON.stringify(saved, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'new-dawn-save.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Save exported');
  } catch (error) {
    console.error('Could not export world', error);
    toast('Could not export world. Check browser storage.');
  }
}

async function importSave(file: File) {
  try {
    if (file.size > 5 * 1024 * 1024) { toast('Save file is too large'); return; }
    const saved: unknown = JSON.parse(await file.text());
    if (!isSaveData(saved)) { toast('Save is invalid or from an unsupported version'); return; }
    const existing = await readSaveRecord('primary');
    if (existing && !window.confirm('Replace the current saved world? A backup will be kept in this browser.')) return;
    const db = await openDatabase();
    try {
      const tx = db.transaction('saves', 'readwrite');
      const store = tx.objectStore('saves');
      if (existing) store.put(existing, 'pre-import-backup');
      store.put(saved, 'primary');
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? new Error('Import transaction aborted'));
      });
    } finally {
      db.close();
    }
    toast('Save imported. Select Continue.');
  } catch (error) {
    console.error('Could not import world', error);
    toast('Could not import world. Check the file and browser storage.');
  }
}

async function saveGame(notify: boolean) {
  if (!gameStarted) return false;
  try {
    const db = await openDatabase();
    const tx = db.transaction('saves', 'readwrite');
    tx.objectStore('saves').put({
      version: 10,
      seed,
      outfit,
      appearance: { ...appearance },
      playerName: characterName,
      npcAppearanceSeed,
      wildlife: wildlife.map(animal => ({ ...animal })),
      player: { x: player.position.x, y: player.position.y, z: player.position.z },
      npc: { x: npc.position.x, z: npc.position.z },
      resources,
      buildings: buildingRecords,
      structures,
      autoRoof,
      ...(roofStyle !== 'flat' ? { roofStyle } : {}),
      ...(roofAxis !== 'auto' ? { roofAxis } : {}),
      ...(pendingRoofs.size ? { pendingRoofs: [...pendingRoofs.values()] } : {}),
      terrain: world.snapshot(),
      roads: roads.map(road => ({ ...road })),
      paint: surfacePaint.map(paint => ({ ...paint, strokes: paint.strokes.map(stroke => ({ ...stroke })) })),
      depleted: world.depletedSnapshot(),
      minerals: { ...mineralInventory },
      mining: world.miningSnapshot(),
      ingots: { ...ingots },
      ironPickaxe,
      npcState: { ...npcState },
      health,
      tools: [...tools],
      ...(torch.crafted ? { torch: { ...torch } } : {}),
      calendar: { minute: gameMinutes, day, speed: gameSpeed },
      vehicle: { x: vehicle.position.x, z: vehicle.position.z },
    }, 'primary');
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Save transaction aborted'));
    });
    db.close();
    if (notify) toast('World saved');
    return true;
  } catch (error) {
    console.error('Could not save world', error);
    toast('Could not save world. Check browser storage.');
    return false;
  }
}

async function loadGame() {
  try {
    const saved = await readSaveRecord('primary');
    if (!saved) { toast('No saved world found'); return false; }
    if (!isSaveData(saved)) { toast('Save is invalid or from an unsupported version'); return false; }
      if (saved.version < 6) {
        const backupDb = await openDatabase();
        const backupTx = backupDb.transaction('saves', 'readwrite');
        const store = backupTx.objectStore('saves');
        const existing = store.get('pre-planet-backup');
        existing.onsuccess = () => { if (!existing.result) store.put(saved, 'pre-planet-backup'); };
        await new Promise<void>((resolve, reject) => {
          backupTx.oncomplete = () => resolve();
          backupTx.onerror = () => reject(backupTx.error);
          backupTx.onabort = () => reject(backupTx.error ?? new Error('Legacy backup transaction aborted'));
        });
        backupDb.close();
      }
      if (saved.version < 7) {
        const backupDb = await openDatabase();
        const backupTx = backupDb.transaction('saves', 'readwrite');
        const store = backupTx.objectStore('saves');
        const existing = store.get('pre-construction-backup');
        existing.onsuccess = () => { if (!existing.result) store.put(saved, 'pre-construction-backup'); };
        await new Promise<void>((resolve, reject) => {
          backupTx.oncomplete = () => resolve();
          backupTx.onerror = () => reject(backupTx.error);
          backupTx.onabort = () => reject(backupTx.error ?? new Error('Construction backup transaction aborted'));
        });
        backupDb.close();
      }
      if (saved.version < 8) {
        const backupDb = await openDatabase();
        const backupTx = backupDb.transaction('saves', 'readwrite');
        const store = backupTx.objectStore('saves');
        const existing = store.get('pre-economy-backup');
        existing.onsuccess = () => { if (!existing.result) store.put(saved, 'pre-economy-backup'); };
        await new Promise<void>((resolve, reject) => {
          backupTx.oncomplete = () => resolve();
          backupTx.onerror = () => reject(backupTx.error);
          backupTx.onabort = () => reject(backupTx.error ?? new Error('Economy backup transaction aborted'));
        });
        backupDb.close();
      }
      if (saved.version < 9) {
        const backupDb = await openDatabase();
        const backupTx = backupDb.transaction('saves', 'readwrite');
        const store = backupTx.objectStore('saves');
        const existing = store.get('pre-glass-backup');
        existing.onsuccess = () => { if (!existing.result) store.put(saved, 'pre-glass-backup'); };
        await new Promise<void>((resolve, reject) => {
          backupTx.oncomplete = () => resolve();
          backupTx.onerror = () => reject(backupTx.error);
          backupTx.onabort = () => reject(backupTx.error ?? new Error('Glass backup transaction aborted'));
        });
        backupDb.close();
      }
      if (saved.version < 10) {
        const backupDb = await openDatabase();
        const backupTx = backupDb.transaction('saves', 'readwrite');
        const store = backupTx.objectStore('saves');
        const existing = store.get('pre-engineering-backup');
        existing.onsuccess = () => { if (!existing.result) store.put(saved, 'pre-engineering-backup'); };
        await new Promise<void>((resolve, reject) => {
          backupTx.oncomplete = () => resolve();
          backupTx.onerror = () => reject(backupTx.error);
          backupTx.onabort = () => reject(backupTx.error ?? new Error('Engineering backup transaction aborted'));
        });
        backupDb.close();
      }
      const save = saved;
      seed = save.seed;
      outfit = save.outfit;
      appearance = save.appearance ?? defaultAppearance(save.outfit);
      characterName = save.playerName ?? 'Survivor';
      npcAppearanceSeed = save.npcAppearanceSeed ?? (((seed >>> 0) + 53917) >>> 0);
      resetWorld();
      if (save.wildlife) resetWildlife(save.wildlife);
      Object.assign(resources, save.resources);
      Object.assign(mineralInventory, save.version >= 8 ? save.minerals : emptyMinerals());
      Object.assign(ingots, { iron: save.version >= 8 ? save.ingots?.iron ?? 0 : 0,
        copper: save.version >= 8 ? save.ingots?.copper ?? 0 : 0, glass: save.version >= 9 ? save.ingots?.glass ?? 0 : 0 });
      ironPickaxe = save.version >= 8 && Boolean(save.ironPickaxe);
      if (save.npcState) Object.assign(npcState, save.npcState);
      health = save.health ?? 100;
      tools.push(...(save.tools ?? []));
      Object.assign(torch, save.torch ?? { crafted: false, equipped: false, lit: false });
      world.updateChunks(save.player.x, save.player.z, true);
      world.restore(save.terrain);
      world.restoreDepleted(save.depleted ?? []);
      world.restoreMining(save.version >= 8 ? (save.mining ?? {}) : {});
      player.position.set(save.player.x, world.heightAt(save.player.x, save.player.z), save.player.z);
      npc.position.set(save.npc.x, world.heightAt(save.npc.x, save.npc.z), save.npc.z);
      vehicle.position.set(save.vehicle.x, world.heightAt(save.vehicle.x, save.vehicle.z), save.vehicle.z);
      gameMinutes = save.calendar.minute;
      day = save.calendar.day;
      gameSpeed = save.calendar.speed ?? 2.2;
      (document.querySelector('#gameSpeed') as HTMLInputElement).value = String(gameSpeed);
      save.buildings.forEach(record => {
        const building = createBuilding(record.kind);
        building.position.set(record.x, world.heightAt(record.x, record.z), record.z);
        building.rotation.y = record.rotation;
        scene.add(building);
        buildings.push(building);
        buildingRecords.push({ ...record, charge: record.charge ?? 0, powered: false });
      });
      structures.push(...(save.structures ?? []).map(piece => ({ ...piece })));
      roads.splice(0, roads.length, ...(save.roads ?? []).map(road => ({ ...road })));
      surfacePaint.splice(0, surfacePaint.length, ...(save.paint ?? []).map(paint => ({ ...paint, strokes: paint.strokes.map(stroke => ({ ...stroke })) })));
      refreshRoads();
      refreshPaintMarkers();
      world.setDepositExclusions([
        ...buildingRecords.map(record => ({ x: record.x, z: record.z, radius: buildingRadius(record.kind) + 0.45 })),
        ...structures.map(piece => ({ x: piece.x, z: piece.z, radius: 1 })),
      ]);
      autoRoof = save.autoRoof ?? true;
      roofStyle = save.roofStyle ?? 'flat';
      roofAxis = save.roofAxis ?? 'auto';
      for (const request of save.pendingRoofs ?? []) pendingRoofs.set(roofKey(request), { ...request });
      (document.querySelector('#autoRoof') as HTMLInputElement).checked = autoRoof;
      (document.querySelector('#roofStyle') as HTMLSelectElement).value = roofStyle;
      (document.querySelector('#roofAxis') as HTMLSelectElement).value = roofAxis;
      constructionRenderer.refresh(structures, surfacePaint);
      if (save.player.y !== undefined) {
        player.position.y = floorSurface(structures, player.position.x, player.position.z, save.player.y, world.heightAt(player.position.x, player.position.z));
      }
      updatePowerLines();
      startGame();
      updateResources();
      updateObjective();
      return true;
  } catch (error) {
    console.error('Could not load world', error);
    toast('Could not load local save');
    return false;
  }
}

setupPwa({
  hasActiveGame: () => gameStarted,
  prepareUpdate: async () => {
    if (!gameStarted) return true;
    releasePointerLock();
    pausedBeforeUpdate = paused;
    updatePending = true;
    paused = true;
    keys.clear();
    move.set(0, 0);
    return saveGame(false);
  },
  cancelUpdate: () => {
    if (updatePending) paused = pausedBeforeUpdate;
    updatePending = false;
  },
  notify: toast,
});
try {
  if (sessionStorage.getItem(UPDATE_RESUME_KEY) === '1') {
    void loadGame().then(loaded => {
      if (!loaded) { toast('Could not restore the world after updating. Try Continue.'); return; }
      try { sessionStorage.removeItem(UPDATE_RESUME_KEY); }
      catch (error) { console.warn('Could not clear update resume marker', error); }
    });
  }
} catch (error) {
  console.warn('Could not access update resume marker', error);
  toast('Automatic update recovery is unavailable. Use Continue to load your save.');
}
