import * as THREE from 'three';
import './style.css';
import { World, safeSpawn, seededNoise } from './world';
import { cameraRelativeMovement, clampCameraDistance, dampAngle, defaultCameraSettings } from './camera';
import { buildingCosts, buildingRadius, canAfford, placementProblem, craftTool, daylightAt, isNight, spend, type BuildingKind, type Inventory, type Tool } from './gameplay';
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
import { chooseEnemyKind, enemyIntent, enemyProfiles, stepEnemyProjectile, type EnemyKind } from './enemies';
import { enterImmersiveMode, setupPwa, UPDATE_RESUME_KEY } from './pwa';
import {
  createCharacter, createShelter, createStorage, createLamp, createGenerator,
  createWindTurbine, createVehicle, createEnemy, createBattery, createCable, type Outfit,
} from './assets';

type Resources = Inventory;
type BuildingRecord = PowerNode & { y: number; rotation: number };

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
        <div class="character-options"><h3>APPEARANCE</h3><div id="appearanceFields"></div><button id="finishCharacter" class="primary" type="button">DONE</button></div>
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
    <div id="resources" class="resources"></div>
    <div id="controlsHint">WASD move · Shift run · E interact · Space gather · B build</div>
    <div id="joystick"><div id="stick"></div></div>
    <div class="mobile-actions"><button id="exitVehicle" class="hidden">EXIT</button><button id="actionA">A<span>Gather</span></button><button id="actionB">B<span>Interact</span></button></div>
    <div class="quickbar"><button data-tool="axe" class="selected">⛏<small>Tool</small></button><button data-tool="build">▦<small>Build</small></button><button id="inventoryButton">▣<small>Pack</small></button></div>
  </div>
  <div id="buildPanel" class="panel hidden" role="dialog" aria-labelledby="buildTitle"><h2 id="buildTitle">CHOOSE A BUILDING</h2><p>Select a structure to start placing it.</p><div id="buildCatalog"></div><button id="closeBuild" class="close" aria-label="Close build menu">×</button></div>
  <div id="placementToolbar" class="placement-toolbar hidden" aria-label="Building placement">
    <strong id="placementName"></strong><span id="placementStatus" role="status"></span><small id="placementCoordinates"></small>
    <div class="placement-buttons"><button id="rotateBuild" type="button">ROTATE <kbd>R</kbd></button><button id="changeBuild" type="button">CHANGE</button><button id="confirmBuild" type="button">PLACE</button><button id="cancelBuild" type="button">CANCEL</button></div>
    <small class="placement-hint">Point at ground · Click to place · Right-drag to orbit</small>
  </div>
  <div id="npcPanel" class="panel hidden"><h2>MIRA · SURVIVOR</h2><p id="npcStatus">A friendly survivor.</p><button id="npcRecruit" class="primary">RECRUIT</button><button data-job="wood" class="secondary">GATHER WOOD</button><button data-job="stone" class="secondary">GATHER STONE</button><button data-job="idle" class="secondary">REST</button><button id="closeNpc" class="close" aria-label="Close survivor menu">×</button></div>
  <div id="craftPanel" class="panel hidden"><h2>CRAFTING</h2><p>Tools increase the yield from each resource.</p><button data-craft="axe" class="secondary">AXE · 3 WOOD, 2 STONE</button><button data-craft="pickaxe" class="secondary">PICKAXE · 2 WOOD, 3 STONE</button><p id="toolStatus"></p><button id="closeCraft" class="close" aria-label="Close crafting">×</button></div>
  <div id="pausePanel" class="panel hidden"><h2>PAUSED</h2>
    <label class="setting">Auto follow <input id="cameraFollow" type="checkbox" checked></label>
    <label class="setting">Camera distance <input id="cameraDistance" type="range" min="5" max="24" step="1" value="12"></label>
    <label class="setting">Rotation speed <input id="cameraSpeed" type="range" min="0.3" max="2" step="0.1" value="1"></label>
    <label class="setting">Smoothing <input id="cameraSmoothing" type="range" min="2" max="12" step="1" value="5"></label>
    <label class="setting">Game speed <input id="gameSpeed" type="range" min="0.5" max="8" step="0.1" value="2.2"></label>
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

let seed = 1847;
let world = new World(seed);
scene.add(world.group);

let outfit: Outfit = 'ember';
let appearance: CharacterAppearance = { ...defaultAppearance(outfit), clothing: 'tunic' };
let characterName = 'Survivor';
let npcAppearanceSeed = ((seed >>> 0) + 53917) >>> 0;
let player = createCharacter(appearance);
player.position.set(0, world.heightAt(0, 0), 5);
scene.add(player);

let npc = createCharacter(appearanceFromSeed(npcAppearanceSeed));
npc.position.set(-4, world.heightAt(-4, 2), 2);
scene.add(npc);

const vehicle = createVehicle();
vehicle.position.set(8, world.heightAt(8, 4), 4);
scene.add(vehicle);

const resources: Resources = { wood: 0, stone: 0, food: 3, water: 3 };
const tools: Tool[] = [];
const buildings: THREE.Group[] = [];
const buildingRecords: BuildingRecord[] = [];
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
let buildKind: BuildingKind = 'shelter';
let buildGhost: THREE.Group | null = null;
let buildRotation = 0;
const buildTarget = new THREE.Vector3();
const placementRay = new THREE.Raycaster();
const placementPointer = new THREE.Vector2();
let placementFootprint: THREE.Mesh | null = null;
let ghostMaterial: THREE.MeshBasicMaterial | null = null;
let targetOnTerrain = true;
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
    if (!document.querySelector('#updatePanel')!.classList.contains('hidden')) return;
    if (!document.querySelector('#pausePanel')!.classList.contains('hidden')) togglePause();
    else if (!document.querySelector('#buildPanel')!.classList.contains('hidden') || buildMode) cancelBuild();
    else if (!document.querySelector('#craftPanel')!.classList.contains('hidden')) document.querySelector('#craftPanel')!.classList.add('hidden');
    else if (!document.querySelector('#npcPanel')!.classList.contains('hidden')) document.querySelector('#npcPanel')!.classList.add('hidden');
    else togglePause();
    return;
  }
  if (!gameStarted || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || gameplayBlocked()
    || (event.target instanceof HTMLButtonElement && event.target.getClientRects().length > 0
      && ['Space', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code))) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  keys.add(event.code);
  if (event.repeat) return;
  if (event.code === 'KeyB') toggleBuild();
  if (event.code === 'KeyE') interact();
  if (event.code === 'Space') buildMode ? placeBuilding() : gather();
  if (event.code === 'KeyR' && buildMode) buildRotation += Math.PI / 2;
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
canvas.addEventListener('contextmenu', event => event.preventDefault());
canvas.addEventListener('pointerdown', event => {
  if (!gameStarted || gameplayBlocked() || pointerOverHud(event.clientX, event.clientY)) return;
  if (event.pointerType === 'mouse' && event.button === 0) {
    if (buildGhost) leftClickStart = { x: event.clientX, y: event.clientY };
    return;
  }
  if (event.pointerType === 'mouse' && event.button !== 2) return;
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
  let lastTouchActivation = -Infinity;
  button.addEventListener('pointerdown', event => {
    if (gameplayBlocked()) return;
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
    if (tapped && !driving && !gameplayBlocked()) {
      lastTouchActivation = performance.now();
      action();
    }
  });
  for (const eventName of ['pointercancel', 'lostpointercapture']) {
    button.addEventListener(eventName, () => { touch = null; setDrivingInput(false); });
  }
  button.addEventListener('click', event => {
    if (event.detail !== 0 && performance.now() - lastTouchActivation < 700) return;
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
document.querySelector('#rotateBuild')!.addEventListener('click', () => { if (!gameplayBlocked() && buildGhost) buildRotation += Math.PI / 2; });
document.querySelector('#confirmBuild')!.addEventListener('click', placeBuilding);
document.querySelector('#cancelBuild')!.addEventListener('click', cancelBuild);
document.querySelector('#changeBuild')!.addEventListener('click', showBuildCatalog);
document.querySelector('#cameraFollow')!.addEventListener('change', event => { cameraSettings.autoFollow = (event.target as HTMLInputElement).checked; });
document.querySelector('#cameraDistance')!.addEventListener('input', event => { cameraSettings.distance = clampCameraDistance(Number((event.target as HTMLInputElement).value)); });
document.querySelector('#cameraSpeed')!.addEventListener('input', event => { cameraSettings.rotationSpeed = Number((event.target as HTMLInputElement).value); });
document.querySelector('#cameraSmoothing')!.addEventListener('input', event => { cameraSettings.smoothing = Number((event.target as HTMLInputElement).value); });
document.querySelector('#gameSpeed')!.addEventListener('input', event => { gameSpeed = Number((event.target as HTMLInputElement).value); });

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
document.querySelector('#exitFullscreen')!.addEventListener('click', () => {
  if (document.fullscreenElement) void document.exitFullscreen().catch(error => console.warn('Could not exit fullscreen', error));
});
document.querySelector('#pauseButton')!.addEventListener('click', togglePause);
document.querySelector('#resumeGame')!.addEventListener('click', togglePause);
document.querySelector('#saveGame')!.addEventListener('click', () => saveGame(true));
document.querySelector('#returnMenu')!.addEventListener('click', () => location.reload());
document.querySelector('#closeBuild')!.addEventListener('click', cancelBuild);
document.querySelector('#inventoryButton')!.addEventListener('click', () => {
  if (paused || driving || buildMode || !document.querySelector('#npcPanel')!.classList.contains('hidden')) return;
  document.querySelector('#toolStatus')!.textContent = `Tools: ${tools.join(', ') || 'none'}`;
  document.querySelector('#craftPanel')!.classList.toggle('hidden');
  clearMovement();
});
document.querySelector('#closeCraft')!.addEventListener('click', () => document.querySelector('#craftPanel')!.classList.add('hidden'));
document.querySelectorAll<HTMLButtonElement>('[data-craft]').forEach(button => button.addEventListener('click', () => {
  const tool = button.dataset.craft as Tool;
  if (tools.includes(tool)) { toast('Already crafted'); return; }
  if (!craftTool(resources, tools, tool)) { toast('Not enough resources'); return; }
  updateResources();
  document.querySelector('#toolStatus')!.textContent = `Tools: ${tools.join(', ')}`;
  toast(`${tool} crafted`);
}));
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

const catalog: Array<{ kind: BuildingKind; name: string; cost: Partial<Resources>; icon: string }> = [
  { kind: 'shelter', name: 'Shelter', cost: buildingCosts.shelter, icon: '⌂' },
  { kind: 'storage', name: 'Storage', cost: buildingCosts.storage, icon: '▣' },
  { kind: 'lamp', name: 'Lamp', cost: buildingCosts.lamp, icon: '◉' },
  { kind: 'generator', name: 'Generator', cost: buildingCosts.generator, icon: '⚙' },
  { kind: 'turbine', name: 'Wind Turbine', cost: buildingCosts.turbine, icon: '✣' },
  { kind: 'battery', name: 'Battery', cost: buildingCosts.battery, icon: '▰' },
  { kind: 'cable', name: 'Cable post', cost: buildingCosts.cable, icon: '⌁' },
];
const buildCatalog = document.querySelector('#buildCatalog')!;
catalog.forEach(item => {
  const button = document.createElement('button');
  button.dataset.building = item.kind;
  button.innerHTML = `<span>${item.icon}</span><strong>${item.name}</strong><small>${item.cost.wood ? `${item.cost.wood} wood ` : ''}${item.cost.stone ? `${item.cost.stone} stone` : ''}</small>`;
  button.addEventListener('click', () => selectBuild(item.kind));
  buildCatalog.append(button);
});

function resetWorld() {
  scene.remove(world.group);
  world.dispose();
  world = new World(seed);
  scene.add(world.group);
  scene.remove(player);
  scene.remove(npc);
  disposeCharacter(player);
  disposeCharacter(npc);
  npc = createCharacter(appearanceFromSeed(npcAppearanceSeed));
  scene.add(npc);
  for (const building of buildings) scene.remove(building);
  buildings.length = 0;
  buildingRecords.length = 0;
  updatePowerLines();
  enemies.forEach(enemy => { scene.remove(enemy); disposeCharacter(enemy); });
  enemies.length = 0;
  enemyProjectiles.forEach(projectile => scene.remove(projectile.mesh));
  enemyProjectiles.length = 0;
  spawnCooldown = 0;
  enemyHitCooldown = 0;
  Object.assign(resources, { wood: 0, stone: 0, food: 3, water: 3 });
  tools.length = 0;
  Object.assign(npcState, { recruited: false, job: 'idle', carrying: null });
  health = 100;
  const spawn = safeSpawn(seed)!;
  resetWildlife(createWildlife(seed, spawn));
  npc.position.set(spawn.x - 4, world.heightAt(spawn.x - 4, spawn.z - 3), spawn.z - 3);
  vehicle.position.set(spawn.x + 8, world.heightAt(spawn.x + 8, spawn.z - 1), spawn.z - 1);
  player = createCharacter(appearance);
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
  toast('Find wood and stone to begin');
}

function togglePause() {
  if (!gameStarted || updatePending) return;
  paused = !paused;
  if (paused) {
    document.querySelector('#npcPanel')!.classList.add('hidden');
    document.querySelector('#craftPanel')!.classList.add('hidden');
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

function gameplayBlocked() {
  return paused || updatePending || !document.querySelector('#buildPanel')!.classList.contains('hidden')
    || !document.querySelector('#craftPanel')!.classList.contains('hidden')
    || !document.querySelector('#npcPanel')!.classList.contains('hidden')
    || !document.querySelector('#updatePanel')!.classList.contains('hidden');
}

function toggleBuild() {
  if (!gameStarted || driving || gameplayBlocked()) return;
  if (buildMode) { cancelBuild(); return; }
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

function selectBuild(kind: BuildingKind) {
  if (!buildMode) return;
  buildKind = kind;
  removeGhost();
  buildGhost = createBuilding(kind);
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
  const radius = buildingRadius(kind);
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
  buildTarget.set(x, world.heightAt(x, z), z);
  buildGhost.position.copy(buildTarget);
  targetOnTerrain = true;
  scene.add(buildGhost);
  if (document.activeElement instanceof HTMLElement && document.querySelector('#buildPanel')!.contains(document.activeElement)) document.activeElement.blur();
  document.querySelector('#buildPanel')!.classList.add('hidden');
  document.querySelector('#placementToolbar')!.classList.remove('hidden');
  const item = catalog.find(entry => entry.kind === kind)!;
  document.querySelector('#placementName')!.textContent = `${item.name} · ${Object.entries(item.cost).map(([resource, amount]) => `${amount} ${resource}`).join(' / ')}`;
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
    const x = Math.round(point.x);
    const z = Math.round(point.z);
    buildTarget.set(x, world.heightAt(x, z), z);
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
  const problem = placementProblem(buildTarget, buildKind, buildTarget.y, buildingRecords, player.position);
  if (problem) return problem;
  const footprint = buildingRadius(buildKind);
  if (Math.hypot(buildTarget.x - npc.position.x, buildTarget.z - npc.position.z) < footprint + 0.6) return 'Move away from Mira';
  if (Math.hypot(buildTarget.x - vehicle.position.x, buildTarget.z - vehicle.position.z) < footprint + 1.2) return 'Move away from the rover';
  if (world.findNearest(buildTarget.x, buildTarget.z, footprint + 0.45)) return 'Clear nearby resources';
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
  const message = problem ?? 'Ready to place';
  if (status.textContent !== message) status.textContent = message;
  status.classList.toggle('invalid', Boolean(problem));
  const coordinates = document.querySelector('#placementCoordinates')!;
  const grid = `Grid ${buildTarget.x}, ${buildTarget.z}`;
  if (coordinates.textContent !== grid) coordinates.textContent = grid;
}

function createBuilding(kind: BuildingKind) {
  if (kind === 'storage') return createStorage();
  if (kind === 'lamp') return createLamp();
  if (kind === 'generator') return createGenerator();
  if (kind === 'turbine') return createWindTurbine();
  if (kind === 'battery') return createBattery();
  if (kind === 'cable') return createCable();
  return createShelter();
}

function placeBuilding() {
  if (!buildGhost || gameplayBlocked()) return;
  const item = catalog.find(entry => entry.kind === buildKind)!;
  const problem = placementIssue();
  if (problem) { toast(problem); return; }
  if (!spend(resources, item.cost)) { toast('Not enough resources'); return; }
  const building = createBuilding(buildKind);
  animationAction = 'build';
  animationActionTime = 0.6;
  building.position.copy(buildTarget);
  building.rotation.y = buildRotation;
  scene.add(building);
  buildings.push(building);
  buildingRecords.push({ kind: buildKind, x: building.position.x, z: building.position.z, y: building.position.y, rotation: buildRotation, charge: 0, powered: false });
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
  if (vehicle.position.distanceTo(player.position) < 3.2) {
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
  document.querySelector('#resources')!.innerHTML =
    `<div><b>🌲</b><span>${resources.wood}</span></div><div><b>◆</b><span>${resources.stone}</span></div><div><b>◒</b><span>${resources.food}</span></div><div><b>💧</b><span>${resources.water}</span></div>`;
  (document.querySelector('#healthBar') as HTMLElement).style.width = `${health}%`;
}

function toast(message: string) {
  const element = document.querySelector('#toast')!;
  element.textContent = message;
  element.classList.add('visible');
  clearTimeout((toast as any)._timer);
  (toast as any)._timer = setTimeout(() => element.classList.remove('visible'), 1800);
}

function showMap() {
  if (gameStarted && !gameplayBlocked()) toast(`Local map: ${Math.round(player.position.x)}, ${Math.round(player.position.z)} (bounded island)`);
}

let last = performance.now();
function animate(now: number) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (preview && !document.querySelector('#characterPanel')!.classList.contains('hidden')) preview.render(now);
  if (!gameStarted || gameplayBlocked()) {
    renderer.render(scene, camera);
    return;
  }
  updateGame(dt);
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

function updateGame(dt: number) {
  effects.update(dt);
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
  precipitation.update(weather, driving ? vehicle.position : player.position, dt);
  const daylight = daylightAt(gameMinutes);
  ambient.intensity = 0.45 + daylight * 1.55;
  sun.intensity = daylight * (weather === 'Storm' ? 1.2 : weather === 'Cloudy' || weather === 'Rain' || weather === 'Snow' ? 2 : 3);
  scene.background = new THREE.Color().setHSL(0.53, 0.32, 0.42 + daylight * 0.28);
  if (scene.fog instanceof THREE.Fog) scene.fog.color.copy(scene.background);

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
    const nextX = THREE.MathUtils.clamp(vehicle.position.x + dx * vehicleSpeed * dt, -47, 47);
    const nextZ = THREE.MathUtils.clamp(vehicle.position.z + dz * vehicleSpeed * dt, -47, 47);
    const blocked = buildingRecords.some(b => Math.hypot(nextX - b.x, nextZ - b.z) < (b.kind === 'shelter' ? 2.4 : 1.8));
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
    if (previousInput.lengthSq() === 0 || previousInput.distanceTo(inputDirection) > 0.35) {
      movementBasis = cameraAngle;
      previousInput.copy(inputDirection);
    }
    const direction = cameraRelativeMovement(inputX, inputZ, movementBasis);
    const dx = direction.x;
    const dz = direction.y;
    const target = player;
    const nextX = THREE.MathUtils.clamp(target.position.x + dx * speed * dt, -47, 47);
    const nextZ = THREE.MathUtils.clamp(target.position.z + dz * speed * dt, -47, 47);
    const collides = buildingRecords.some(b => Math.hypot(nextX - b.x, nextZ - b.z) < (b.kind === 'shelter' ? 2 : b.kind === 'storage' ? 1.6 : 1));
    if (!collides && world.heightAt(nextX, nextZ) > -0.5) {
      target.position.x = nextX;
      target.position.z = nextZ;
      actualMovement = length;
    }
    target.position.y = world.heightAt(target.position.x, target.position.z);
    const heading = Math.atan2(dx, dz);
    target.rotation.y = dampAngle(target.rotation.y, heading, 10, dt);
    if (!buildMode && cameraSettings.autoFollow && performance.now() > manualCameraUntil) {
      cameraAngle = dampAngle(cameraAngle, Math.atan2(-dx, -dz), 2.2, dt);
    }
  } else previousInput.set(0, 0);

  if (driving) {
    player.position.copy(vehicle.position).add(new THREE.Vector3(0, 1, 0));
  }

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
  });

  if (isNight(gameMinutes) && enemies.length < 2 && spawnCooldown === 0) {
    const angle = seededNoise(day, elapsed * 0.001, seed) * Math.PI * 2;
    const x = THREE.MathUtils.clamp(player.position.x + Math.cos(angle) * 12, -46, 46);
    const z = THREE.MathUtils.clamp(player.position.z + Math.sin(angle) * 12, -46, 46);
    if (world.heightAt(x, z) > 0.2 && buildingRecords.every(b => Math.hypot(x - b.x, z - b.z) > 4)) {
      const kind = chooseEnemyKind(day, seededNoise(x, z, seed + day));
      const enemy = createEnemy(kind);
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
    buildGhost.position.y = world.heightAt(buildGhost.position.x, buildGhost.position.z);
    buildGhost.rotation.y = buildRotation;
    updatePlacement();
  }

  const focus = driving ? vehicle.position : player.position;
  const look = new THREE.Vector3(focus.x, focus.y + (driving ? 1.9 : 1.8), focus.z);
  if (buildGhost?.visible) {
    const offset = buildTarget.clone().sub(player.position).setY(0).multiplyScalar(0.25).clampLength(0, 3);
    look.add(offset);
  }
  if (!cameraReady) { cameraFocus.copy(look); cameraReady = true; }
  cameraFocus.lerp(look, 1 - Math.exp(-cameraSettings.smoothing * dt));
  const distance = Math.min(24, cameraSettings.distance + (driving ? 2 : 0));
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
  const hit = cameraRay.intersectObjects(buildings, true)[0];
  if (hit && hit.distance > 0.3) cameraDesired.copy(cameraFocus).addScaledVector(rayDirection, Math.max(0.5, hit.distance - 0.35));
  const unobstructedDistance = cameraDesired.distanceTo(cameraFocus);
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

  animateCharacter(player, dt, actualMovement, keys.has('ShiftLeft'), animationActionTime > 0 ? animationAction : undefined);
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
      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(a.x, a.y + 0.95, a.z), new THREE.Vector3(b.x, b.y + 0.95, b.z),
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
    } else {
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

async function saveGame(notify: boolean) {
  if (!gameStarted) return false;
  try {
    const db = await openDatabase();
    const tx = db.transaction('saves', 'readwrite');
    tx.objectStore('saves').put({
      version: 5,
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
      terrain: world.snapshot(),
      depleted: world.depletedSnapshot(),
      npcState: { ...npcState },
      health,
      tools: [...tools],
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
    const db = await openDatabase();
    const tx = db.transaction('saves', 'readonly');
    const request = tx.objectStore('saves').get('primary');
    const saved: unknown = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (!saved) { toast('No saved world found'); return false; }
    if (!isSaveData(saved)) { toast('Save is invalid or from an unsupported version'); return false; }
      const save = saved;
      seed = save.seed;
      outfit = save.outfit;
      appearance = save.appearance ?? defaultAppearance(save.outfit);
      characterName = save.playerName ?? 'Survivor';
      npcAppearanceSeed = save.npcAppearanceSeed ?? (((seed >>> 0) + 53917) >>> 0);
      resetWorld();
      if (save.wildlife) resetWildlife(save.wildlife);
      Object.assign(resources, save.resources);
      if (save.npcState) Object.assign(npcState, save.npcState);
      health = save.health ?? 100;
      tools.push(...(save.tools ?? []));
      player.position.set(save.player.x, world.heightAt(save.player.x, save.player.z), save.player.z);
      npc.position.set(save.npc.x, world.heightAt(save.npc.x, save.npc.z), save.npc.z);
      vehicle.position.set(save.vehicle.x, world.heightAt(save.vehicle.x, save.vehicle.z), save.vehicle.z);
      world.restore(save.terrain);
      world.restoreDepleted(save.depleted ?? []);
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
      updatePowerLines();
      updateResources();
      updateObjective();
      startGame();
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
