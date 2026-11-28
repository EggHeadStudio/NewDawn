import * as THREE from 'three';
import { onboardingObjective, type OnboardingState } from './onboarding';
import './style.css';
import { World, biomeAt, safeSpawn, seededNoise } from './world';
import { TreeClearance } from './tree-occlusion';
import { TREE_WORK_REACH } from './tree-harvest';
import { atlasBiomeAtCell, atlasBiomeColors } from './atlas';
import { cameraPitchView, cameraRelativeMovement, clampCameraDistance, clampCameraPitch, dampAngle, defaultCameraSettings } from './camera';
import { buildingCosts, buildingRadius, canAfford, placementProblem, craftTool, isNight, spend, type BuildingKind, type Inventory, type Tool } from './gameplay';
import { isSaveData, toolsFromSave } from './save';
import { chooseNpcActivity, type NpcJob, type NpcState } from './npc';
import { areConnected, updatePower, type PowerNode } from './power';
import { Effects, Precipitation } from './effects';
import { seasonForDay, weatherForDay } from './calendar';
import { appearanceFromSeed, appearanceLabels, appearanceOptions, defaultAppearance, type CharacterAppearance } from './appearance';
import { CharacterPreview } from './character-preview';
import { createWildlife, updateWildlife, type AnimalState } from './wildlife';
import { animateAnimal, createAnimal, disposeAnimal, updateBirdFlightHeight } from './animal-assets';
import { attachAuthoredAnimal, updateAuthoredAnimal } from './authored-animal';
import { disposeCharacter } from './characters';
import { attachAuthoredCharacter, setAuthoredBackpackVisible, updateAuthoredCharacter, visibleCharacterTool } from './authored-character';
import { chooseEnemyKind, enemyIntent, enemyProfiles, stepEnemyProjectile, type EnemyKind } from './enemies';
import { enterImmersiveMode, setupPwa, UPDATE_RESUME_KEY } from './pwa';
import {
  geographicToPlanetPosition, movePlanetPosition, nearestPlanetPosition, planetBearingDegrees, planetCoordinates,
  planetDistanceMeters, planetOffset, planetPositionToGeographic,
} from './planet';
import { connectionLayout, roadCosts, roadSlots, type RoadKind, type RoadSegment } from './roads';
import { paintColors, type PaintPreset, type SurfacePaint } from './paint';
import { climateZone, geographicDistanceMeters, hierarchicalTileId, regionIdForCoordinates,
  geographicBearing, moveGeographic, seasonsForLatitude, transportBearing, type AtlasState, type GeographicPosition, type MapMarker } from './geography';
import { rayIsObstructed, resolvePlanetActorMove, structuralPieceBlocks } from './physics';
import { PlanetaryProjectile } from './planetary-projectile';
import { PlanetaryRuntimeFrame } from './runtime-frame';
import { addPiece, FLOOR_HEIGHT, floorSurface, isEdgePiece, pieceBlocks, pieceCosts, removePiece, replacePiece, replacementProblem, replacementTarget, snapPiece, suggestFloorEdge, type PieceKind, type PieceRotation, type RoofStyle, type StructuralPiece } from './construction';
import { reconcileRoof, reshapeRoof, type RoofAxis, type RoofRequest } from './roof';
import { ConstructionRenderer, createPieceGhost } from './construction-render';
import { emptyMinerals, requiresPickaxe, type DepositKind } from './economy';
import { advanceSmelting, startSmelting, type SmeltableOre, type SmeltingJob } from './smelting';
import { atmosphericFogRange, environmentLighting, moonlitSceneLighting } from './environment-lighting';
import { celestialState, Sky } from './sky';
import { WaterEffects } from './water-effects';
import { Footprints, footprintSurface } from './footprints';
import { FrameSamples, SustainedBenchmark } from './performance-monitor';
import { renderPixelRatio } from './render-quality';
import {
  canExitRover, commitRoverDrive, getRoverVisual, proposeRoverDrive, roverWheelSamplePoints,
  type RoverFour, type RoverWheel,
} from './rover';
import {
  combineCollisionQueries, createStructureCollisionQuery, createWildlifeCollision,
  type CollisionQuery,
} from './wildlife-collision';
import { craftTorch, nearbyFireLights, togglePostFlame, toggleTorchEquipment, toggleTorchFlame, type TorchState } from './fire';
import { attachHandTorch, createHandTorch, createTorchPost, FireSparks, fireLightIntensity, torchFirePosition, updateFireAnimation } from './fire-render';
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
type SelectedWeapon = 'fists' | 'stick' | 'axe' | 'stones' | 'saw';

const icons = {
  fists: '<path d="M5 11V8a2 2 0 0 1 4 0V6a2 2 0 0 1 4 0v1a2 2 0 0 1 4 0v2a2 2 0 0 1 3 2v4c0 3-2 5-5 5h-3c-3 0-5-2-6-4l-2-3a2 2 0 0 1 1-2Z"/><path d="M9 8v4m4-5v5m4-3v3"/>',
  stick: '<path d="m6 20 8-15c1-2 4-2 5 0s-1 4-2 5L9 21Z"/><path d="m7 16 3 2m-4 0 3 2"/>',
  axe: '<path d="m5 21 9-15 2 1L7 22Z"/><path d="M13 8 11 4c3 0 5-1 6-3 0 3 1 5 4 7l-4 3Z"/>',
  saw: '<path d="M3 16 15 4l5 2-1 5L7 21l-4-1Z"/><path d="m8 18 2 1m1-4 2 1m1-4 2 1m1-4 2 1M3 16l4 4"/>',
  stones: '<path d="m4 10 3-5 7-2 6 4 1 7-4 6-8 1-5-4Z"/><path d="m7 5 3 5-6 2m6-2 7 1 3-4m-3 4v9"/>',
  pickaxe: '<path d="M5 21 15 7m-2-2c3-2 6-1 8 2-3-1-5-1-7 1-2-1-4-1-7 0 1-2 3-3 6-3Z"/>',
  torch: '<path d="m9 12 2 9h2l2-9m-6 0h6M12 3c1 3 4 3 4 6a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 2 2 3 1-2 0-3 0-5Z"/>',
  pack: '<rect x="5" y="6" width="14" height="16" rx="3"/><path d="M9 6V4a3 3 0 0 1 6 0v2M5 13h14M9 13v4h6v-4"/>',
  wood: '<path d="m5 8 10-4 4 2v10l-10 4-4-2Z"/><path d="M9 20V10l10-4M5 8l4 2m4 2v5"/>',
  stone: '<path d="m3 14 4-8 8-2 6 7-3 8-10 1Z"/><path d="m7 6 3 6-7 2m7-2 7 1 4-2"/>',
  food: '<path d="M4 13h16c0 5-3 8-8 8s-8-3-8-8Zm3 0c0-4 2-6 5-7 3 1 5 3 5 7M12 6V3"/>',
  water: '<path d="M12 3S6 10 6 15a6 6 0 0 0 12 0c0-5-6-12-6-12Zm-3 13c.3 1.4 1.3 2 2.5 2"/>',
  mineral: '<path d="m4 15 3-8 6-3 7 5 1 7-5 4H8Z"/><path d="m7 7 4 4-3 9m3-9 9-2m-9 2 5 9"/>',
  ingot: '<path d="m6 8 2-4h8l2 4 3 10H3L6 8Zm0 0h12M3 18h18"/>',
  glass: '<path d="M7 3h10l-1 7-4 3-4-3-1-7Zm5 10v7m-4 1h8"/>',
  flame: '<path d="M12 2c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 1-5 3-7 0 3 1 4 2 5 2-3 0-5 0-8Z"/>',
} as const;
type IconName = keyof typeof icons;
const icon = (name: IconName) => `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;

function isPieceKind(kind: BuildKind): kind is PieceKind {
  return Object.hasOwn(pieceCosts, kind);
}

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <canvas id="game"></canvas>
  <div id="menu" class="screen active">
    <div class="menu-vignette"></div>
    <div class="brand"><span>EggHeadStudio</span><h1><img class="brand-logo" src="${import.meta.env.BASE_URL}assets/branding/newdawn-logo.png" width="1024" height="341" alt="NEW DAWN" /></h1></div>
    <div class="menu-card">
      <h2>BEGIN A WORLD</h2>
      <label>World name <input id="worldName" value="Pinehaven"/></label>
      <label>World seed <input id="worldSeed" type="number" value="1847"/></label>
      <label>Character name <input id="playerName" maxlength="24" value="Survivor" autocomplete="off"/></label>
      <label>Introduction <select id="introductionChoice"><option value="guide">Guided introduction</option><option value="free">Free exploration</option></select></label>
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
    <canvas id="minimap" width="180" height="180" role="button" tabindex="0" aria-label="Open world atlas"></canvas>
    <div id="objective" class="objective"><span id="survivorLabel">FIRST STEPS</span><strong id="objectiveText">Gather wood and stone</strong></div>
    <div id="vehicleIndicator" class="vehicle-indicator hidden" aria-live="off">SPEED 0.0</div>
    <div id="shelterStatus" class="shelter-status hidden" aria-live="polite"></div>
    <div id="resources" class="resources">
      <button id="resourceToggle" class="resource-toggle" type="button" aria-expanded="false" aria-controls="resourceCounts" aria-label="Show all resource counts">
        <span aria-hidden="true">▣</span><span id="resourceSummary"></span><span class="resource-chevron" aria-hidden="true">⌃</span>
      </button>
      <div id="resourceCounts" class="resource-counts"></div>
    </div>
    <div id="controlsHint">Click world for mouse look · WASD move · E interact · Space gather · B build</div>
    <div id="joystick"><div id="stick"></div></div>
    <div class="mobile-actions" aria-label="Action pad">
      <button id="exitVehicle" class="hidden pad-exit" type="button" aria-label="Exit vehicle"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21H4V3h8v18ZM8 12h.01M14 12h7m-3-3 3 3-3 3"/></svg></button>
      <button id="jumpButton" class="pad-jump" aria-label="Jump"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20V4m-6 6 6-6 6 6"/></svg><span>Jump</span></button>
      <button id="actionA" class="pad-a" aria-label="Primary action"><strong>A</strong><span>Gather</span></button>
      <button id="actionB" class="pad-b" aria-label="Interact"><strong>B</strong><span>Interact</span></button>
      <button id="weaponButton" class="pad-weapon" aria-label="Attack with fists"><svg id="weaponIcon" viewBox="0 0 24 24" aria-hidden="true"></svg><span id="weaponLabel">Fists</span><b id="weaponAmmo" class="hidden"></b></button>
    </div>
    <div class="quickbar">
      <button id="toolHubButton" aria-label="Open tools, fists selected" aria-expanded="false" aria-controls="toolHub"><svg id="toolHubIcon" class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"></svg><small>Tools</small></button>
      <button data-tool="build" aria-label="Build structures">▦<small>Build</small></button>
      <button id="roadTool" class="hidden" aria-label="Build roads">Road</button>
      <button id="terrainTool" class="hidden" aria-label="Terrain editing">Terrain</button>
      <button id="paintTool" class="hidden" aria-label="Paint surfaces">Paint</button>
    </div>
  </div>
  <div id="buildPanel" class="panel hidden" role="dialog" aria-labelledby="buildTitle"><button id="closeBuild" class="close" aria-label="Close build menu">×</button><h2 id="buildTitle">CHOOSE A BUILDING</h2><p>Select a structure to start placing it.</p><div id="buildCatalog"></div></div>
  <div id="placementToolbar" class="placement-toolbar hidden" aria-label="Building placement">
    <strong id="placementName"></strong><span id="placementStatus" role="status"></span><small id="placementCoordinates"></small>
    <div id="floorControls" class="floor-controls hidden"><button id="floorDown" type="button" aria-label="Lower building level">−</button><span id="floorLevel">LEVEL 0</span><button id="floorUp" type="button" aria-label="Raise building level">+</button><button id="removePiece" type="button">REMOVE</button><button id="autoOrient" class="hidden" type="button">AUTO EDGE</button><label><input id="autoRoof" type="checkbox" checked> Auto roof</label></div>
    <details id="roofControls" class="hidden"><summary>ROOF STYLE</summary><div class="roof-controls"><label>Roof <select id="roofStyle" aria-label="Automatic roof style"><option value="flat">Flat</option><option value="gable" selected>Gable</option><option value="single">Single slope</option></select></label><label>Axis <select id="roofAxis" aria-label="Roof slope axis"><option value="auto">Auto</option><option value="x">East–west</option><option value="z">North–south</option></select></label><button id="applyRoof" type="button">APPLY TO AIMED ROOM</button><small>Reshape complete auto roof: 0 wood, no refund.</small></div></details>
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
  <div id="toolHub" class="tool-hub hidden" role="dialog" aria-label="Tool hub">
    <header><strong>TOOL HUB</strong><button id="closeToolHub" aria-label="Close tool hub">×</button></header>
    <div class="tool-hub-grid">
      <button id="inventoryButton" aria-label="Open pack and crafting">${icon('pack')}<span>Pack</span></button>
      <button data-hub="fists" aria-pressed="false">${icon('fists')}<span>Fists</span></button>
      <button data-hub="stick" aria-pressed="false">${icon('stick')}<span>Stick</span></button>
      <button data-hub="axe" aria-pressed="false">${icon('axe')}<span>Axe</span></button>
      <button data-hub="saw" aria-pressed="false">${icon('saw')}<span>Saw</span></button>
      <button data-hub="stones" aria-pressed="false">${icon('stones')}<span id="stoneHubCount">Stones 0</span></button>
      <button data-hub="road">╬<span>Road</span></button>
      <button data-hub="terrain">◇<span>Terrain</span></button>
      <button data-hub="paint">◒<span>Paint</span></button>
    </div>
  </div>
  <div id="atlasPanel" class="atlas-panel hidden" role="dialog" aria-modal="true" aria-labelledby="atlasTitle">
    <header><div><span>EXPEDITION RECORD</span><h2 id="atlasTitle">WORLD ATLAS</h2></div><button id="closeAtlas" class="close" aria-label="Close world atlas">×</button></header>
    <div class="atlas-layout">
      <aside class="atlas-controls">
        <label>Scale <select id="atlasLevel"><option value="world">World</option><option value="continent">Continent</option><option value="region">Region</option><option value="local">Local</option></select></label>
        <div class="atlas-buttons"><button id="atlasZoomOut" aria-label="Zoom out">−</button><span id="atlasZoom">4×</span><button id="atlasZoomIn" aria-label="Zoom in">+</button></div>
        <label>Marker name <input id="atlasMarkerName" maxlength="32" value="Camp"></label>
        <button id="atlasAddMarker" class="secondary">ADD MARKER</button>
        <button id="atlasMeasure" class="secondary">MEASURE ROUTE</button>
        <div id="atlasCoordinates" class="atlas-coordinates"></div>
        <div id="atlasMarkerList" class="atlas-marker-list"></div>
      </aside>
      <canvas id="atlasCanvas" width="920" height="620" aria-label="Interactive world atlas"></canvas>
    </div>
  </div>
  <div id="npcPanel" class="panel hidden"><button id="closeNpc" class="close" aria-label="Close survivor menu">×</button><h2>TARU PAMPULA · SURVIVOR</h2><p id="npcStatus">A friendly survivor.</p><button id="npcRecruit" class="primary">RECRUIT</button><button data-job="wood" class="secondary">GATHER WOOD</button><button data-job="stone" class="secondary">GATHER STONE</button><button data-job="idle" class="secondary">REST</button></div>
  <div id="craftPanel" class="panel pack-panel hidden" role="dialog" aria-labelledby="packTitle">
    <button id="closeCraft" class="close" aria-label="Close pack">×</button>
    <h2 id="packTitle">PACK &amp; CRAFTING</h2>
    <p>Your starter saw is in Tools. Select it to fell trees and saw trunks; gather the cut wood separately. A pickaxe is used automatically for mining.</p>
    <h3>CRAFT</h3>
    <div class="pack-grid">
      <button data-craft="axe" class="pack-action" aria-label="Craft axe, 3 wood and 2 stone">${icon('axe')}<strong>Axe</strong><small>${icon('wood')} 3 ${icon('stone')} 2</small></button>
      <button data-craft="pickaxe" class="pack-action" aria-label="Craft pickaxe, 2 wood and 3 stone">${icon('pickaxe')}<strong>Pickaxe</strong><small>${icon('wood')} 2 ${icon('stone')} 3</small></button>
      <button id="craftTorch" class="pack-action" aria-label="Craft torch, 2 wood and 1 coal">${icon('torch')}<strong>Torch</strong><small>${icon('wood')} 2 ${icon('mineral')} 1</small></button>
    </div>
    <p id="toolStatus" aria-live="polite"></p>
    <h3>EQUIPMENT</h3>
    <div class="pack-grid">
      <button id="equipBackpack" class="pack-action" aria-label="Wear backpack" aria-pressed="true">${icon('pack')}<strong>Backpack</strong><small>Worn</small></button>
      <button id="equipTorch" class="pack-action" aria-pressed="false">${icon('torch')}<strong>Equip</strong><small>Torch</small></button>
      <button id="igniteTorch" class="pack-action" aria-pressed="false">${icon('flame')}<strong>Ignite</strong><small>Torch</small></button>
    </div>
    <p id="backpackStatus" aria-live="polite"></p>
    <p id="torchStatus" aria-live="polite"></p>
    <h3>RESOURCES</h3><div id="basicInventory" class="pack-grid pack-items"></div>
    <h3>MINERALS &amp; MATERIALS</h3><div id="mineralInventory" class="pack-grid pack-items"></div>
  </div>
  <div id="smelterPanel" class="panel hidden"><button id="closeSmelter" class="close" aria-label="Close smelter">×</button><h2>SMELTER &amp; FURNACE</h2><p id="smelterStatus"></p><button data-smelt="ironOre" class="secondary">IRON INGOT · 2 IRON ORE + 1 COAL</button><button data-smelt="copperOre" class="secondary">COPPER INGOT · 2 COPPER ORE + 1 COAL</button><button data-smelt="sand" class="secondary">GLASS · 2 SAND + 1 COAL</button><button id="forgePickaxe" class="secondary">IRON PICKAXE · 2 IRON + 2 WOOD</button><p>Close this panel to let production run. The iron pickaxe doubles mineral yield.</p></div>
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
    <label class="setting">Mobile button size <select id="buttonSize"><option value="normal">Normal</option><option value="large">Large</option></select></label>
    <button id="showPerformance" class="secondary" type="button">SHOW PERFORMANCE MONITOR</button>
    <button id="skipIntroduction" class="secondary">SKIP INTRODUCTION</button><button id="restartIntroduction" class="secondary">RESTART INTRODUCTION</button>
    <p>Game version: ${__APP_VERSION__}<br><a href="${import.meta.env.BASE_URL}assets/environment/sky/moon-LICENSE.txt" target="_blank" rel="noopener" style="color:inherit">Moon texture: Solar System Scope (CC BY 4.0)</a><br><a href="${import.meta.env.BASE_URL}assets/animals/red-squirrel-LICENSE.txt" target="_blank" rel="noopener" style="color:inherit">Squirrel model: vinish.dev (CC BY 4.0)</a><br><a href="${import.meta.env.BASE_URL}assets/animals/gray-wolf-LICENSE.txt" target="_blank" rel="noopener" style="color:inherit">Wolf model: vinish.dev (CC BY 4.0)</a><br><a href="${import.meta.env.BASE_URL}assets/animals/grizzly-bear-LICENSE.txt" target="_blank" rel="noopener" style="color:inherit">Bear model: vinish.dev (CC BY 4.0)</a><br><a href="${import.meta.env.BASE_URL}assets/environment/trees/vinish-trees-LICENSE.txt" target="_blank" rel="noopener" style="color:inherit">Palm model: vinish.dev (CC BY 4.0)</a></p><button id="exitFullscreen" class="secondary">EXIT FULLSCREEN</button>
    <button id="resumeGame" class="primary">RESUME</button><button id="saveGame" class="secondary">SAVE WORLD</button><button id="returnMenu" class="secondary">MAIN MENU</button></div>
  <div id="updatePanel" class="update-panel hidden" role="dialog" aria-labelledby="updateTitle"><strong id="updateTitle">New Dawn Update Available</strong><p>Save your world and restart to play the new version.</p><div><button id="applyUpdate" class="primary">UPDATE NOW</button><button id="laterUpdate" class="secondary">LATER</button></div></div>
  <div id="performanceMonitor" class="performance-monitor hidden" role="region" aria-label="Performance monitor">
    <strong>PERFORMANCE MONITOR</strong><pre id="performanceData"></pre>
    <div><button id="startBenchmark" type="button">START 30s TEST</button><button id="copyPerformance" type="button">COPY REPORT</button><button id="hidePerformance" type="button">HIDE</button></div>
  </div>
  <div id="toast" class="toast" role="status" aria-live="polite" aria-atomic="true"></div>
`;

const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const gl = renderer.getContext();
const foliageAlphaCoverage = gl.getContextAttributes()?.antialias === true && Number(gl.getParameter(gl.SAMPLES)) > 1;

const scene = new THREE.Scene();
const sky = new Sky(scene, renderer);
void sky.loadMoonSurface().catch(error => console.error('Failed to load local Moon surface; retaining the plain disc.', error));
const effects = new Effects(scene);
const waterEffects = new WaterEffects(scene);
const footprints = new Footprints(scene);
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
scene.add(sun, sun.target);
const moon = new THREE.DirectionalLight('#8ca8dc', 0);
moon.position.set(18, 30, -20);
scene.add(moon, moon.target);
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
let world = new World(seed, renderDistance, foliageAlphaCoverage);
let graphicsQuality: 'low' | 'medium' | 'high' = 'medium';
let fogStart = 42;
let fogEnd = 92;
scene.add(world.group);
function updateTerrainFog() {
  if (!(scene.fog instanceof THREE.Fog)) return;
  const fog = atmosphericFogRange(fogStart, fogEnd, renderDistance, graphicsQuality, 'Clear', 1, 0);
  scene.fog.near = fog.near;
  scene.fog.far = fog.far;
  camera.far = renderDistance * 24 + 140;
  camera.updateProjectionMatrix();
}
updateTerrainFog();

let outfit: Outfit = 'ember';
let appearance: CharacterAppearance = { ...defaultAppearance(outfit), clothing: 'tunic' };
let characterName = 'Survivor';
let npcAppearanceSeed = ((seed >>> 0) + 53917) >>> 0;
let characterLoadErrorShown = false;
let backpackLoadErrorShown = false;
let backpackEquipped = true;
function useAuthoredCharacter(character: THREE.Group, look: CharacterAppearance, backpack = false, highBun = false) {
  attachAuthoredCharacter(character, look, error => {
    console.error('Could not load authored character; using procedural fallback', error);
    if (!characterLoadErrorShown) {
      characterLoadErrorShown = true;
      toast('Character assets could not be loaded; using fallback');
    }
  }, { backpack, highBun, onBackpackError: error => {
    console.error('Could not load backpack art', error);
    if (!backpackLoadErrorShown) {
      backpackLoadErrorShown = true;
      toast('Backpack art could not be loaded');
    }
  } });
}
let player = createCharacter(appearance);
useAuthoredCharacter(player, appearance, true);
let handTorch = createHandTorch();
attachHandTorch(player, handTorch.group);
player.position.set(0, world.heightAt(0, 0), 5);
scene.add(player);

function taruAppearance(seedValue: number): CharacterAppearance {
  return { ...appearanceFromSeed(seedValue), body: 'feminine', hair: 'short', hairColor: 'brown',
    facialHair: 'none', hat: 'none', height: 'medium' };
}
let npc = createCharacter(taruAppearance(npcAppearanceSeed), { highBun: true });
useAuthoredCharacter(npc, taruAppearance(npcAppearanceSeed), false, true);
npc.position.set(-4, world.heightAt(-4, 2), 2);
scene.add(npc);

const vehicle = createVehicle();
vehicle.position.set(8, world.heightAt(8, 4), 4);
scene.add(vehicle);
const roverController = getRoverVisual(vehicle);
if (!roverController) throw new Error('Rover visual controller is unavailable');
const roverVisual = roverController;
const roverWheelKeys: RoverWheel[] = ['frontLeft', 'frontRight', 'rearLeft', 'rearRight'];
const roverWheelPoints: RoverFour<{ x: number; z: number }> = {
  frontLeft: { x: 0, z: 0 }, frontRight: { x: 0, z: 0 },
  rearLeft: { x: 0, z: 0 }, rearRight: { x: 0, z: 0 },
};
const roverWheelGround: RoverFour<number> = { frontLeft: 0, frontRight: 0, rearLeft: 0, rearRight: 0 };
let playerGeographic = planetPositionToGeographic(player.position.x, player.position.z, player.position.y);
let vehicleGeographic = planetPositionToGeographic(vehicle.position.x, vehicle.position.z, vehicle.position.y);
let npcGeographic = planetPositionToGeographic(npc.position.x, npc.position.z, npc.position.y);
const runtimeFrame = new PlanetaryRuntimeFrame(player.position);

const resources: Resources = { wood: 0, stone: 0, food: 3, water: 3 };
let onboarding: OnboardingState = { mode: 'guide', gathered: false, openedPack: false };
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
const enemyProjectiles: { mesh: THREE.Mesh; motion: PlanetaryProjectile; remaining: number; damage: number }[] = [];
const thrownStones: { mesh: THREE.Mesh; motion: PlanetaryProjectile; remaining: number }[] = [];
const stoneGeometry = new THREE.IcosahedronGeometry(0.09, 1);
const stoneMaterial = new THREE.MeshStandardMaterial({ color: '#cfd4ca', roughness: 0.9 });
const stoneRay = new THREE.Raycaster();
const projectileGeometry = new THREE.IcosahedronGeometry(0.13, 1);
const projectileMaterial = new THREE.MeshStandardMaterial({ color: '#cf9bee', emissive: '#854db3', emissiveIntensity: 1.5 });
let wildlife: AnimalState[] = [];
const animalModels = new Map<string, THREE.Group>();
const previousAnimalPositions = new Map<string, GeographicPosition>();
const npcState: NpcState = { recruited: false, job: 'idle', carrying: null };
let health = 100;
let attackCooldown = 0;
let enemyHitCooldown = 0;
let spawnCooldown = 0;
let animationActionTime = 0;
let animationAction: 'chop' | 'mine' | 'build' | 'gather' | 'attack' | 'hurt' | 'saw' = 'chop';
let buildMode = false;
let buildKind: BuildKind = 'shelter';
let buildGhost: THREE.Group | null = null;
let buildRotation = 0;
let manualBuildOrientation = false;
let buildLevel = 0;
let autoRoof = true;
const newGameRoofStyle: RoofStyle = 'gable';
let roofStyle: RoofStyle = newGameRoofStyle;
let roofAxis: RoofAxis = 'auto';
const pendingRoofs = new Map<string, RoofRequest>();
const buildAim = new THREE.Vector2();
const buildTarget = new THREE.Vector3();
const placementRay = new THREE.Raycaster();
let placementFootprint: THREE.Mesh | null = null;
let ghostMaterial: THREE.MeshBasicMaterial | null = null;
let targetOnTerrain = true;
let playerVerticalVelocity = 0;
let grounded = true;
let swimming = false;
let waterContact = false;
let rippleTimer = 0;
let selectedWeapon: SelectedWeapon = 'fists';
let stones = 0;
let pendingMelee: { target: THREE.Group | AnimalState; kind: 'enemy' | 'animal'; damage: number; time: number } | null = null;
let lastStoneImpact: { x: number; y: number; z: number; kind: string } | null = null;
if (import.meta.env.DEV) {
  Object.defineProperty(window, '__newDawnState', {
    value: () => ({
      player: { x: player.position.x, y: player.position.y, z: player.position.z, yaw: player.rotation.y },
      vehicle: { x: vehicle.position.x, y: vehicle.position.y, z: vehicle.position.z,
        yaw: vehicle.rotation.y, speed: vehicleSpeed, driving },
      runtimeFrame: { latitude: runtimeFrame.tangent.origin.latitude, longitude: runtimeFrame.tangent.origin.longitude },
      cameraAngle, grounded, stones, selectedWeapon, animationAction, animationActionTime, attackCooldown, lastStoneImpact,
      characterVisual: {
        authored: Boolean(player.getObjectByName('authored-character')),
        backpackBone: player.getObjectByName('survivor-backpack')?.parent?.name ?? null,
        backpackVisible: player.getObjectByName('survivor-backpack')?.visible ?? false,
        backpackEquipped,
        heldTools: ['chop', 'mine', 'weapon', 'stick', 'saw'].filter(kind =>
          (player.getObjectByName('authored-character') ?? player).getObjectByName(`tool-${kind}`)?.visible),
        torch: handTorch.group.visible,
      },
      npcVisual: {
        authored: Boolean(npc.getObjectByName('authored-character')),
        bunBone: npc.getObjectByName('authored-character')?.getObjectByName('taru-high-bun')?.parent?.name ?? null,
        x: npc.position.x, z: npc.position.z,
      },
      cameraView: { pitch: cameraPitch, directionY: camera.getWorldDirection(new THREE.Vector3()).y,
        groundClearance: cameraGlobalPosition.y - world.heightAt(cameraGlobalPosition.x, cameraGlobalPosition.z) },
      swimming, waterContact, waterEffects: waterEffects.activeCount,
      footprints: footprints.activeCount,
      impactEffects: effects.activeCount,
      lastImpactEffect: effects.lastImpact,
      health,
      rendering: { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures,
        foliageAlphaCoverage },
      terrainReady: world.terrainReady,
      trees: world.group.children.filter(object => object.userData.resource === 'wood').map(object => {
        const point = world.resourceLocation(object);
        return { id: object.userData.resourceId as string, x: point.x, z: point.z,
          family: object.userData.vegetationFamily as string, species: object.userData.treeSpecies as string,
          authored: object.userData.natureAuthored === true, variant: object.userData.natureVariant as string | undefined,
          harvest: world.treeHarvestState(object), falling: world.isTreeFalling(object) };
      }),
      bushes: world.group.children.filter(object => object.userData.resource === 'food').map(object => {
        const point = world.resourceLocation(object);
        return { id: object.userData.resourceId as string, x: point.x, z: point.z,
          authored: object.children.some(child => child.userData.bushFoliage && child.userData.natureGround) };
      }),
      deposits: world.group.children.filter(object => object.userData.depositId).map(object => {
        const point = world.resourceLocation(object);
        return { id: object.userData.depositId as string, x: point.x, z: point.z,
          mineral: object.userData.mineral as string };
      }),
      groundArt: {
        hiddenByFloors: world.hiddenFloorCoverCount,
        stones: world.group.children.filter(object => object.userData.resource === 'stone' && object.userData.natureGround).length,
        deposits: world.group.children.filter(object => object.userData.depositId
          && object.children.some(child => child.userData.depositRock && child.userData.natureGround)).length,
        grass: world.group.children.filter(object => object instanceof THREE.InstancedMesh && object.count > 0
          && object.userData.groundCover === 'grass' && object.userData.natureGround).length,
        ferns: world.group.children.filter(object => object instanceof THREE.InstancedMesh && object.count > 0
          && object.userData.groundCover === 'fern' && object.userData.natureGround).length,
        shrubs: world.group.children.filter(object => object.userData.resource === 'food'
          && object.children.some(child => child.userData.bushFoliage && child.userData.natureGround)).length,
      },
      projectiles: thrownStones.map(({ mesh, motion }) => ({ x: mesh.position.x, y: mesh.position.y, z: mesh.position.z, velocityY: motion.velocity.y })),
      enemyProjectiles: enemyProjectiles.map(({ mesh, remaining }) => ({ x: mesh.position.x, y: mesh.position.y, z: mesh.position.z, remaining })),
      enemies: enemies.map(enemy => ({ id: enemy.id, x: enemy.position.x, y: enemy.position.y, z: enemy.position.z, health: enemy.userData.health as number })),
      wildlife: wildlife.map(animal => ({ id: animal.id, species: animal.species, x: animal.x, z: animal.z, health: animal.health,
        heading: animal.heading, visualHeading: animalModels.get(animal.id)?.rotation.y ?? null,
        behavior: animal.behavior, authored: Boolean(animalModels.get(animal.id)?.getObjectByName('authored-animal')),
        animation: animalModels.get(animal.id)?.getObjectByName('authored-animal')?.userData.animation ?? null,
        flightHeight: animal.species === 'bird' ? animalModels.get(animal.id)?.userData.flightHeight ?? 0 : null })),
      roads: roads.map(road => ({ id: road.id, x: road.x, z: road.z,
        modelX: roadModels.get(road.id)?.position.x, modelZ: roadModels.get(road.id)?.position.z })),
      paintMarkers: paintMarkers.children.map(marker => ({ pieceId: marker.userData.pieceId as string,
        x: marker.position.x, z: marker.position.z })),
      powerLines: powerLines.children.filter((child): child is THREE.Line => child instanceof THREE.Line).map(line => {
        const points = line.geometry.getAttribute('position');
        return { x: line.position.x, y: line.position.y, z: line.position.z,
          first: { x: points.getX(0), y: points.getY(0), z: points.getZ(0) },
          second: { x: points.getX(1), y: points.getY(1), z: points.getZ(1) } };
      }),
      lighting: {
        minute: gameMinutes, day, latitude: atlasPosition().latitude,
        sun: { x: sun.position.x, y: sun.position.y, z: sun.position.z, targetX: sun.target.position.x, targetY: sun.target.position.y, targetZ: sun.target.position.z,
          targetInScene: sun.target.parent === scene },
        moon: { x: moon.position.x, y: moon.position.y, z: moon.position.z, targetX: moon.target.position.x, targetY: moon.target.position.y, targetZ: moon.target.position.z,
          targetInScene: moon.target.parent === scene },
      },
    }),
  });
  Object.defineProperty(window, '__newDawnSpawnEnemy', {
    value: (kind: EnemyKind, x: number, z: number) => spawnEnemy(kind, x, z),
  });
  Object.defineProperty(window, '__newDawnFoliageClearance', {
    value: () => {
      let active = 0;
      for (const tree of world.group.children) {
        if (tree.userData.resource !== 'wood') continue;
        tree.traverse(object => {
          if (!(object instanceof THREE.Mesh)) return;
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            const clearance: unknown = material.userData.treeClearance;
            if (/leaves|twig/i.test(material.name) && clearance instanceof TreeClearance && clearance.amount.value > 0.1) active++;
          }
        });
      }
      return active;
    },
  });
  Object.defineProperty(window, '__newDawnUseLegacyFoliageFade', {
    value: () => {
      for (const tree of world.group.children) {
        if (tree.userData.resource !== 'wood') continue;
        tree.traverse(object => {
          if (!(object instanceof THREE.Mesh)) return;
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            const clearance: unknown = material.userData.treeClearance;
            if (!/leaves|twig/i.test(material.name) || !(clearance instanceof TreeClearance)) continue;
            clearance.amount.value = 0;
            delete material.userData.treeClearance;
          }
        });
      }
    },
  });
}
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
const atlasState: AtlasState = {
  explored: [],
  markers: [],
  zoom: 1,
  centerLatitude: 0,
  centerLongitude: 0,
  level: 'world',
};
let atlasMeasureStart: MapMarker | null = null;
let driving = false;
let vehicleSpeed = 0;
let roverSteeringYaw = 0;
let accelerateTouch = false;
let brakeTouch = false;
let structureCollisionDirty = true;
let structureCollision = createStructureCollisionQuery(structures, buildingRecords);
let collisionWarningAt = -Infinity;
const wildlifeCollision = createWildlifeCollision({
  animals: () => wildlife,
  player: () => ({
    body: { id: 'player', pose: { position: { x: player.position.x, z: player.position.z, geographic: playerGeographic },
      bottomY: player.position.y }, radius: 0.35, height: 1.8 },
    driving,
  }),
  rover: () => null,
  groundY: (_animal, point) => world.heightAt(point.x, point.z),
  flightHeight: id => animalModels.get(id)?.userData.flightHeight ?? 0,
  obstacles: (query: CollisionQuery) => {
    if (structureCollisionDirty) {
      structureCollision = createStructureCollisionQuery(structures, buildingRecords);
      structureCollisionDirty = false;
    }
    return combineCollisionQueries(query, world.collisionObstacles(query), structureCollision(query));
  },
});

function reportCollisionUnavailable(reason: string) {
  if (performance.now() - collisionWarningAt < 10000) return;
  collisionWarningAt = performance.now();
  console.warn(`Movement stopped: collision data ${reason}`);
  toast('Collision area unavailable; movement stopped');
}

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
const renderOrigin = runtimeFrame.renderOrigin;
const cameraGlobalPosition = new THREE.Vector3();
const cameraFocus = new THREE.Vector3();
const cameraAim = new THREE.Vector3();
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
  renderer.setPixelRatio(renderPixelRatio(graphicsQuality, matchMedia('(pointer: coarse)').matches, devicePixelRatio));
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
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
    if (!document.querySelector('#atlasPanel')!.classList.contains('hidden')) { closeAtlas(); return; }
    if (!document.querySelector('#toolHub')!.classList.contains('hidden')) { setToolHub(false); return; }
    if (!document.querySelector('#pausePanel')!.classList.contains('hidden')) togglePause();
    else if (!document.querySelector('#buildPanel')!.classList.contains('hidden') || buildMode) cancelBuild();
    else if (!document.querySelector('#craftPanel')!.classList.contains('hidden')) document.querySelector('#craftPanel')!.classList.add('hidden');
    else if (!document.querySelector('#smelterPanel')!.classList.contains('hidden')) document.querySelector('#smelterPanel')!.classList.add('hidden');
    else if (!document.querySelector('#npcPanel')!.classList.contains('hidden')) document.querySelector('#npcPanel')!.classList.add('hidden');
    else if (toolMode !== 'normal') exitToolModes();
    else if (performance.now() - lastPointerUnlock > 300) togglePause();
    return;
  }
  if (event.code === 'KeyI' && gameStarted && !document.querySelector('#craftPanel')!.classList.contains('hidden')) {
    document.querySelector('#craftPanel')!.classList.add('hidden');
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
  if (event.code === 'KeyV') { if (!buildMode && !gameplayBlocked()) startJump(); }
  if (event.code === 'KeyC') throwStone();
});
addEventListener('keyup', event => keys.delete(event.code));

const cameraPointers = new Map<number, { x: number; y: number }>();
const toolPointers = new Set<number>();
let placementTouch: { id: number; x: number; y: number } | null = null;
let rightDragDistance = 0;
let leftClickStart: { x: number; y: number } | null = null;
let gatherHint = 'gather';
let gatherHintTimer = 0;
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
    ? 'MOUSE LOOK ACTIVE · Esc releases cursor · WASD move · E interact · Space gather · B build'
    : legacyCamera || pointerLockUnavailable
      ? 'Right-drag camera · WASD move · E interact · Space gather · B build'
      : 'Click world for mouse look · WASD move · E interact · Space gather · B build';
  const primary = text.replace('Space gather', `Space ${gatherHint}`);
  hint.textContent = action ? primary.replace('E interact', `E ${action}`) : primary;
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
  cameraPitch = clampCameraPitch(cameraPitch + event.movementY * 0.004 * mouseSensitivity * (invertMouse ? -1 : 1));
  manualCamera();
});
canvas.addEventListener('contextmenu', event => event.preventDefault());
canvas.addEventListener('pointerdown', event => {
  if (!gameStarted || gameplayBlocked() || pointerOverHud(event.clientX, event.clientY)) return;
  if (toolMode !== 'normal') {
    if (toolMode === 'terrain') {
      applyTerrainAtClient(event.clientX, event.clientY);
      if (event.pointerType !== 'mouse') { toolPointers.add(event.pointerId); canvas.setPointerCapture(event.pointerId); }
    } else if (toolMode === 'road') {
      placeRoadAtClient(event.clientX, event.clientY);
      if (event.pointerType !== 'mouse') { toolPointers.add(event.pointerId); canvas.setPointerCapture(event.pointerId); }
    } else if (toolMode === 'paint') {
      paintAtClient(event.clientX, event.clientY);
      if (event.pointerType !== 'mouse') { toolPointers.add(event.pointerId); canvas.setPointerCapture(event.pointerId); }
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
  if (gameplayBlocked()) return;
  const toolPointerActive = event.pointerType === 'mouse' ? Boolean(event.buttons & 1) : toolPointers.has(event.pointerId);
  if (toolMode === 'terrain' && toolPointerActive) applyTerrainAtClient(event.clientX, event.clientY);
  if (toolMode === 'road' && toolPointerActive) placeRoadAtClient(event.clientX, event.clientY);
  if (toolMode === 'paint' && toolPointerActive) paintAtClient(event.clientX, event.clientY);
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
      cameraPitch = clampCameraPitch(cameraPitch + dy * 0.002 * cameraSettings.rotationSpeed);
    }
  } else if (!buildMode || event.pointerType === 'mouse') {
    cameraAngle -= dx * 0.006 * cameraSettings.rotationSpeed;
    cameraPitch = clampCameraPitch(cameraPitch + dy * 0.004 * cameraSettings.rotationSpeed);
  }
  manualCamera();
});
function endCameraPointer(event: PointerEvent) {
  toolPointers.delete(event.pointerId);
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
const actionResetters: Array<() => void> = [];
let suppressTouchClick = false;
document.addEventListener('pointerdown', () => { suppressTouchClick = false; }, true);
document.addEventListener('click', event => {
  if (event.detail > 0 && suppressTouchClick) {
    suppressTouchClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}, true);
for (const selector of ['#hud', '#placementToolbar']) {
  document.querySelector(selector)!.addEventListener('click', event => {
    if (event instanceof MouseEvent && event.detail > 0 && event.target instanceof Element) event.target.closest('button')?.blur();
  });
}
function setupAction(button: HTMLButtonElement, action: () => void, setDrivingInput?: (pressed: boolean) => void) {
  let touch: { id: number; x: number; y: number } | null = null;
  let touchTap: boolean | null = null;
  let touchActionHandled = false;
  let drivingPointer: number | null = null;
  button.addEventListener('pointerdown', event => {
    if (gameplayBlocked()) return;
    if (touch || drivingPointer !== null) return;
    touchTap = event.pointerType === 'touch' ? false : null;
    if (driving && setDrivingInput) {
      drivingPointer = event.pointerId;
      setDrivingInput(true);
      button.setPointerCapture(event.pointerId);
    } else if (event.pointerType === 'touch') {
      touch = { id: event.pointerId, x: event.clientX, y: event.clientY };
      button.setPointerCapture(event.pointerId);
    }
  });
  button.addEventListener('pointerup', event => {
    if (drivingPointer === event.pointerId) {
      drivingPointer = null;
      setDrivingInput?.(false);
    }
    if (!touch || touch.id !== event.pointerId) return;
    const rect = button.getBoundingClientRect();
    const tapped = Math.hypot(event.clientX - touch.x, event.clientY - touch.y) < 15
      && event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    touch = null;
    touchTap = tapped;
    suppressTouchClick = true;
    if (tapped && !driving && !gameplayBlocked()) {
      action();
      touchActionHandled = true;
    }
  });
  const cancel = (event: PointerEvent) => {
    if (touch?.id === event.pointerId) { touch = null; touchTap = false; touchActionHandled = false; suppressTouchClick = true; }
    if (drivingPointer === event.pointerId) { drivingPointer = null; setDrivingInput?.(false); }
  };
  button.addEventListener('pointercancel', cancel);
  button.addEventListener('lostpointercapture', event => {
    cancel(event);
  });
  actionResetters.push(() => {
    const pointer = touch?.id ?? drivingPointer;
    if (touch) { touchTap = false; suppressTouchClick = true; }
    touch = null;
    touchActionHandled = false;
    drivingPointer = null;
    setDrivingInput?.(false);
    if (pointer !== null && button.hasPointerCapture(pointer)) button.releasePointerCapture(pointer);
  });
  button.addEventListener('click', event => {
    if (event.detail === 0) {
      if (!driving && !gameplayBlocked()) action();
      return;
    }
    if (touchTap !== null) {
      const tapped = touchTap;
      touchTap = null;
      const alreadyHandled = touchActionHandled;
      touchActionHandled = false;
      if (!tapped || alreadyHandled) return;
    }
    if (!driving && !gameplayBlocked()) action();
  });
}
setupAction(actionA, () => buildMode ? placeBuilding() : gather(false), pressed => { accelerateTouch = pressed; });
setupAction(actionB, () => buildMode ? cancelBuild() : interact(), pressed => { brakeTouch = pressed; });
setupAction(document.querySelector<HTMLButtonElement>('#jumpButton')!, startJump);
setupAction(document.querySelector<HTMLButtonElement>('#weaponButton')!, useWeapon);
function enableMultiTouchClick(button: HTMLButtonElement) {
  let touch: { id: number; x: number; y: number } | null = null;
  button.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch') return;
    if (touch) return;
    touch = { id: event.pointerId, x: event.clientX, y: event.clientY };
    button.setPointerCapture(event.pointerId);
  });
  button.addEventListener('pointerup', event => {
    if (!touch || event.pointerId !== touch.id) return;
    const rect = button.getBoundingClientRect();
    const tapped = Math.hypot(event.clientX - touch.x, event.clientY - touch.y) < 15
      && event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
    touch = null;
    suppressTouchClick = true;
    if (tapped) button.click();
  });
  const cancel = (event: PointerEvent) => {
    if (touch?.id === event.pointerId) { touch = null; suppressTouchClick = true; }
  };
  button.addEventListener('pointercancel', cancel);
  button.addEventListener('lostpointercapture', cancel);
  actionResetters.push(() => {
    const pointer = touch?.id;
    if (touch) suppressTouchClick = true;
    touch = null;
    if (pointer !== undefined && button.hasPointerCapture(pointer)) button.releasePointerCapture(pointer);
  });
}
document.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
  if (![actionA, actionB, document.querySelector('#jumpButton'), document.querySelector('#weaponButton')].includes(button)) {
    enableMultiTouchClick(button);
  }
});
addEventListener('blur', clearMovement);
addEventListener('orientationchange', clearMovement);
document.addEventListener('visibilitychange', () => { if (document.hidden) clearMovement(); });
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
const buttonSizeInput = document.querySelector<HTMLSelectElement>('#buttonSize')!;
try {
  buttonSizeInput.value = localStorage.getItem('new-dawn-button-size') === 'large' ? 'large' : 'normal';
} catch (error) {
  console.warn('Could not read mobile button size', error);
}
document.body.classList.toggle('large-controls', buttonSizeInput.value === 'large');
buttonSizeInput.addEventListener('change', () => {
  document.body.classList.toggle('large-controls', buttonSizeInput.value === 'large');
  try {
    localStorage.setItem('new-dawn-button-size', buttonSizeInput.value);
  } catch (error) {
    console.error('Could not save mobile button size', error);
    toast('Could not save mobile button size');
  }
});
try {
  const savedGraphics = JSON.parse(localStorage.getItem('new-dawn-graphics') ?? '{}') as {
    fogStart?: number; fogEnd?: number; quality?: string;
  };
  fogStart = typeof savedGraphics.fogStart === 'number' ? savedGraphics.fogStart : fogStart;
  fogEnd = typeof savedGraphics.fogEnd === 'number' ? savedGraphics.fogEnd : fogEnd;
  graphicsQuality = savedGraphics.quality === 'low' || savedGraphics.quality === 'high' ? savedGraphics.quality : 'medium';
} catch {}
fogStartInput.value = String(fogStart);
fogEndInput.value = String(fogEnd);
graphicsQualityInput.value = graphicsQuality;
world.setVegetationQuality(graphicsQuality);
sky.setQuality(graphicsQuality);
renderer.shadowMap.enabled = graphicsQuality !== 'low';
sun.shadow.mapSize.set(graphicsQuality === 'high' ? 2048 : graphicsQuality === 'medium' ? 1024 : 512, graphicsQuality === 'high' ? 2048 : graphicsQuality === 'medium' ? 1024 : 512);
onResize();
function persistGraphics() {
  localStorage.setItem('new-dawn-graphics', JSON.stringify({ fogStart, fogEnd, quality: graphicsQuality }));
  updateTerrainFog();
}
fogStartInput.addEventListener('input', () => { fogStart = Number(fogStartInput.value); persistGraphics(); });
fogEndInput.addEventListener('input', () => { fogEnd = Number(fogEndInput.value); persistGraphics(); });
graphicsQualityInput.addEventListener('change', () => {
  graphicsQuality = graphicsQualityInput.value as typeof graphicsQuality;
  world.setVegetationQuality(graphicsQuality);
  sky.setQuality(graphicsQuality);
  renderer.shadowMap.enabled = graphicsQuality !== 'low';
  sun.shadow.mapSize.set(graphicsQuality === 'high' ? 2048 : graphicsQuality === 'medium' ? 1024 : 512, graphicsQuality === 'high' ? 2048 : graphicsQuality === 'medium' ? 1024 : 512);
  onResize();
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
  onboarding = { mode: (document.querySelector('#introductionChoice') as HTMLSelectElement).value === 'free' ? 'free' : 'guide',
    gathered: false, openedPack: false };
  resetWorld();
  rebaseWorld();
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
document.querySelector('#skipIntroduction')!.addEventListener('click', async () => {
  onboarding.mode = 'free';
  updateObjective();
  if (await saveGame(false)) toast('Introduction skipped');
});
document.querySelector('#restartIntroduction')!.addEventListener('click', async () => {
  onboarding = { mode: 'guide', gathered: false, openedPack: false };
  updateObjective();
  if (await saveGame(false)) toast('Introduction restarted');
});
document.querySelector('#returnMenu')!.addEventListener('click', () => location.reload());
document.querySelector('#closeBuild')!.addEventListener('click', cancelBuild);
document.querySelector('#closeAtlas')!.addEventListener('click', closeAtlas);
document.querySelector('#atlasAddMarker')!.addEventListener('click', addAtlasMarker);
document.querySelector('#atlasZoomIn')!.addEventListener('click', () => {
  atlasState.zoom = Math.min(12, atlasState.zoom * 2);
  drawAtlas();
});
document.querySelector('#atlasZoomOut')!.addEventListener('click', () => {
  atlasState.zoom = Math.max(1, atlasState.zoom / 2);
  drawAtlas();
});
document.querySelector('#atlasLevel')!.addEventListener('change', event => {
  atlasState.level = (event.target as HTMLSelectElement).value as AtlasState['level'];
  atlasState.zoom = atlasState.level === 'world' ? 1 : atlasState.level === 'continent' ? 2 : atlasState.level === 'region' ? 4 : 8;
  (document.querySelector('#atlasLevel') as HTMLSelectElement).value = atlasState.level;
  drawAtlas();
});
document.querySelector('#atlasMeasure')!.addEventListener('click', () => {
  if (!atlasMeasureStart) {
    const position = atlasPosition();
    atlasMeasureStart = { id: 'measure-start', name: 'Start', ...position, kind: 'landmark' };
    toast('Route start set at your position');
  } else {
    const position = atlasPosition();
    const distance = geographicDistanceMeters(atlasMeasureStart, position);
    const estimate = distance / 1000 / 35;
    toast(`Approx. route: ${(distance / 1000).toFixed(1)} km · ${estimate.toFixed(1)} h on foot`);
    atlasMeasureStart = null;
  }
});
const atlasCanvas = document.querySelector<HTMLCanvasElement>('#atlasCanvas')!;
let atlasDrag: { x: number; y: number } | null = null;
atlasCanvas.addEventListener('pointerdown', event => {
  atlasDrag = { x: event.clientX, y: event.clientY };
  atlasCanvas.setPointerCapture(event.pointerId);
});
atlasCanvas.addEventListener('pointermove', event => {
  if (!atlasDrag) return;
  const dx = event.clientX - atlasDrag.x;
  const dy = event.clientY - atlasDrag.y;
  const rect = atlasCanvas.getBoundingClientRect();
  const longitudeSpan = 360 / atlasState.zoom;
  const latitudeSpan = 180 / atlasState.zoom;
  atlasState.centerLongitude -= dx / rect.width * longitudeSpan;
  atlasState.centerLatitude += dy / rect.height * latitudeSpan;
  atlasState.centerLongitude = ((atlasState.centerLongitude + 180) % 360 + 360) % 360 - 180;
  atlasState.centerLatitude = Math.max(-90, Math.min(90, atlasState.centerLatitude));
  atlasDrag = { x: event.clientX, y: event.clientY };
  drawAtlas();
});
atlasCanvas.addEventListener('pointerup', () => { atlasDrag = null; });
atlasCanvas.addEventListener('wheel', event => {
  event.preventDefault();
  atlasState.zoom = Math.max(1, Math.min(12, atlasState.zoom * (event.deltaY < 0 ? 2 : 0.5)));
  drawAtlas();
}, { passive: false });
document.querySelector('#inventoryButton')!.addEventListener('click', () => {
  if (paused || driving || buildMode || !document.querySelector('#npcPanel')!.classList.contains('hidden')
    || !document.querySelector('#smelterPanel')!.classList.contains('hidden')) return;
  closeResourceDetails();
  releasePointerLock();
  setToolHub(false);
  refreshEquipmentPanel();
  document.querySelector('#craftPanel')!.classList.toggle('hidden');
  if (!document.querySelector('#craftPanel')!.classList.contains('hidden') && onboarding.mode === 'guide' && !onboarding.openedPack) {
    onboarding.openedPack = true;
    updateObjective();
    void saveGame(false);
  }
  clearMovement();
});
document.querySelector('#closeCraft')!.addEventListener('click', () => document.querySelector('#craftPanel')!.classList.add('hidden'));
document.querySelector('#terrainTool')!.addEventListener('click', enterTerrainTool);
document.querySelector('#roadTool')!.addEventListener('click', enterRoadTool);
document.querySelector('#paintTool')!.addEventListener('click', enterPaintTool);
document.querySelector('#terrainExit')!.addEventListener('click', exitToolModes);
document.querySelector('#roadExit')!.addEventListener('click', exitToolModes);
document.querySelector('#paintExit')!.addEventListener('click', exitToolModes);
function setToolHub(open: boolean) {
  document.querySelector('#toolHub')!.classList.toggle('hidden', !open);
  document.querySelector('#hud')!.classList.toggle('tool-hub-open', open);
  document.querySelector('#toolHubButton')!.setAttribute('aria-expanded', String(open));
}
document.querySelector('#toolHubButton')!.addEventListener('click', () => {
  if (!gameStarted || gameplayBlocked() || driving || buildMode) return;
  const open = document.querySelector('#toolHub')!.classList.contains('hidden');
  closeResourceDetails();
  releasePointerLock();
  setToolHub(open);
});
document.querySelector('#closeToolHub')!.addEventListener('click', () => setToolHub(false));
document.querySelectorAll<HTMLButtonElement>('[data-hub]').forEach(button => button.addEventListener('click', () => {
  const mode = button.dataset.hub!;
  if (mode === 'axe' && !tools.includes('axe')) {
    toast('Craft an axe in Pack first');
    return;
  }
  setToolHub(false);
  closeResourceDetails();
  if (mode === 'build') toggleBuild();
  else if (mode === 'road') enterRoadTool();
  else if (mode === 'terrain') enterTerrainTool();
  else if (mode === 'paint') enterPaintTool();
  else {
    selectedWeapon = mode as SelectedWeapon;
    updateWeaponControl();
    toast(`${selectedWeapon === 'stones' ? 'Throwing stones' : selectedWeapon} selected`);
    void saveGame(false);
  }
}));
document.querySelector('#resourceToggle')!.addEventListener('click', event => {
  const toggle = event.currentTarget as HTMLButtonElement;
  const expanded = toggle.getAttribute('aria-expanded') !== 'true';
  document.querySelector('#resources')!.classList.toggle('expanded', expanded);
  toggle.setAttribute('aria-expanded', String(expanded));
});
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
  toast(`${tool} crafted`);
  void saveGame(false);
}));
function refreshEquipmentPanel() {
  const backpack = document.querySelector<HTMLButtonElement>('#equipBackpack')!;
  backpack.setAttribute('aria-pressed', String(backpackEquipped));
  backpack.querySelector('small')!.textContent = backpackEquipped ? 'Worn' : 'Not worn';
  document.querySelector('#backpackStatus')!.textContent =
    `Backpack: ${backpackEquipped ? 'worn' : 'not worn'}. Pack storage has no capacity limit yet.`;
  document.querySelector('#torchStatus')!.textContent = !torch.crafted ? 'Torch: not crafted'
    : !torch.equipped ? 'Torch: unequipped' : torch.lit ? 'Torch: equipped and burning' : 'Torch: equipped and extinguished';
  const craft = document.querySelector<HTMLButtonElement>('#craftTorch')!;
  const equip = document.querySelector<HTMLButtonElement>('#equipTorch')!;
  const ignite = document.querySelector<HTMLButtonElement>('#igniteTorch')!;
  craft.disabled = torch.crafted;
  equip.disabled = !torch.crafted;
  ignite.disabled = !torch.equipped;
  equip.querySelector('strong')!.textContent = torch.equipped ? 'Unequip' : 'Equip';
  ignite.querySelector('strong')!.textContent = torch.lit ? 'Extinguish' : 'Ignite';
  equip.setAttribute('aria-pressed', String(torch.equipped));
  ignite.setAttribute('aria-pressed', String(torch.lit));
}
document.querySelector('#equipBackpack')!.addEventListener('click', () => {
  backpackEquipped = !backpackEquipped;
  setAuthoredBackpackVisible(player, backpackEquipped);
  refreshEquipmentPanel();
  toast(backpackEquipped ? 'Backpack equipped' : 'Backpack unequipped');
  void saveGame(false);
});
document.querySelector('#craftTorch')!.addEventListener('click', () => {
  if (!craftTorch(torch, resources, mineralInventory)) { toast('Need 2 wood and 1 coal'); return; }
  updateResources();
  refreshEquipmentPanel();
  toast('Torch crafted');
  void saveGame(false);
});
document.querySelector('#equipTorch')!.addEventListener('click', () => {
  if (!toggleTorchEquipment(torch)) { toast('Craft a torch first'); return; }
  refreshEquipmentPanel();
  toast(torch.equipped ? 'Torch equipped' : 'Torch unequipped');
  void saveGame(false);
});
document.querySelector('#igniteTorch')!.addEventListener('click', () => {
  if (!toggleTorchFlame(torch)) { toast('Equip a torch first'); return; }
  refreshEquipmentPanel();
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
document.querySelector('#npcRecruit')!.addEventListener('click', async () => {
  npcState.recruited = true;
  refreshNpcPanel();
  updateObjective();
  if (await saveGame(false)) toast('Taru joined your settlement');
});
document.querySelectorAll<HTMLButtonElement>('[data-job]').forEach(button => button.addEventListener('click', () => {
  if (!npcState.recruited) { toast('Recruit Taru first'); return; }
  npcState.job = button.dataset.job as NpcJob;
  refreshNpcPanel();
  updateObjective();
}));
document.querySelector('#closeNpc')!.addEventListener('click', () => document.querySelector('#npcPanel')!.classList.add('hidden'));

function refreshNpcPanel() {
  document.querySelector('#npcStatus')!.textContent = npcState.recruited
    ? `Assigned: ${npcState.job}. ${npcState.carrying ? `Carrying ${npcState.carrying}.` : 'Build storage for deliveries.'}`
    : 'A friendly survivor. Recruit Taru to assign a gathering task.';
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
  effects.reset();
  footprints.reset();
  scene.remove(world.group);
  world.dispose();
  world = new World(seed, renderDistance, foliageAlphaCoverage);
  world.setVegetationQuality(graphicsQuality);
  scene.add(world.group);
  scene.remove(player);
  scene.remove(npc);
  disposeCharacter(player);
  disposeCharacter(npc);
  npc = createCharacter(taruAppearance(npcAppearanceSeed), { highBun: true });
  useAuthoredCharacter(npc, taruAppearance(npcAppearanceSeed), false, true);
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
  structureCollisionDirty = true;
  pendingRoofs.clear();
  roads.splice(0, roads.length);
  surfacePaint.splice(0, surfacePaint.length);
  atlasState.explored.splice(0, atlasState.explored.length);
  atlasState.markers.splice(0, atlasState.markers.length);
  atlasState.zoom = 1;
  atlasState.centerLatitude = 0;
  atlasState.centerLongitude = 0;
  atlasState.level = 'world';
  refreshRoads();
  constructionRenderer.refresh(structures, surfacePaint);
  autoRoof = true;
  roofStyle = newGameRoofStyle;
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
  thrownStones.forEach(projectile => scene.remove(projectile.mesh));
  thrownStones.length = 0;
  lastStoneImpact = null;
  spawnCooldown = 0;
  enemyHitCooldown = 0;
  attackCooldown = 0;
  pendingMelee = null;
  Object.assign(resources, { wood: 0, stone: 0, food: 3, water: 3 });
  Object.assign(mineralInventory, emptyMinerals());
  Object.assign(ingots, { iron: 0, copper: 0, glass: 0 });
  ironPickaxe = false;
  activeSmelter = null;
  document.querySelector('#smelterPanel')!.classList.add('hidden');
  tools.length = 0;
  Object.assign(torch, { crafted: false, equipped: false, lit: false });
  backpackEquipped = true;
  stones = 0;
  selectedWeapon = 'fists';
  Object.assign(npcState, { recruited: false, job: 'idle', carrying: null, carryingAmount: undefined });
  health = 100;
  const spawn = safeSpawn(seed)!;
  resetWildlife(createWildlife(seed, spawn));
  npc.position.set(spawn.x - 4, world.heightAt(spawn.x - 4, spawn.z - 3), spawn.z - 3);
  npcGeographic = planetPositionToGeographic(npc.position.x, npc.position.z, npc.position.y);
  vehicle.position.set(spawn.x + 8, world.heightAt(spawn.x + 8, spawn.z - 1), spawn.z - 1);
  vehicle.rotation.y = 0;
  vehicleGeographic = planetPositionToGeographic(vehicle.position.x, vehicle.position.z, vehicle.position.y);
  player = createCharacter(appearance);
  useAuthoredCharacter(player, appearance, true);
  handTorch = createHandTorch();
  attachHandTorch(player, handTorch.group);
  player.position.set(spawn.x, world.heightAt(spawn.x, spawn.z), spawn.z);
  playerGeographic = planetPositionToGeographic(player.position.x, player.position.z, player.position.y);
  player.rotation.y = Math.PI + cameraAngle;
  scene.add(player);
  cameraReady = false;
  driving = false;
  vehicleSpeed = 0;
  roverSteeringYaw = 0;
  updateRoverVisual(0, 0, 0, true);
  document.querySelector('#hud')!.classList.remove('driving');
  document.querySelector('#vehicleIndicator')!.classList.add('hidden');
  updateResources();
  updateObjective();
  day = 1;
  gameMinutes = 360;
}

function aimFollowCamera(slope: number) {
  cameraAim.copy(cameraFocus);
  cameraAim.y += Math.hypot(cameraGlobalPosition.x - cameraFocus.x, cameraGlobalPosition.z - cameraFocus.z) * slope;
  camera.lookAt(runtimeFrame.projectedToRender(cameraAim));
}

function startGame() {
  preview?.dispose();
  preview = undefined;
  gameStarted = true;
  paused = false;
  const focus = driving ? vehicle.position : player.position;
  cameraFocus.set(focus.x, focus.y + (driving ? 1.9 : 1.8), focus.z);
  const inRoom = !driving && Boolean(constructionRenderer.shelter.roomAt(focus.x, focus.y, focus.z));
  const distance = Math.min(inRoom ? 6 : 24, cameraSettings.distance + (driving ? 2 : 0));
  const pitch = cameraPitchView(cameraPitch);
  const horizontal = distance * Math.cos(pitch.orbit);
  cameraGlobalPosition.set(
    cameraFocus.x + Math.sin(cameraAngle) * horizontal,
    cameraFocus.y + distance * Math.sin(pitch.orbit),
    cameraFocus.z + Math.cos(cameraAngle) * horizontal,
  );
  runtimeFrame.projectedToRender(cameraGlobalPosition, camera.position);
  aimFollowCamera(pitch.aimSlope);
  cameraReady = true;
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  document.querySelector('#menu')!.classList.remove('active');
  document.querySelector('#hud')!.classList.remove('hidden');
  document.querySelector('#pausePanel')!.classList.add('hidden');
  document.querySelector('#survivorLabel')!.textContent = characterName;
  updateCameraHint();
  if (onboarding.mode === 'guide' && !onboarding.gathered) toast('Gather a nearby resource to begin');
}

function togglePause() {
  if (!gameStarted || updatePending) return;
  paused = !paused;
  if (paused) {
    setToolHub(false);
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
  if (stickPointer !== null && stickArea.hasPointerCapture(stickPointer)) stickArea.releasePointerCapture(stickPointer);
  stickPointer = null;
  stick.style.transform = 'translate(0, 0)';
  accelerateTouch = false;
  brakeTouch = false;
  const pointers = new Set([...cameraPointers.keys(), ...toolPointers]);
  if (placementTouch) pointers.add(placementTouch.id);
  cameraPointers.clear();
  toolPointers.clear();
  placementTouch = null;
  leftClickStart = null;
  for (const pointer of pointers) if (canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
  actionResetters.forEach(reset => reset());
}

function startJump() {
  if (driving || !gameStarted || gameplayBlocked() || swimming) return;
  if (!grounded) return;
  playerVerticalVelocity = 7.2;
  grounded = false;
  animationAction = 'attack';
  animationActionTime = 0.45;
}

function clearToolPointers() {
  const pointers = [...toolPointers];
  toolPointers.clear();
  for (const pointer of pointers) if (canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer);
}

function exitToolModes() {
  clearToolPointers();
  toolMode = 'normal';
  document.querySelector('#terrainToolbar')!.classList.add('hidden');
  document.querySelector('#roadToolbar')!.classList.add('hidden');
  document.querySelector('#paintToolbar')!.classList.add('hidden');
  document.querySelector('#hud')!.classList.remove('building');
  updateCameraHint();
}

function enterTerrainTool() {
  if (!gameStarted || driving) return;
  clearToolPointers();
  closeResourceDetails();
  releasePointerLock();
  toolMode = 'terrain';
  document.querySelector('#roadToolbar')!.classList.add('hidden');
  document.querySelector('#paintToolbar')!.classList.add('hidden');
  document.querySelector('#terrainToolbar')!.classList.remove('hidden');
  toast('Terrain tool active');
}

function enterRoadTool() {
  if (!gameStarted || driving) return;
  clearToolPointers();
  closeResourceDetails();
  releasePointerLock();
  toolMode = 'road';
  document.querySelector('#terrainToolbar')!.classList.add('hidden');
  document.querySelector('#paintToolbar')!.classList.add('hidden');
  document.querySelector('#roadToolbar')!.classList.remove('hidden');
  toast('Road tool active');
}

function enterPaintTool() {
  if (!gameStarted || driving) return;
  clearToolPointers();
  closeResourceDetails();
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
  return hit ? runtimeFrame.renderToProjected(hit) : null;
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
    effects.burst(new THREE.Vector3(point.x, world.heightAt(point.x, point.z), point.z), 'soil');
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

function roadMesh(segment: RoadSegment, slots: ReadonlySet<string>) {
  const group = new THREE.Group();
  segment.rotation = connectionLayout(segment.x, segment.z, slots).rotation;
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
  const slots = roadSlots(roads);
  for (const segment of roads) {
    const model = roadMesh(segment, slots);
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
      marker.userData.pieceId = piece.id;
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
    || !document.querySelector('#updatePanel')!.classList.contains('hidden')
    || !document.querySelector('#atlasPanel')!.classList.contains('hidden');
}

function toggleBuild() {
  if (!gameStarted || driving || gameplayBlocked()) return;
  if (buildMode) { cancelBuild(); return; }
  setToolHub(false);
  closeResourceDetails();
  releasePointerLock();
  buildMode = true;
  document.querySelector('#craftPanel')!.classList.add('hidden');
  document.querySelector('#npcPanel')!.classList.add('hidden');
  document.querySelector('#hud')!.classList.add('building');
  document.querySelector('#actionA span')!.textContent = 'Place';
  actionA.setAttribute('aria-label', 'Place building');
  gatherHint = 'gather';
  gatherHintTimer = 0;
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
  actionA.setAttribute('aria-label', 'Primary action');
  gatherHintTimer = 0;
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
  structureCollisionDirty = true;
  const removedId = piece.id;
  surfacePaint.splice(0, surfacePaint.length, ...surfacePaint.filter(paint => paint.pieceId !== removedId));
  refreshPaintMarkers();
  const roofMessage = piece.kind === 'wall' || piece.kind === 'doorframe' || piece.kind === 'windowframe' ? reconcileRoofs(piece) : null;
  constructionRenderer.refresh(structures, surfacePaint);
  if (piece.kind === 'floor') world.setFloorCover(structures);
  updateResources();
  updateObjective();
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
  const point = terrainPoint(clientX, clientY);
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
  if (Math.hypot(buildTarget.x - npc.position.x, buildTarget.z - npc.position.z) < footprint + 0.6) return 'Move away from Taru';
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
    structureCollisionDirty = true;
    if (piece.kind === 'window') ingots.glass--;
    const roofMessage = piece.kind === 'wall' || piece.kind === 'doorframe' || piece.kind === 'windowframe' ? reconcileRoofs(piece) : null;
    constructionRenderer.refresh(structures, surfacePaint);
    if (piece.kind === 'floor') world.setFloorCover(structures);
    animationAction = 'build';
    animationActionTime = 0.6;
    effects.burst(buildTarget.clone().add(new THREE.Vector3(0, 0.3, 0)), 'build');
    updateResources();
    updateObjective();
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
  structureCollisionDirty = true;
  postLightTimer = 0;
  effects.burst(building.position.clone().add(new THREE.Vector3(0, 0.3, 0)), 'build');
  updatePowerLines();
  updateResources();
  updatePlacement();
  toast(`${item.name} constructed`);
  updateObjective();
  saveGame(false);
}

function updateWeaponControl() {
  document.querySelector('#weaponIcon')!.innerHTML = icons[selectedWeapon];
  document.querySelector('#toolHubIcon')!.innerHTML = icons[selectedWeapon];
  document.querySelector('#toolHubButton')!.setAttribute('aria-label', `Open tools, ${selectedWeapon} selected`);
  document.querySelectorAll<HTMLButtonElement>('[data-hub][aria-pressed]').forEach(button => {
    const selected = button.dataset.hub === selectedWeapon;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  const axe = document.querySelector<HTMLButtonElement>('[data-hub="axe"]')!;
  const needsAxe = !tools.includes('axe');
  axe.classList.toggle('needs-crafting', needsAxe);
  axe.setAttribute('aria-label', needsAxe ? 'Axe, craft in Pack first' : 'Axe');
  axe.querySelector('span')!.textContent = needsAxe ? 'Craft axe' : 'Axe';
  document.querySelector('#weaponLabel')!.textContent = selectedWeapon === 'stones' ? 'Stone'
    : selectedWeapon === 'saw' ? 'Attack' : selectedWeapon[0].toUpperCase() + selectedWeapon.slice(1);
  const ammo = document.querySelector<HTMLElement>('#weaponAmmo')!;
  ammo.textContent = String(stones);
  ammo.classList.toggle('hidden', selectedWeapon !== 'stones');
  document.querySelector('#weaponButton')!.setAttribute('aria-label',
    selectedWeapon === 'stones' ? `Throw stone, ${stones} remaining`
      : selectedWeapon === 'saw' ? 'Attack with saw; use primary action to saw' : `Attack with ${selectedWeapon}`);
  document.querySelector('#stoneHubCount')!.textContent = `Stones ${stones}`;
}

function throwStone() {
  if (!gameStarted || gameplayBlocked() || driving || buildMode || attackCooldown > 0) return;
  if (stones < 1) { toast('No stones remaining'); return; }
  updateRuntimeFrame();
  stones--;
  selectedWeapon = 'stones';
  updateWeaponControl();
  attackCooldown = 0.6;
  const stone = new THREE.Mesh(stoneGeometry, stoneMaterial);
  stone.castShadow = true;
  stone.position.copy(player.position).add(new THREE.Vector3(0, 1.25, 0));
  const frame = runtimeFrame.tangent;
  const localPlayer = frame.toLocal(player.position);
  const facingX = Math.sin(player.rotation.y);
  const facingZ = Math.cos(player.rotation.y);
  const localFacing = frame.toLocal({ x: player.position.x + facingX, z: player.position.z + facingZ });
  const forward = new THREE.Vector3(localFacing.x - localPlayer.x, 0, localFacing.z - localPlayer.z);
  // Longitude has no projected eastward extent at the exact pole; use the local bearing there.
  if (forward.lengthSq() < 1e-20) forward.set(facingX, 0, facingZ);
  forward.normalize();
  const target = enemies.find(enemy => {
    const distance = planetDistanceMeters(player.position, enemy.position);
    if (distance > 12 || distance <= 0.1) return false;
    const local = frame.toLocal(enemy.position);
    const offset = new THREE.Vector3(local.x - localPlayer.x, 0, local.z - localPlayer.z);
    return offset.normalize().dot(forward) > 0.75
      && !rayIsObstructed(player.position.x, player.position.y + 1.25, player.position.z,
        enemy.position.x, enemy.position.y + 1, enemy.position.z, structures, buildingRecords);
  });
  let verticalSpeed = 2.4;
  if (target) {
    const local = frame.toLocal(target.position);
    const offset = new THREE.Vector3(local.x - localPlayer.x, 0, local.z - localPlayer.z);
    const time = offset.length() / 11;
    player.rotation.y = Math.atan2(target.position.x - player.position.x, target.position.z - player.position.z);
    forward.copy(offset.normalize());
    verticalSpeed = (target.position.y + 1 - stone.position.y) / time + 4.9 * time;
  }
  const velocity = forward.multiplyScalar(11).add(new THREE.Vector3(0, verticalSpeed, 0));
  thrownStones.push({ mesh: stone, motion: new PlanetaryProjectile(stone.position, velocity, frame), remaining: 3 });
  scene.add(stone);
  animationAction = 'attack';
  animationActionTime = 0.45;
  toast('Stone thrown');
}

function useWeapon() {
  if (selectedWeapon === 'stones') throwStone();
  else meleeAttack();
}

function meleeAttack() {
  if (!gameStarted || gameplayBlocked() || driving || buildMode) return;
  if (attackCooldown > 0) return;
  const enemy = enemies.find(item => worldDistance(item.position, player.position) < 2.8);
  if (enemy) {
    const toEnemy = enemy.position.clone().sub(player.position).setY(0);
    if (toEnemy.lengthSq() === 0) return;
    const heading = Math.atan2(toEnemy.x, toEnemy.z);
    player.rotation.y = heading;
    if (rayIsObstructed(player.position.x, player.position.y + 1, player.position.z,
      enemy.position.x, enemy.position.y + 1, enemy.position.z, structures, buildingRecords)) {
      toast('Attack blocked');
      return;
    }
    attackCooldown = 0.6;
    animationAction = 'attack';
    animationActionTime = 0.5;
    pendingMelee = { target: enemy, kind: 'enemy', damage: selectedWeapon === 'axe' ? 2 : selectedWeapon === 'stick' ? 1 : 1, time: 0.28 };
    return;
  }
  const animal = wildlife.find(item => geographicDistanceMeters(
    item.geographic ?? planetPositionToGeographic(item.x, item.z), playerGeographic) < 2);
  if (animal) {
    if (rayIsObstructed(player.position.x, player.position.y + 1, player.position.z,
      animal.x, world.heightAt(animal.x, animal.z) + 1, animal.z, structures, buildingRecords)) {
      toast('Attack blocked');
      return;
    }
    attackCooldown = 0.6;
    player.rotation.y = Math.atan2(animal.x - player.position.x, animal.z - player.position.z);
    animationAction = 'attack';
    animationActionTime = 0.5;
    pendingMelee = { target: animal, kind: 'animal', damage: selectedWeapon === 'axe' ? 2 : selectedWeapon === 'stick' ? 1 : 1, time: 0.28 };
    return;
  }
  attackCooldown = 0.6;
  animationAction = 'attack';
  animationActionTime = 0.5;
}

function nearestGatherTarget() {
  const deposit = world.findNearestDeposit(player.position.x, player.position.z, 3.2);
  const natural = world.findNearest(player.position.x, player.position.z, 3.2);
  if (deposit && (!natural || planetDistanceMeters(world.resourceLocation(deposit), player.position)
    < world.resourceDistance(natural, player.position.x, player.position.z))) {
    return { kind: 'deposit' as const, object: deposit };
  }
  return natural ? { kind: 'resource' as const, object: natural } : null;
}

const depositNames: Record<DepositKind, string> = {
  stone: 'stone', clay: 'clay', sand: 'sand', coal: 'coal',
  copperOre: 'copper ore', ironOre: 'iron ore', limestone: 'limestone',
};

function updateGatherHint(dt: number) {
  gatherHintTimer -= dt;
  if (gatherHintTimer > 0) return;
  gatherHintTimer = 0.25;
  const target = nearestGatherTarget();
  let label = 'Gather';
  let accessible = 'Primary action';
  gatherHint = 'gather';
  if (target?.kind === 'deposit') {
    const mineral = target.object.userData.mineral as DepositKind;
    const name = depositNames[mineral];
    const needsPickaxe = requiresPickaxe(mineral) && !tools.includes('pickaxe');
    const verb = requiresPickaxe(mineral) ? 'mine' : 'gather';
    label = name[0].toUpperCase() + name.slice(1);
    accessible = `${verb[0].toUpperCase()}${verb.slice(1)} ${name}${needsPickaxe ? ', pickaxe required' : ''}`;
    gatherHint = needsPickaxe ? `${name} (pickaxe required)` : `${verb} ${name}`;
  } else if (target?.object.userData.resource === 'wood') {
    const tree = target.object;
    const harvest = world.treeHarvestState(tree);
    const name = harvest?.phase === 'logs' ? 'cut wood' : harvest?.phase === 'fallen' ? 'trunk' : 'tree';
    if (harvest?.phase !== 'logs' && selectedWeapon !== 'saw') {
      label = 'Saw needed';
      accessible = `Saw ${name}, saw required`;
      gatherHint = `saw ${name} (saw required)`;
    } else if (world.resourceDistance(tree, player.position.x, player.position.z) >= TREE_WORK_REACH) {
      label = 'Get closer';
      accessible = `Move closer to ${name}`;
      gatherHint = `move closer to ${name}`;
    } else if (world.isTreeFalling(tree)) {
      label = 'Wait';
      accessible = 'Wait for tree to fall';
      gatherHint = 'wait for tree to fall';
    } else if (harvest?.phase === 'logs') {
      label = 'Collect';
      accessible = `Collect cut wood, ${harvest.remaining} remaining`;
      gatherHint = `collect wood (${harvest.remaining} left)`;
    } else {
      label = harvest?.phase === 'fallen' ? 'Saw trunk' : 'Saw tree';
      accessible = `Saw ${name}`;
      gatherHint = `saw ${name}`;
    }
  }
  if (enemies.some(item => worldDistance(item.position, player.position) < 2.8)
    || wildlife.some(item => geographicDistanceMeters(item.geographic ?? planetPositionToGeographic(item.x, item.z), playerGeographic) < 2)) {
    gatherHint = 'attack';
  }
  const actionLabel = actionA.querySelector('span')!;
  if (actionLabel.textContent !== label) actionLabel.textContent = label;
  if (actionA.getAttribute('aria-label') !== accessible) actionA.setAttribute('aria-label', accessible);
}

function gather(includeCombat = true) {
  if (!gameStarted || gameplayBlocked() || driving || buildMode) return;
  if (includeCombat && (enemies.some(item => worldDistance(item.position, player.position) < 2.8)
    || wildlife.some(item => geographicDistanceMeters(item.geographic ?? planetPositionToGeographic(item.x, item.z), playerGeographic) < 2))) {
    meleeAttack();
    return;
  }
  const target = nearestGatherTarget();
  if (target?.kind === 'deposit') {
    if (attackCooldown > 0) return;
    const result = world.mineDeposit(target.object, tools.includes('pickaxe'));
    if (!result) return;
    if (result.needsPickaxe) { toast('Craft a pickaxe to mine this deposit'); return; }
    attackCooldown = 0.6;
    animationAction = 'mine';
    animationActionTime = 0.6;
    effects.burst(result.position.clone().add(new THREE.Vector3(0, 0.6, 0)), 'stone');
    onboarding.gathered = true;
    const amount = ironPickaxe ? 2 : 1;
    if (result.mineral === 'stone') resources.stone += amount;
    else mineralInventory[result.mineral] += amount;
    toast(`+${amount} ${result.mineral} · ${result.progress}/3`);
    updateResources();
    updateObjective();
    void saveGame(false);
    return;
  }
  const natural = target?.object;
  if (natural?.userData.resource === 'wood') {
    if (attackCooldown > 0) return;
    const result = world.workTree(natural, selectedWeapon === 'saw', player.position);
    if (!result) return;
    if (result.kind === 'needs-saw') { toast('Select the starter saw in Tools to cut trees'); return; }
    if (result.kind === 'out-of-reach') { toast('Move closer to the tree or logs'); return; }
    if (result.kind === 'falling') { toast('Wait for the tree to fall'); return; }
    if (result.kind === 'limit') { toast('Collect some cut wood before starting another tree'); return; }
    const target = nearestPlanetPosition(result.position.x, result.position.z, player.position.x, player.position.z);
    if (Math.hypot(target.x - player.position.x, target.z - player.position.z) > 0.01) {
      player.rotation.y = Math.atan2(target.x - player.position.x, target.z - player.position.z);
    }
    attackCooldown = 0.75;
    animationAction = result.kind === 'collected' ? 'gather' : 'saw';
    animationActionTime = 0.75;
    if (result.kind !== 'collected') player.userData.sawTarget = result.position.clone();
    if (result.kind !== 'collected') effects.burst(result.position, 'wood');
    if (result.kind === 'felling') toast(`Sawing tree · ${result.progress}/3`);
    else if (result.kind === 'felled') toast('Tree falling · saw the trunk when it lands');
    else if (result.kind === 'sawing') toast(`Sawing trunk · ${result.progress}/2`);
    else if (result.kind === 'cut') toast(`Trunk cut · collect ${result.total} wood`);
    else {
      resources.wood += result.amount;
      onboarding.gathered = true;
      toast(`+${result.amount} wood · ${result.remaining} left`);
    }
    updateResources();
    updateObjective();
    void saveGame(false);
    return;
  }
  const found = world.gatherNearest(player.position.x, player.position.z, 3.2);
  if (!found) { toast('Move closer to a tree, rock, or berry bush'); return; }
  animationAction = found.resource === 'stone' ? 'mine' : 'chop';
  animationActionTime = 0.6;
  const amount = found.resource === 'wood' ? (tools.includes('axe') ? 5 : 3)
    : found.resource === 'stone' && tools.includes('pickaxe') ? 4 : 2;
  effects.burst(found.position.clone().add(new THREE.Vector3(0, found.resource === 'food' ? 0.45 : 0.6, 0)), found.resource);
  onboarding.gathered = true;
  resources[found.resource] += amount;
  if (found.resource === 'stone') stones += amount;
  toast(`+${amount} ${found.resource}`);
  updateResources();
  updateObjective();
  void saveGame(false);
}

function updateObjective() {
  const objective = onboardingObjective(onboarding, resources.wood,
    structures.some(piece => piece.kind === 'floor'), npcState.recruited);
  if (onboarding.mode === 'guide' && objective === null) onboarding.mode = 'complete';
  document.querySelector('#objective')!.classList.toggle('hidden', objective === null);
  if (objective !== null) document.querySelector('#objectiveText')!.textContent = objective;
}

function nearestPost() {
  return buildingRecords.filter(isTorchPost)
    .map(record => ({ record, distance: planetDistanceMeters(record, player.position) }))
    .filter(candidate => candidate.distance < 2.5)
    .sort((a, b) => a.distance - b.distance)[0];
}

function interact() {
  if (!gameStarted || gameplayBlocked() || buildMode) return;
  if (driving) {
    if (!canExitRover(vehicleSpeed)) {
      toast('⛔ Stop the rover before exiting');
      return;
    }
    clearMovement();
    playerGeographic = moveGeographic(vehicleGeographic, 90, 2);
    const exitPosition = projectGeographicPosition(playerGeographic, vehicle.position);
    player.position.set(exitPosition.x, world.heightAt(exitPosition.x, exitPosition.z), exitPosition.z);
    playerGeographic.altitude = player.position.y;
    scene.add(player);
    driving = false;
    vehicleSpeed = 0;
    document.querySelector('#hud')!.classList.remove('driving');
    document.querySelector('#vehicleIndicator')!.classList.add('hidden');
    document.querySelector('#exitVehicle')!.classList.add('hidden');
    document.querySelector('#actionA span')!.textContent = 'Gather';
    actionA.setAttribute('aria-label', 'Primary action');
    gatherHintTimer = 0;
    document.querySelector('#actionB span')!.textContent = 'Interact';
    actionB.setAttribute('aria-label', 'Interact');
    toast('Exited vehicle');
    return;
  }
  const door = structures.filter(piece => piece.kind === 'door' && Math.abs(piece.y - player.position.y) < 2)
    .map(piece => ({ piece, distance: planetDistanceMeters(piece, player.position) }))
    .filter(candidate => candidate.distance < 2.5)
    .sort((a, b) => a.distance - b.distance)[0];
  const smelter = buildingRecords.filter(record => record.kind === 'smelter')
    .map(record => ({ record, distance: planetDistanceMeters(record, player.position) }))
    .filter(candidate => candidate.distance < 3.2).sort((a, b) => a.distance - b.distance)[0];
  const post = nearestPost();
  if (door && door.distance <= Math.min(worldDistance(vehicle.position, player.position), worldDistance(npc.position, player.position), smelter?.distance ?? Infinity, post?.distance ?? Infinity)) {
    if (door.piece.open && pieceBlocks({ ...door.piece, open: false }, player.position.x, player.position.y, player.position.z)) {
      toast('Step out of the doorway first');
      return;
    }
    door.piece.open = !door.piece.open;
    structureCollisionDirty = true;
    toast(door.piece.open ? 'Door opened' : 'Door closed');
    void saveGame(false);
    return;
  }
  if (post && post.distance <= Math.min(worldDistance(vehicle.position, player.position), worldDistance(npc.position, player.position), smelter?.distance ?? Infinity)) {
    if (!togglePostFlame(post.record, torch)) { toast('Equip and ignite your torch first'); return; }
    postLightTimer = 0;
    toast(post.record.lit ? 'Torch post lit' : 'Torch post extinguished');
    void saveGame(false);
    return;
  }
  if (smelter && smelter.distance <= Math.min(worldDistance(vehicle.position, player.position), worldDistance(npc.position, player.position))) {
    releasePointerLock();
    activeSmelter = smelter.record;
    refreshSmelter();
    clearMovement();
    document.querySelector('#smelterPanel')!.classList.remove('hidden');
  } else if (worldDistance(vehicle.position, player.position) < 3.2) {
    playerGeographic = { ...vehicleGeographic };
    scene.remove(player);
    driving = true;
    vehicleSpeed = 0;
    document.querySelector('#hud')!.classList.add('driving');
    document.querySelector('#vehicleIndicator')!.classList.remove('hidden');
    document.querySelector('#exitVehicle')!.classList.remove('hidden');
    document.querySelector('#actionA span')!.textContent = 'Drive';
    actionA.setAttribute('aria-label', 'Accelerate');
    gatherHint = 'gather';
    gatherHintTimer = 0;
    document.querySelector('#actionB span')!.textContent = 'Brake';
    actionB.setAttribute('aria-label', 'Brake or reverse');
    toast('Driving rover');
  } else if (worldDistance(npc.position, player.position) < 3) {
    releasePointerLock();
    refreshNpcPanel();
    clearMovement();
    document.querySelector('#npcPanel')!.classList.remove('hidden');
  } else {
    world.dig(player.position.x, player.position.z);
    animationAction = 'mine';
    animationActionTime = 0.6;
    effects.burst(player.position, 'soil');
    toast('Excavated terrain');
  }
}

function updateResources() {
  retryPendingRoofs();
  updateWeaponControl();
  document.querySelector('#resourceCounts')!.innerHTML =
    `<div><b>🌲</b><span>${resources.wood}</span></div><div><b>◆</b><span>${resources.stone}</span></div><div><b>◒</b><span>${resources.food}</span></div><div><b>💧</b><span>${resources.water}</span></div>`;
  document.querySelector('#resourceSummary')!.textContent = `🌲 ${resources.wood} · ◆ ${resources.stone}`;
  (document.querySelector('#healthBar') as HTMLElement).style.width = `${health}%`;
  const item = (name: string, count: number, image: IconName) =>
    `<div class="pack-item">${icon(image)}<span>${name} <b>${count}</b></span></div>`;
  document.querySelector('#basicInventory')!.innerHTML =
    item('wood', resources.wood, 'wood') + item('stone', resources.stone, 'stone')
    + item('food', resources.food, 'food') + item('water', resources.water, 'water');
  document.querySelector('#mineralInventory')!.innerHTML =
    item('clay', mineralInventory.clay, 'mineral') + item('sand', mineralInventory.sand, 'mineral')
    + item('coal', mineralInventory.coal, 'mineral') + item('copper ore', mineralInventory.copperOre, 'mineral')
    + item('iron ore', mineralInventory.ironOre, 'mineral') + item('limestone', mineralInventory.limestone, 'mineral')
    + item('iron ingots', ingots.iron, 'ingot') + item('copper ingots', ingots.copper, 'ingot')
    + item('glass', ingots.glass, 'glass') + (ironPickaxe ? item('iron pickaxe', 1, 'pickaxe') : '');
  document.querySelector('#toolStatus')!.textContent = `Tools: saw${tools.length ? `, ${tools.join(', ')}` : ''}`;
  document.querySelectorAll<HTMLButtonElement>('[data-craft]').forEach(button => {
    button.disabled = tools.includes(button.dataset.craft as Tool);
  });
  refreshEquipmentPanel();
}

function closeResourceDetails() {
  document.querySelector('#resources')!.classList.remove('expanded');
  document.querySelector('#resourceToggle')!.setAttribute('aria-expanded', 'false');
}

const panelNotification = document.createElement('div');
panelNotification.id = 'panelNotification';
panelNotification.className = 'panel-notification';
panelNotification.setAttribute('role', 'status');
panelNotification.setAttribute('aria-live', 'polite');
panelNotification.setAttribute('aria-atomic', 'true');
let lastUiAction: Element | null = null;
document.addEventListener('click', event => {
  lastUiAction = event.target instanceof Element ? event.target.closest('button') : null;
}, true);
let notificationHost: HTMLElement | null = null;
const notificationObserver = new MutationObserver(() => {
  if (panelNotification.closest('.hidden') || (notificationHost && getComputedStyle(notificationHost).display === 'none')) {
    panelNotification.remove();
    notificationObserver.disconnect();
    notificationHost = null;
  }
});
let toastTimer: ReturnType<typeof setTimeout> | undefined;

function toast(message: string) {
  const element = document.querySelector('#toast')!;
  element.textContent = message;
  element.classList.add('visible');
  const surfaces = [
    '.update-panel:not(.hidden)',
    '.atlas-panel:not(.hidden) .atlas-controls',
    '.tool-hub:not(.hidden)',
    '.performance-monitor:not(.hidden)',
    '.character-panel:not(.hidden) .character-options',
    '.screen.active .menu-card',
    '.panel:not(.hidden)',
    '.placement-toolbar:not(.hidden)',
    '.tool-toolbar:not(.hidden)',
  ];
  const activeSurface = surfaces.map(selector => document.querySelector<HTMLElement>(selector))
    .find(surface => surface && getComputedStyle(surface).display !== 'none');
  notificationObserver.disconnect();
  if (activeSurface) {
    panelNotification.textContent = '';
    const action = lastUiAction?.closest('.pack-grid, .build-actions, .tool-hub-grid, .floor-controls, .roof-controls, .placement-buttons, .tool-actions, .paint-presets, .performance-monitor > div, .update-panel > div') ?? lastUiAction;
    const hubHeader = activeSurface.matches('.tool-hub') ? activeSurface.querySelector('header') : null;
    if (hubHeader) hubHeader.insertBefore(panelNotification, hubHeader.querySelector('button'));
    else if (action && activeSurface.contains(action)) action.insertAdjacentElement('afterend', panelNotification);
    else activeSurface.prepend(panelNotification);
    panelNotification.textContent = message;
    panelNotification.scrollIntoView({ block: 'nearest' });
    notificationHost = activeSurface.closest<HTMLElement>('.atlas-panel, .character-panel, .screen') ?? activeSurface;
    notificationObserver.observe(notificationHost, { attributes: true, attributeFilter: ['class'] });
  } else {
    panelNotification.remove();
    notificationHost = null;
  }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    element.classList.remove('visible');
    panelNotification.remove();
    notificationObserver.disconnect();
    notificationHost = null;
  }, Math.max(1800, Math.min(6000, message.length * 80)));
}

function showMap() {
  if (!gameStarted || gameplayBlocked()) return;
  closeResourceDetails();
  setToolHub(false);
  releasePointerLock();
  const tile = hierarchicalTileId(playerGeographic.latitude, playerGeographic.longitude, 4);
  if (!atlasState.explored.includes(tile)) atlasState.explored.push(tile);
  document.querySelector('#atlasPanel')!.classList.remove('hidden');
  drawAtlas();
  void saveGame(false);
}

function atlasPosition() {
  return { ...playerGeographic, altitude: world.heightAt(player.position.x, player.position.z) };
}

const atlasRaster = document.createElement('canvas');
atlasRaster.width = 360;
atlasRaster.height = 180;
let atlasRasterSeed: number | undefined;

function atlasImage() {
  if (atlasRasterSeed === seed) return atlasRaster;
  const context = atlasRaster.getContext('2d')!;
  const image = context.createImageData(atlasRaster.width, atlasRaster.height);
  for (let latitude = -90; latitude < 90; latitude++) {
    for (let longitude = -180; longitude < 180; longitude++) {
      const color = Number.parseInt(atlasBiomeColors[atlasBiomeAtCell(latitude, longitude, seed)].slice(1), 16);
      const index = ((89 - latitude) * atlasRaster.width + longitude + 180) * 4;
      image.data[index] = color >> 16;
      image.data[index + 1] = (color >> 8) & 255;
      image.data[index + 2] = color & 255;
      image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  atlasRasterSeed = seed;
  return atlasRaster;
}

function drawAtlas() {
  const canvas = document.querySelector<HTMLCanvasElement>('#atlasCanvas')!;
  const ctx = canvas.getContext('2d')!;
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  const ocean = ctx.createLinearGradient(0, 0, 0, height);
  ocean.addColorStop(0, '#91aaa0');
  ocean.addColorStop(1, '#557f7a');
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, width, height);

  const zoom = atlasState.zoom;
  const viewWidth = 360 / zoom;
  const viewHeight = 180 / zoom;
  const project = (latitude: number, longitude: number) => ({
    x: ((((longitude - atlasState.centerLongitude + 180) % 360 + 360) % 360 - 180) / viewWidth + 0.5) * width,
    y: ((atlasState.centerLatitude + viewHeight / 2 - latitude) / viewHeight) * height,
  });

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  const mapWidth = width * zoom;
  const mapHeight = height * zoom;
  const top = ((atlasState.centerLatitude + viewHeight / 2 - 90) / viewHeight) * height;
  for (const shift of [-360, 0, 360]) {
    const left = ((-180 + shift - atlasState.centerLongitude + viewWidth / 2) / viewWidth) * width;
    if (left < width && left + mapWidth > 0) ctx.drawImage(atlasImage(), left, top, mapWidth, mapHeight);
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = '#4e5f54';
  ctx.lineWidth = 1;
  for (let lon = -180; lon <= 180; lon += 30) {
    const a = project(-90, lon);
    const b = project(90, lon);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const y = project(lat, 0).y;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.restore();

  const position = atlasPosition();
  const player = project(position.latitude, position.longitude);
  ctx.fillStyle = '#f1cf70';
  ctx.strokeStyle = '#263b36';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(player.x, player.y - 11);
  ctx.lineTo(player.x - 7, player.y + 8);
  ctx.lineTo(player.x + 7, player.y + 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#263b36';
  ctx.font = '700 11px Georgia';
  for (const marker of atlasState.markers) {
    const point = project(marker.latitude, marker.longitude);
    if (point.x < 0 || point.x > width || point.y < 0 || point.y > height) continue;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = marker.kind === 'settlement' ? '#b95e48' : '#263b36';
    ctx.fill();
    ctx.fillStyle = '#263b36';
    ctx.fillText(marker.name, point.x + 9, point.y + 3);
  }

  ctx.fillStyle = '#263b36';
  ctx.font = '700 12px monospace';
  ctx.fillText(`${position.latitude.toFixed(3)}°, ${position.longitude.toFixed(3)}°`, 12, height - 14);
  const levelSeason = seasonsForLatitude(position.latitude, day);
  ctx.fillText(`${climateZone(position.latitude, position.altitude, 800, 0.5, seed)} · ${levelSeason.toUpperCase()}`, 12, height - 34);

  document.querySelector('#atlasZoom')!.textContent = `${zoom}×`;
  document.querySelector('#atlasCoordinates')!.innerHTML =
    `LAT ${position.latitude.toFixed(4)}°<br>LON ${position.longitude.toFixed(4)}°<br>REGION ${regionIdForCoordinates(position.latitude, position.longitude)}`;
  refreshAtlasMarkers();
}

function refreshAtlasMarkers() {
  const list = document.querySelector('#atlasMarkerList')!;
  list.replaceChildren();
  for (const marker of atlasState.markers) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${marker.name} · ${marker.latitude.toFixed(2)}, ${marker.longitude.toFixed(2)}`;
    button.addEventListener('click', () => {
      atlasState.centerLatitude = marker.latitude;
      atlasState.centerLongitude = marker.longitude;
      drawAtlas();
    });
    list.append(button);
  }
}

function closeAtlas() {
  document.querySelector('#atlasPanel')!.classList.add('hidden');
  void saveGame(false);
}

function addAtlasMarker() {
  const position = atlasPosition();
  const nameInput = document.querySelector<HTMLInputElement>('#atlasMarkerName')!;
  const name = nameInput.value.trim() || 'Camp';
  if (atlasState.markers.length >= 100) { toast('Marker limit reached'); return; }
  const marker: MapMarker = {
    id: `marker-${Date.now()}-${atlasState.markers.length}`,
    name: name.slice(0, 32),
    latitude: position.latitude,
    longitude: position.longitude,
    altitude: position.altitude,
    kind: 'landmark',
  };
  atlasState.markers.push(marker);
  drawAtlas();
  void saveGame(false);
  toast('Map marker added');
}

let last = performance.now();
let accumulator = 0;
const simulationStep = 1 / 30;
const frameSamples = new FrameSamples();
const performanceMonitor = document.querySelector<HTMLElement>('#performanceMonitor')!;
const performanceData = document.querySelector<HTMLElement>('#performanceData')!;
let performanceUpdate = 0;
let benchmark: SustainedBenchmark | null = null;
let benchmarkReport = '30-second test not started.';
let benchmarkContext = '';
function cancelBenchmark(reason: string) {
  if (!benchmark) return;
  benchmark = null;
  benchmarkReport = `30-second test cancelled: ${reason}. Start again during uninterrupted gameplay.`;
}
document.querySelector('#showPerformance')!.addEventListener('click', () => {
  frameSamples.reset();
  performanceUpdate = 0;
  performanceData.textContent = 'Resume gameplay to collect frame timings.';
  performanceMonitor.classList.remove('hidden');
});
document.querySelector('#hidePerformance')!.addEventListener('click', () => {
  cancelBenchmark('monitor hidden');
  performanceMonitor.classList.add('hidden');
  frameSamples.reset();
});
document.querySelector('#startBenchmark')!.addEventListener('click', () => {
  if (!gameStarted || gameplayBlocked() || document.hidden) {
    toast('Resume gameplay before starting the test');
    return;
  }
  benchmark = new SustainedBenchmark();
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  benchmarkContext = `Quality ${graphicsQuality}, render ${size.x} x ${size.y}, pixel ratio ${renderer.getPixelRatio().toFixed(2)}`;
  benchmarkReport = '30-second test starting; keep playing without pausing.';
  performanceUpdate = 0;
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) cancelBenchmark('page hidden');
});
window.addEventListener('resize', () => cancelBenchmark('viewport changed'));
document.querySelector('#copyPerformance')!.addEventListener('click', () => {
  if (!navigator.clipboard) { toast('Clipboard unavailable; select the report text'); return; }
  void navigator.clipboard.writeText(performanceData.textContent ?? '').then(
    () => toast('Performance report copied'),
    error => { console.error('Could not copy performance report', error); toast('Copy failed; select the report text'); },
  );
});
function animate(now: number) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (preview && !document.querySelector('#characterPanel')!.classList.contains('hidden')) preview.render(now);
  if (!gameStarted || gameplayBlocked()) {
    accumulator = 0;
    frameSamples.reset();
    cancelBenchmark('gameplay interrupted');
    renderer.render(scene, camera);
    return;
  }
  if (!performanceMonitor.classList.contains('hidden')) frameSamples.record(now);
  if (benchmark) {
    const state = benchmark.record(now);
    if (state === 'overflow') cancelBenchmark('sample capacity exceeded');
    else if (state === 'complete') {
      const timing = benchmark.summary();
      if (timing) {
        benchmarkReport = `30-second test complete (${(benchmark.elapsedMs / 1000).toFixed(1)} s, ${timing.count} frames)\n`
          + `FPS avg ${timing.averageFps.toFixed(1)}  median ${timing.medianFps.toFixed(1)}\n`
          + `Frame avg ${timing.meanMs.toFixed(1)} ms  p95 ${timing.p95Ms.toFixed(1)} ms  spikes >50 ms ${timing.spikes}\n`
          + benchmarkContext;
      } else {
        benchmarkReport = '30-second test failed: no valid frame samples.';
      }
      benchmark = null;
      performanceUpdate = 0;
    }
  }
  accumulator += dt;
  while (accumulator >= simulationStep) {
    updateGame(simulationStep);
    accumulator -= simulationStep;
  }
  renderer.render(scene, camera);
  if (!performanceMonitor.classList.contains('hidden') && now - performanceUpdate >= 1000) {
    performanceUpdate = now;
    const timing = frameSamples.summary();
    const vegetation = world.vegetationStats();
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    performanceData.textContent = [
      benchmark ? `30-second test running: ${(benchmark.elapsedMs / 1000).toFixed(1)} s; keep playing.` : benchmarkReport,
      timing ? `FPS ${timing.fps.toFixed(1)}  avg ${timing.averageFps.toFixed(1)}  median ${timing.medianFps.toFixed(1)}`
        : 'Collecting frame timings...',
      timing ? `Frame avg ${timing.meanMs.toFixed(1)} ms  p95 ${timing.p95Ms.toFixed(1)} ms (${timing.count} frames)` : '',
      'Live scene snapshot:',
      `Calls ${renderer.info.render.calls}  triangles ${renderer.info.render.triangles}`,
      `Geometries ${renderer.info.memory.geometries}  textures ${renderer.info.memory.textures}`,
      `Chunks ${world.loadedChunkCount}  cover instances ${vegetation.cover}`,
      `Authored trees near ${vegetation.near}  mid ${vegetation.mid}`,
      `Render ${size.x} x ${size.y}  pixel ratio ${renderer.getPixelRatio().toFixed(2)}`,
      `Quality ${graphicsQuality}  terrain atlases ${world.terrainReady ? 'ready' : 'loading or fallback'}`,
      'Frame timings are browser observations, not GPU timings.',
    ].filter(Boolean).join('\n');
  }
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
    if (spawn) {
      player.position.set(spawn.x, world.heightAt(spawn.x, spawn.z), spawn.z);
      playerGeographic = planetPositionToGeographic(spawn.x, spawn.z, player.position.y);
    }
    health = 100;
    toast('You were rescued and returned to camp');
  } else toast(message);
  updateResources();
}

function spawnEnemyProjectile(enemy: THREE.Group, damage: number) {
  if (enemyProjectiles.length >= 12) return;
  updateRuntimeFrame();
  const mesh = new THREE.Mesh(projectileGeometry, projectileMaterial);
  mesh.position.copy(enemy.position).add(new THREE.Vector3(0, 1.3, 0));
  const origin = runtimeFrame.tangent.toLocal(enemy.position);
  const target = runtimeFrame.tangent.toLocal(player.position);
  const velocity = new THREE.Vector3(target.x - origin.x, player.position.y + 1 - mesh.position.y, target.z - origin.z)
    .normalize().multiplyScalar(5);
  enemyProjectiles.push({ mesh, motion: new PlanetaryProjectile(mesh.position, velocity, runtimeFrame.tangent, 0), remaining: 3, damage });
  scene.add(mesh);
}

function spawnEnemy(kind: EnemyKind, x: number, z: number) {
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

function updateThrownStones(dt: number) {
  for (let i = thrownStones.length - 1; i >= 0; i--) {
    const projectile = thrownStones[i];
    const previous = projectile.mesh.position.clone();
    const position = projectile.motion.step(dt);
    projectile.mesh.position.set(position.x, position.y, position.z);
    projectile.remaining -= dt;
    const ground = world.heightAt(projectile.mesh.position.x, projectile.mesh.position.z);
    const direction = projectile.mesh.position.clone().sub(previous);
    stoneRay.set(runtimeFrame.projectedToRender(previous), direction.clone().normalize());
    stoneRay.far = direction.length();
    const naturalObjects = world.group.children.filter(object => {
      if (!object.userData.resource && !object.userData.depositId) return false;
      const position = world.resourceLocation(object);
      return (position.x - previous.x) ** 2 + (object.position.y - previous.y) ** 2 + (position.z - previous.z) ** 2 < 16;
    });
    const terrainHit = projectile.mesh.position.y < ground;
    const structureHit = rayIsObstructed(previous.x, previous.y, previous.z, projectile.mesh.position.x,
      projectile.mesh.position.y, projectile.mesh.position.z, structures, buildingRecords);
    const naturalIntersection = stoneRay.intersectObjects(naturalObjects, true)[0];
    const naturalHit = Boolean(naturalIntersection);
    const obstructed = terrainHit || structureHit || naturalHit;
    let hitEnemy: THREE.Group | undefined;
    if (!obstructed) {
      const segment = new THREE.Line3(previous, projectile.mesh.position);
      hitEnemy = enemies.find(enemy => segment.closestPointToPoint(
        enemy.position.clone().add(new THREE.Vector3(0, 1, 0)), true, new THREE.Vector3()
      ).distanceToSquared(enemy.position.clone().add(new THREE.Vector3(0, 1, 0))) < 0.65 ** 2);
    }
    if (obstructed || hitEnemy || projectile.remaining <= 0) {
      if (import.meta.env.DEV) {
        const { x, y, z } = projectile.mesh.position;
        lastStoneImpact = { x, y, z, kind: terrainHit ? 'terrain' : structureHit ? 'structure' : naturalHit ? 'natural' : hitEnemy ? 'enemy' : 'expired' };
      }
      if (hitEnemy) {
        hitEnemy.userData.health = (hitEnemy.userData.health as number) - 2;
        hitEnemy.userData.hurtAnimation = 0.35;
        if (hitEnemy.userData.health <= 0) {
          scene.remove(hitEnemy);
          disposeCharacter(hitEnemy);
          enemies.splice(enemies.indexOf(hitEnemy), 1);
        }
        toast('Stone hit!');
      }
      if (hitEnemy) effects.burst(projectile.mesh.position, 'damage');
      else if (terrainHit) effects.burst(new THREE.Vector3(projectile.mesh.position.x, ground, projectile.mesh.position.z), 'soil');
      else if (structureHit) effects.burst(projectile.mesh.position, 'wood');
      else if (naturalIntersection) {
        let target: THREE.Object3D | null = naturalIntersection.object;
        while (target && !target.userData.resource && !target.userData.depositId) target = target.parent;
        const kind = target?.userData.resource === 'wood' ? 'wood' : target?.userData.resource === 'food' ? 'food' : 'stone';
        effects.burst(runtimeFrame.renderToProjected(naturalIntersection.point), kind);
      }
      scene.remove(projectile.mesh);
      thrownStones.splice(i, 1);
    }
  }
}

function updateEnemyProjectiles(dt: number) {
  for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
    const projectile = enemyProjectiles[i];
    const point = projectile.mesh.position;
    const previous = point.clone();
    let impact: 'soil' | 'wood' | null = null;
    const result = stepEnemyProjectile(point, projectile.motion, projectile.remaining, dt,
      player.position.clone().add(new THREE.Vector3(0, 1, 0)), position => {
        if (position.y < world.heightAt(position.x, position.z)) { impact = 'soil'; return true; }
        if (rayIsObstructed(previous.x, previous.y, previous.z,
          position.x, position.y, position.z, structures, buildingRecords)) { impact = 'wood'; return true; }
        return false;
      });
    projectile.remaining = result.remaining;
    if (result.finished) {
      if (result.hit) damagePlayer(projectile.damage, 'A necromancer struck you!');
      if (result.hit) effects.burst(point, 'damage');
      else if (impact) effects.burst(point, impact);
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
  if (structuresChanged) {
    constructionRenderer.refresh(structures, surfacePaint);
    refreshPaintMarkers();
  }
  if (powerLinesChanged || structuresChanged) structureCollisionDirty = true;
  let roadsChanged = false;
  for (const road of roads) {
    const point = nearestPlanetPosition(road.x, road.z, player.position.x, player.position.z);
    if (road.x === point.x && road.z === point.z) continue;
    road.x = point.x;
    road.z = point.z;
    roadsChanged = true;
  }
  if (roadsChanged) {
    const slots = roadSlots(roads);
    for (const road of roads) {
      const model = roadModels.get(road.id);
      if (!model) throw new Error(`Missing road model: ${road.id}`);
      road.rotation = connectionLayout(road.x, road.z, slots).rotation;
      model.position.set(road.x, road.height + 0.035, road.z);
      model.rotation.y = road.rotation;
    }
  }
}

function roverSurfaceAt(x: number, z: number, referenceY: number) {
  let surface = floorSurface(structures, x, z, referenceY, world.heightAt(x, z));
  for (const road of roads) {
    const height = road.height + 0.035;
    if (Math.abs(x - road.x) <= 1 && Math.abs(z - road.z) <= 1
      && height <= referenceY + 0.55 && height > surface) surface = height;
  }
  return surface;
}

function updateRoverVisual(dt: number, signedTravel: number, steeringTurn: number, reset = false) {
  const pose = { x: vehicle.position.x, y: vehicle.position.y, z: vehicle.position.z, yaw: vehicle.rotation.y };
  roverWheelSamplePoints(pose, roverWheelPoints);
  for (const key of roverWheelKeys) {
    const point = roverWheelPoints[key];
    roverWheelGround[key] = roverSurfaceAt(point.x, point.z, pose.y);
  }
  if (reset) roverVisual.reset(pose, roverWheelGround);
  else roverVisual.update({
    pose, wheelGroundY: roverWheelGround, steeringYawRad: roverSteeringYaw,
    steeringTurnRad: steeringTurn, signedProjectedTravel: signedTravel, speedMps: vehicleSpeed, dt,
  });
}

function projectGeographicPosition(position: GeographicPosition, reference: THREE.Vector3) {
  const projected = geographicToPlanetPosition(position.latitude, position.longitude);
  return nearestPlanetPosition(projected.x, projected.z, reference.x, reference.z);
}

function worldDistance(a: THREE.Vector3, b: THREE.Vector3) {
  return Math.hypot(planetDistanceMeters(a, b), a.y - b.y);
}

function transportCameraAngle(angle: number, start: GeographicPosition, destination: GeographicPosition) {
  const bearing = transportBearing(start, destination, THREE.MathUtils.radToDeg(angle));
  return THREE.MathUtils.degToRad(bearing);
}

function transportCharacterYaw(yaw: number, start: GeographicPosition, destination: GeographicPosition) {
  const bearing = transportBearing(start, destination, THREE.MathUtils.radToDeg(yaw));
  return THREE.MathUtils.degToRad(bearing);
}

function updateRuntimeFrame() {
  if (geographicDistanceMeters(runtimeFrame.tangent.origin, playerGeographic) < 24) return;
  const next = runtimeFrame.relocate(player.position);
  for (const projectile of thrownStones) {
    if (planetDistanceMeters(projectile.mesh.position, player.position) < 1000) projectile.motion.rebase(next);
  }
  for (const projectile of enemyProjectiles) {
    if (planetDistanceMeters(projectile.mesh.position, player.position) < 1000) projectile.motion.rebase(next);
  }
}

function rebaseWorld() {
  runtimeFrame.updateRenderOrigin(player.position);
  scene.position.set(-renderOrigin.x, 0, -renderOrigin.z);
}

function updateGame(dt: number) {
  updateRuntimeFrame();
  const wind = Math.max(0, 0.7 + 0.9 * Math.sin(gameMinutes / 1440 * Math.PI * 2));
  effects.update(dt, player.position, wind, graphicsQuality);
  waterEffects.update(dt);
  if (pendingMelee) {
    pendingMelee.time -= dt;
    if (pendingMelee.time <= 0) {
      const pending = pendingMelee;
      pendingMelee = null;
      if (pending.kind === 'enemy') {
        const enemy = pending.target as THREE.Group;
        if (enemies.includes(enemy)) {
          const blocked = rayIsObstructed(player.position.x, player.position.y + 1, player.position.z,
            enemy.position.x, enemy.position.y + 1, enemy.position.z, structures, buildingRecords);
          if (!blocked && worldDistance(enemy.position, player.position) <= 2.8) {
            enemy.userData.health = (enemy.userData.health as number) - pending.damage;
            enemy.userData.hurtAnimation = 0.35;
            effects.burst(enemy.position.clone().add(new THREE.Vector3(0, 1, 0)), 'damage');
            if (enemy.userData.health <= 0) {
              scene.remove(enemy);
              disposeCharacter(enemy);
              enemies.splice(enemies.indexOf(enemy), 1);
              toast(`${enemy.userData.enemyKind as string} defeated`);
            } else toast('Hit!');
          }
        }
      } else {
        const animal = pending.target as AnimalState;
        if (wildlife.includes(animal)) {
          const blocked = rayIsObstructed(player.position.x, player.position.y + 1, player.position.z,
            animal.x, world.heightAt(animal.x, animal.z) + 1, animal.z, structures, buildingRecords);
          if (!blocked && geographicDistanceMeters(
            animal.geographic ?? planetPositionToGeographic(animal.x, animal.z), playerGeographic) <= 2.2) {
            animal.health -= pending.damage;
            effects.burst(new THREE.Vector3(animal.x, world.heightAt(animal.x, animal.z) + 0.6, animal.z), 'damage');
            if (animal.health <= 0) {
              wildlife.splice(wildlife.indexOf(animal), 1);
              removeAnimal(animal.id);
              if (animal.species !== 'wolf') {
                resources.food += animal.species === 'deer' ? 3 : 1;
                updateResources();
              }
              toast(animal.species === 'wolf' ? 'Wolf driven off' : 'Food collected');
            } else toast(`${animal.species} hit`);
          }
        }
      }
    }
  }
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
  const mapPosition = atlasPosition();
  const season = Math.abs(mapPosition.latitude) >= 23.5 ? seasonsForLatitude(mapPosition.latitude, day) : seasonForDay(day);
  const weatherBase = weatherForDay(day, seed);
  const positionHeight = world.heightAt(player.position.x, player.position.z);
  const climate = climateZone(mapPosition.latitude, positionHeight, 800, 0.5, seed);
  const weather = climate === 'hot-desert' || climate === 'savanna' || climate === 'steppe'
    ? (weatherBase === 'Rain' || weatherBase === 'Storm' || weatherBase === 'Snow' ? 'Clear' : weatherBase)
    : climate === 'polar-ice' || climate === 'tundra'
      ? (weatherBase === 'Rain' || weatherBase === 'Storm' ? 'Snow' : weatherBase)
      : weatherBase;
  document.querySelector('#seasonText')!.textContent = `${season.toUpperCase()} · DAY ${day} · ${weather.toUpperCase()}`;
  world.setSeason(season);
  precipitation.update(weather, driving ? vehicle.position : player.position, dt, constructionRenderer.shelter, wind);
  const shelterPosition = driving ? vehicle.position : player.position;
  const shelter = constructionRenderer.shelter.status(shelterPosition.x, shelterPosition.y, shelterPosition.z);
  const shelterStatus = document.querySelector<HTMLElement>('#shelterStatus')!;
  shelterStatus.classList.toggle('hidden', shelter === 'outside');
  if (shelterStatus.textContent !== shelter.toUpperCase()) shelterStatus.textContent = shelter.toUpperCase();
  const celestial = celestialState(gameMinutes, day, mapPosition.latitude);
  const lighting = environmentLighting(gameMinutes, weather, celestial.sun.y);
  const moonlit = moonlitSceneLighting(lighting, celestial.illumination, celestial.moon.y);
  if (scene.fog instanceof THREE.Fog) {
    const fog = atmosphericFogRange(fogStart, fogEnd, renderDistance, graphicsQuality, weather, lighting.daylight, positionHeight);
    scene.fog.near = THREE.MathUtils.damp(scene.fog.near, fog.near, 1.5, dt);
    scene.fog.far = THREE.MathUtils.damp(scene.fog.far, fog.far, 1.5, dt);
  }
  ambient.intensity = THREE.MathUtils.damp(ambient.intensity, moonlit.hemisphere, 5, dt);
  sun.intensity = THREE.MathUtils.damp(sun.intensity, lighting.sunlight, 5, dt);
  moon.intensity = THREE.MathUtils.damp(moon.intensity, moonlit.moonlight, 5, dt);
  ambient.color.lerpColors(nightAmbient, dayAmbient, lighting.daylight);
  ambient.groundColor.lerpColors(nightGround, dayGround, lighting.daylight);
  sun.color.lerpColors(noonSun, twilightSun, lighting.twilight);
  nightSky.setHSL(0.60 - 0.07 * lighting.daylight, 0.38, lighting.skyBrightness);
  nightSky.lerp(twilightSky, lighting.twilight * 0.35);
  if (scene.background instanceof THREE.Color) scene.background.lerp(nightSky, 1 - Math.exp(-5 * dt));
  if (scene.fog instanceof THREE.Fog && scene.background instanceof THREE.Color) scene.fog.color.copy(scene.background);

  let actualMovement = 0;
  let roverTravel = 0;
  let roverTurn = 0;
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
    const throttle = !gameplayBlocked() && brakeTouch ? -1 : !gameplayBlocked() && accelerateTouch ? 1 : -inputZ;
    const proposal = proposeRoverDrive({ speedMps: vehicleSpeed, steerYawRad: roverSteeringYaw },
      { throttle, steer: inputX }, dt);
    const proposedYaw = vehicle.rotation.y + proposal.turnRad;
    const dx = Math.cos(proposedYaw);
    const dz = -Math.sin(proposedYaw);
    const headingBearing = Math.atan2(dx, dz) * 180 / Math.PI;
    let transportedHeading = headingBearing;
    const travelBearing = headingBearing + (proposal.signedMeters < 0 ? 180 : 0);
    const oldVehicleGeographic = vehicleGeographic;
    const nextPosition = runtimeFrame.move(vehicle.position, oldVehicleGeographic, travelBearing, Math.abs(proposal.signedMeters));
    const nextGeographic = nextPosition.geographic;
    const nextX = nextPosition.x;
    const nextZ = nextPosition.z;
    const nextY = roverSurfaceAt(nextX, nextZ, vehicle.position.y);
    transportedHeading = transportBearing(oldVehicleGeographic, nextGeographic, headingBearing);
    const blocked = world.heightAt(nextX, nextZ) <= -0.5
      || buildingRecords.some(b => Math.hypot(nextX - b.x, nextZ - b.z) < (b.kind === 'shelter' ? 2.4 : 1.8))
      || structures.some(piece => pieceBlocks(piece, nextX, vehicle.position.y, nextZ, 1));
    if (!blocked) {
      roverTravel = Math.hypot(nextX - vehicle.position.x, nextZ - vehicle.position.z) * Math.sign(proposal.signedMeters);
      roverTurn = proposal.turnRad;
      vehicle.position.x = nextX;
      vehicle.position.z = nextZ;
      vehicle.position.y = nextY;
      vehicleGeographic = { ...nextGeographic, altitude: vehicle.position.y };
      vehicle.rotation.y = THREE.MathUtils.degToRad(transportedHeading) - Math.PI / 2;
      cameraAngle = transportCameraAngle(cameraAngle, oldVehicleGeographic, nextGeographic);
      movementBasis = transportCameraAngle(movementBasis, oldVehicleGeographic, nextGeographic);
    }
    const committed = commitRoverDrive(proposal, blocked);
    vehicleSpeed = committed.speedMps;
    roverSteeringYaw = committed.steerYawRad;
    document.querySelector('#vehicleIndicator')!.textContent = `SPEED ${Math.abs(vehicleSpeed).toFixed(1)}`;
    if (cameraSettings.autoFollow && Math.abs(vehicleSpeed) > 0.15 && performance.now() > manualCameraUntil) {
      cameraAngle = dampAngle(cameraAngle, THREE.MathUtils.degToRad(transportedHeading) + Math.PI, 2.2, dt);
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
    const moveBearing = Math.atan2(dx, dz) * 180 / Math.PI;
    const nextPosition = runtimeFrame.move(target.position, playerGeographic, moveBearing, speed * Math.min(1, length) * dt);
    const nextX = nextPosition.x;
    const nextZ = nextPosition.z;
    const collides = buildingRecords.some(b => Math.hypot(nextX - b.x, nextZ - b.z) < (b.kind === 'shelter' ? 2 : b.kind === 'storage' ? 1.6 : 1))
      || structures.some(piece => pieceBlocks(piece, nextX, target.position.y, nextZ));
    if (!collides && world.heightAt(nextX, nextZ) > -0.5) {
      const nextY = grounded
        ? floorSurface(structures, nextX, nextZ, target.position.y, world.heightAt(nextX, nextZ))
        : target.position.y;
      const result = wildlifeCollision.moveBody({
        body: wildlifeCollision.playerBody(), to: { position: nextPosition, bottomY: nextY }, dt,
        // Retain legacy player/world collision until projected polar resource density is resolved.
        includeStatic: false,
        canOccupy: point => world.heightAt(point.x, point.z) > -0.5,
      });
      if (result.status === 'incomplete') reportCollisionUnavailable(result.reason ?? 'unavailable');
      if (result.status !== 'incomplete' && result.travelledM > 1e-5) {
        const position = result.pose.position;
        const oldGeographic = playerGeographic;
        const resolvedGeographic = position.geographic ?? planetPositionToGeographic(position.x, position.z);
        const resolvedBearing = result.status === 'slid' ? geographicBearing(oldGeographic, resolvedGeographic) : moveBearing;
        const transportedMoveBearing = transportBearing(oldGeographic, resolvedGeographic, resolvedBearing);
        target.position.x = position.x;
        target.position.z = position.z;
        cameraAngle = transportCameraAngle(cameraAngle, oldGeographic, resolvedGeographic);
        movementBasis = transportCameraAngle(movementBasis, oldGeographic, resolvedGeographic);
        target.rotation.y = dampAngle(transportCharacterYaw(target.rotation.y, oldGeographic, resolvedGeographic),
          THREE.MathUtils.degToRad(transportedMoveBearing), 10, dt);
        playerGeographic = { ...resolvedGeographic, altitude: world.heightAt(position.x, position.z) };
        actualMovement = length;
        if (!buildMode && document.pointerLockElement !== canvas && cameraSettings.autoFollow && performance.now() > manualCameraUntil) {
          cameraAngle = dampAngle(cameraAngle, THREE.MathUtils.degToRad(transportedMoveBearing) + Math.PI, 2.2, dt);
        }
      }
    }
    if (grounded) target.position.y = floorSurface(structures, target.position.x, target.position.z, target.position.y, world.heightAt(target.position.x, target.position.z));
  } else previousInput.set(0, 0);

  if (!driving) {
    const ground = world.heightAt(player.position.x, player.position.z);
    const waterDepth = 0.08 - ground;
    swimming = ground < 0.1 && waterDepth > 0.12;
    if (swimming) {
      player.position.y = THREE.MathUtils.lerp(player.position.y, Math.max(0.55, ground + 0.55), 1 - Math.exp(-6 * dt));
      playerVerticalVelocity = 0;
      grounded = false;
    } else {
      playerVerticalVelocity -= 16 * dt;
      const nextY = player.position.y + playerVerticalVelocity * dt;
      const walkedGround = floorSurface(structures, player.position.x, player.position.z, nextY, ground);
      if (nextY <= walkedGround) {
        player.position.y = walkedGround;
        playerVerticalVelocity = 0;
        grounded = true;
      } else {
        player.position.y = nextY;
        grounded = false;
      }
    }
  }

  if (driving) {
    player.position.copy(vehicle.position).add(new THREE.Vector3(0, 1, 0));
    playerGeographic = { ...vehicleGeographic };
  }
  const waterFloor = floorSurface(structures, player.position.x, player.position.z, player.position.y,
    world.heightAt(player.position.x, player.position.z));
  footprints.update(dt, player.position, !driving && grounded && !swimming && !gameplayBlocked(), (x, z) => {
    const height = world.heightAt(x, z);
    if (floorSurface(structures, x, z, player.position.y, height) > height + 0.05) return undefined;
    return footprintSurface(biomeAt(x, z, seed), season, weather, height);
  }, (x, z) => world.heightAt(x, z));
  const touchingWater = !driving && swimming && player.position.y <= 0.65 && waterFloor < -0.08;
  rippleTimer = Math.max(0, rippleTimer - dt);
  if (touchingWater && !waterContact) {
    waterEffects.emit(player.position.x, player.position.z, true);
    rippleTimer = 0.55;
  } else if (touchingWater && actualMovement > 0.08 && rippleTimer === 0) {
    waterEffects.emit(player.position.x, player.position.z, false);
    rippleTimer = 0.55;
  }
  waterContact = touchingWater;
  updateRuntimeFrame();
  const lightingFocus = driving ? vehicle.position : player.position;
  sun.position.copy(lightingFocus).addScaledVector(celestial.sun, 50);
  sun.target.position.copy(lightingFocus);
  moon.position.copy(lightingFocus).addScaledVector(celestial.moon, 50);
  moon.target.position.copy(lightingFocus);
  rebaseWorld();
  world.updateChunks(player.position.x, player.position.z);
  projectWorldEntities();
  updateRoverVisual(dt, roverTravel, roverTurn);
  constructionRenderer.update(dt, player.position, cameraGlobalPosition, renderOrigin);

  const elapsed = performance.now();
  updateNpc(dt);
  updateWildlife(wildlife, dt, seed, {
    x: player.position.x, z: player.position.z, geographic: playerGeographic,
  }, (x, z) => world.heightAt(x, z), (damage, predator) => {
    if (!driving) damagePlayer(damage, `A ${predator} attacked!`);
  }, (position, bearing, distance, geographic) => runtimeFrame.move(position,
    geographic ?? planetPositionToGeographic(position.x, position.z), bearing, distance), wildlifeCollision);
  updateAnimalModels(elapsed, dt);

  buildings.forEach(building => {
    if (building.userData.building === 'turbine') {
      const blades = building.userData.blades as THREE.Group;
      if (blades) blades.rotation.z += dt * 0.9;
    }
  });
  world.animate(elapsed, wind, dt);
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
    const spawn = movePlanetPosition(player.position, THREE.MathUtils.radToDeg(angle), 12, playerGeographic);
    const x = spawn.x;
    const z = spawn.z;
    if (world.heightAt(x, z) > 0.2 && buildingRecords.every(b => planetDistanceMeters(spawn, b) > 4)) {
      const kind = chooseEnemyKind(day, seededNoise(x, z, seed + day));
      spawnEnemy(kind, x, z);
    }
    spawnCooldown = 20;
  }
  enemies.forEach(enemy => {
    const kind = enemy.userData.enemyKind as EnemyKind;
    const profile = enemyProfiles[kind];
    enemy.userData.attackTimer = Math.max(0, (enemy.userData.attackTimer as number) - dt);
    enemy.userData.attackAnimation = Math.max(0, (enemy.userData.attackAnimation as number) - dt);
    enemy.userData.hurtAnimation = Math.max(0, (enemy.userData.hurtAnimation as number) - dt);
    const offset = planetOffset(enemy.position, player.position);
    const horizontalDistance = Math.hypot(offset.x, offset.z);
    const enemyDistance = worldDistance(enemy.position, player.position);
    const intent = enemyIntent(kind, enemyDistance, enemy.userData.attackTimer === 0);
    const bearing = planetBearingDegrees(enemy.position, player.position);
    let walking = 0;
    const enemyCanSee = !rayIsObstructed(enemy.position.x, enemy.position.y + 1, enemy.position.z,
      player.position.x, player.position.y + 1, player.position.z, structures, buildingRecords);
    if (horizontalDistance > 0 && enemyDistance < 18 && enemyCanSee) {
      const travelBearing = bearing + (intent.movement < 0 ? 180 : 0);
      const next = runtimeFrame.move(enemy.position, planetPositionToGeographic(enemy.position.x, enemy.position.z, enemy.position.y),
        travelBearing, dt * profile.speed * Math.abs(intent.movement));
      const resolved = resolvePlanetActorMove(enemy.position.x, enemy.position.z, next.x, next.z,
        enemy.position.y, structures, buildingRecords, 0.35);
      if (!resolved.blocked && world.heightAt(next.x, next.z) > -0.5) {
        enemy.position.x = resolved.x;
        enemy.position.z = resolved.z;
        walking = Math.abs(intent.movement);
      }
      enemy.position.y = world.heightAt(enemy.position.x, enemy.position.z);
      enemy.rotation.y = dampAngle(enemy.rotation.y, THREE.MathUtils.degToRad(bearing), 8, dt);
      if (intent.attack) {
        enemy.userData.attackTimer = profile.cooldown;
        enemy.userData.attackAnimation = 0.6;
        if (enemyCanSee) {
          if (profile.ranged) spawnEnemyProjectile(enemy, profile.damage);
          else damagePlayer(profile.damage, `${kind} hit you!`);
        }
      }
    }
    const hurt = enemy.userData.hurtAnimation as number;
    const attack = enemy.userData.attackAnimation as number;
    animateCharacter(enemy, dt, walking, kind === 'nightcreature', hurt > 0 ? 'hurt' : attack > 0 ? 'attack' : undefined, false, hurt || attack);
  });
  updateThrownStones(dt);
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
  const pitch = cameraPitchView(cameraPitch);
  const horizontal = distance * Math.cos(pitch.orbit);
  cameraDesired.set(
    cameraFocus.x + Math.sin(cameraAngle) * horizontal,
    cameraFocus.y + distance * Math.sin(pitch.orbit),
    cameraFocus.z + Math.cos(cameraAngle) * horizontal,
  );
  const rayDirection = cameraDesired.clone().sub(cameraFocus);
  const rayLength = rayDirection.length();
  rayDirection.normalize();
  cameraRay.set(runtimeFrame.projectedToRender(cameraFocus), rayDirection);
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
  cameraGlobalPosition.lerp(cameraDesired, 1 - Math.exp(-cameraSettings.smoothing * dt));
  cameraGlobalPosition.y = Math.max(cameraGlobalPosition.y, world.heightAt(cameraGlobalPosition.x, cameraGlobalPosition.z) + 0.5);
  runtimeFrame.projectedToRender(cameraGlobalPosition, camera.position);
  aimFollowCamera(pitch.aimSlope);
  if (scene.background instanceof THREE.Color) {
    sky.update(cameraGlobalPosition, celestial, lighting.daylight, lighting.twilight, scene.background, weather, wind, dt);
  }
  world.updateTreeOcclusion(cameraGlobalPosition, focus, dt);

  animateCharacter(player, dt, actualMovement, keys.has('ShiftLeft'), animationActionTime > 0 ? animationAction : undefined);
  attachHandTorch(player, handTorch.group);
  handTorch.group.visible = torch.equipped && !driving;
  handTorch.fire.visible = torch.lit;
  const fireTime = elapsed / 1000;
  updateFireAnimation(fireTime, wind);
  handTorch.light.intensity = torch.lit && !driving ? fireLightIntensity(fireTime) : 0;
  postLightTimer -= dt;
  if (postLightTimer <= 0) {
    const posts = buildingRecords.filter(isTorchPost);
    visiblePostLights = nearbyFireLights(posts, player.position.x, player.position.z, postLights.length, 18);
    buildings.forEach((building, index) => {
      const record = buildingRecords[index];
      if (!isTorchPost(record)) return;
      const visible = planetDistanceMeters(record, player.position) < renderDistance * 24 + 12;
      building.visible = visible;
      const fire = building.getObjectByName('post-flame');
      if (fire) fire.visible = visible && record.lit;
    });
    postLightTimer = 0.5;
  }
  const sparks: THREE.Vector3[] = [];
  if (torch.lit && torch.equipped && !driving) sparks.push(torchFirePosition(handTorch.fire, renderOrigin));
  postLights.forEach((light, index) => {
    const post = visiblePostLights[index];
    if (!post || !post.lit) { light.intensity = 0; return; }
    light.position.set(post.x, post.y + 1.95, post.z);
    light.intensity = fireLightIntensity(fireTime, index * 2);
    sparks.push(light.position);
  });
  fireSparks.update(sparks, fireTime, wind);
  if (!driving && !buildMode) {
    updateGatherHint(dt);
    const post = nearestPost();
    const closestDoor = structures.filter(piece => piece.kind === 'door' && Math.abs(piece.y - player.position.y) < 2)
      .reduce((distance, piece) => Math.min(distance, planetDistanceMeters(piece, player.position)), Infinity);
    const closestSmelter = buildingRecords.filter(record => record.kind === 'smelter')
      .reduce((distance, record) => Math.min(distance, planetDistanceMeters(record, player.position)), Infinity);
    const nearby = post && post.distance < Math.min(closestDoor, closestSmelter, worldDistance(vehicle.position, player.position), worldDistance(npc.position, player.position));
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
  previousAnimalPositions.delete(id);
}

function resetWildlife(states: AnimalState[]) {
  for (const id of [...animalModels.keys()]) removeAnimal(id);
  wildlife = states.map(animal => ({ ...animal }));
  for (const animal of wildlife) {
    const model = createAnimal(animal.species, Number(animal.id.split('-')[1]));
    attachAuthoredAnimal(model, animal.species, Number(animal.id.split('-')[1]));
    model.rotation.y = animal.heading;
    animalModels.set(animal.id, model);
    scene.add(model);
  }
  updateAnimalModels(performance.now(), 0);
}

function updateAnimalModels(time: number, dt: number) {
  const live = new Set(wildlife.map(animal => animal.id));
  for (const id of animalModels.keys()) if (!live.has(id)) removeAnimal(id);
  for (const animal of wildlife) {
    const model = animalModels.get(animal.id);
    if (!model) continue;
    const flying = animal.species === 'bird' && animal.behavior === 'fly';
    let flightHeight = 0;
    if (animal.species === 'bird') {
      const previous = typeof model.userData.flightHeight === 'number' ? model.userData.flightHeight : flying ? 2.5 : 0;
      flightHeight = updateBirdFlightHeight(previous, flying, dt);
      model.userData.flightHeight = flightHeight;
    }
    const flightMotion = animal.species === 'bird' && (flying || flightHeight > 0.2);
    const bob = Math.sin(time * 0.002) * 0.3 * Math.min(1, flightHeight / 2.5);
    model.position.set(animal.x, world.heightAt(animal.x, animal.z) + flightHeight + bob, animal.z);
    model.rotation.y = dampAngle(model.rotation.y, animal.heading, 8, dt);
    let authored = false;
    if (model.userData.authoredAnimal) {
      const current = animal.geographic ?? planetPositionToGeographic(animal.x, animal.z);
      const previous = previousAnimalPositions.get(animal.id);
      const speed = previous && dt > 0 ? geographicDistanceMeters(previous, current) / dt : 0;
      previousAnimalPositions.set(animal.id, current);
      authored = updateAuthoredAnimal(model, dt, speed, flightMotion ? 'fly' : animal.behavior,
        geographicDistanceMeters(playerGeographic, current) < 50);
    }
    if (!authored) animateAnimal(model, animal.species, animal.species === 'bird' ? flightMotion : animal.behavior !== 'rest', time);
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
        new THREE.Vector3(), new THREE.Vector3(neighbor.x - a.x, b.y - a.y, neighbor.z - a.z),
      ]);
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: '#e9c271' }));
      line.position.set(a.x, a.y + 0.95, a.z);
      powerLines.add(line);
    }
  }
}

function updateNpc(dt: number) {
  npc.userData.workTimer = Math.max(0, ((npc.userData.workTimer as number | undefined) ?? 0) - dt);
  const storage = buildings.find(b => b.userData.building === 'storage');
  const threat = enemies.find(enemy => worldDistance(enemy.position, npc.position) < 6);
  const activity = chooseNpcActivity(npcState, Boolean(storage), Boolean(threat));
  let destination: THREE.Vector3 | undefined;
  if (activity === 'gathering' && npcState.job !== 'idle') {
    const target = world.findNearest(npc.position.x, npc.position.z, 40, npcState.job);
    if (target) {
      destination = world.resourcePosition(target);
      if (geographicDistanceMeters(npcGeographic,
        planetPositionToGeographic(destination.x, destination.z)) < 1.3) {
        destination = undefined;
        if (npc.userData.workTimer === 0) {
          if (npcState.job === 'wood') {
            const result = world.workTree(target, true, npc.position);
            if (result && result.kind !== 'falling' && result.kind !== 'needs-saw'
              && result.kind !== 'out-of-reach' && result.kind !== 'limit') {
              npc.userData.workTimer = 0.75;
              const target = nearestPlanetPosition(result.position.x, result.position.z, npc.position.x, npc.position.z);
              if (Math.hypot(target.x - npc.position.x, target.z - npc.position.z) > 0.01) {
                npc.rotation.y = Math.atan2(target.x - npc.position.x, target.z - npc.position.z);
              }
              if (result.kind !== 'collected') npc.userData.sawTarget = result.position.clone();
              if (result.kind === 'collected') {
                npcState.carrying = 'wood';
                npcState.carryingAmount = result.amount;
              }
              void saveGame(false);
            }
          } else {
            const found = world.gatherNearest(npc.position.x, npc.position.z, 1.4, 'stone');
            if (found) {
              npcState.carrying = 'stone';
              npcState.carryingAmount = 2;
              npc.userData.workTimer = 0.6;
              void saveGame(false);
            }
          }
        }
      }
    }
  } else if (activity === 'delivering' && storage) {
    destination = storage.position;
    if (geographicDistanceMeters(npcGeographic,
      planetPositionToGeographic(storage.position.x, storage.position.z)) < 2) {
      if (npcState.carrying) resources[npcState.carrying] += npcState.carryingAmount ?? (npcState.carrying === 'wood' ? 3 : 2);
      npcState.carrying = null;
      npcState.carryingAmount = undefined;
      destination = undefined;
      updateResources();
      updateObjective();
      void saveGame(false);
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
    const destinationPosition = { x: destination.x, z: destination.z };
    const destinationGeographic = planetPositionToGeographic(destinationPosition.x, destinationPosition.z);
    const bearing = THREE.MathUtils.radToDeg(geographicBearing(npcGeographic, destinationGeographic));
    const remaining = geographicDistanceMeters(npcGeographic, destinationGeographic);
    const next = runtimeFrame.move(npc.position, npcGeographic, bearing, Math.min(remaining, 1.6 * dt));
    const blocker = buildingRecords.find(b => geographicDistanceMeters(next.geographic,
      planetPositionToGeographic(b.x, b.z)) < 1.65
      && geographicDistanceMeters(destinationGeographic, planetPositionToGeographic(b.x, b.z)) > 2);
    if (blocker) {
      const offset = planetOffset(blocker, npc.position);
      const tangentBearing = Math.atan2(-offset.z, offset.x) * 180 / Math.PI;
      const tangentStep = runtimeFrame.move(npc.position, npcGeographic, tangentBearing, dt * 1.6);
      npc.position.x = tangentStep.x;
      npc.position.z = tangentStep.z;
      npcGeographic = planetPositionToGeographic(npc.position.x, npc.position.z, npc.position.y);
    } else if (!structures.some(piece => pieceBlocks(piece, next.x, npc.position.y, next.z))) {
      npc.position.x = next.x;
      npc.position.z = next.z;
      npcGeographic = next.geographic;
    }
    npc.rotation.y = dampAngle(npc.rotation.y, THREE.MathUtils.degToRad(bearing), 8, dt);
  }
  npc.position.y = world.heightAt(npc.position.x, npc.position.z);
  npcGeographic = { ...npcGeographic, altitude: npc.position.y };
  animateCharacter(npc, dt, destination ? 1 : 0, false, npc.userData.workTimer > 0
    ? (npcState.job === 'stone' ? 'mine' : npcState.carrying ? 'gather' : 'saw') : undefined,
  Boolean(npcState.carrying) && npc.userData.workTimer === 0, npc.userData.workTimer as number);
}

function animateCharacter(character: THREE.Group, dt: number, movement: number, running = false, action?: typeof animationAction, carrying = false, actionTime = animationActionTime) {
  const attackTool = character === player ? selectedWeapon === 'axe' ? 'chop' : selectedWeapon === 'stick' ? 'stick'
    : selectedWeapon === 'saw' ? 'saw' : null : character.userData.enemy ? 'weapon' : null;
  const sawTarget: unknown = character.userData.sawTarget;
  if (updateAuthoredCharacter(character, dt, movement, running, action, carrying, attackTool,
    sawTarget instanceof THREE.Vector3 ? sawTarget : undefined)) return;
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
    const actionSwing = action === 'hurt' ? -0.5 : action === 'saw'
      ? -1.05 + Math.sin((0.75 - actionTime) * 15) * 0.3
      : action ? -1.5 * Math.sin((1 - actionTime / 0.6) * Math.PI) : swing * 0.65;
    const enemyPose = character.userData.enemyKind === 'undead' || character.userData.enemyKind === 'nightcreature' ? -0.55 : 0;
    armL.rotation.x = THREE.MathUtils.lerp(armL.rotation.x, carrying ? -1.1 : enemyPose - swing * 0.65, blend);
    armR.rotation.x = THREE.MathUtils.lerp(armR.rotation.x, carrying ? -1.1 : actionSwing, blend);
  }
  if (elbowL && elbowR) {
    elbowL.rotation.x = THREE.MathUtils.lerp(elbowL.rotation.x, carrying ? -0.5 : -0.15, blend);
    elbowR.rotation.x = THREE.MathUtils.lerp(elbowR.rotation.x, carrying ? -0.5 : action ? -0.4 : -0.15, blend);
  }
  if (!character.userData.enemy) {
    for (const kind of ['chop', 'mine', 'weapon', 'stick', 'saw'] as const) {
      const tool = character.getObjectByName(`tool-${kind}`);
      if (tool) tool.visible = kind === visibleCharacterTool(action, attackTool);
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
      const wz = player.position.z - y;
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
  ctx.save();
  ctx.translate(map.width / 2, map.height / 2);
  const heading = driving ? vehicle.rotation.y + Math.PI / 2 : player.rotation.y;
  ctx.rotate(heading);
  ctx.beginPath();
  ctx.moveTo(0, -15);
  ctx.lineTo(-5, -4);
  ctx.lineTo(5, -4);
  ctx.closePath();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#263d35';
  ctx.stroke();
  ctx.fill();
  ctx.restore();
  buildings.forEach(building => {
    ctx.fillStyle = '#bf6c45';
    ctx.fillRect(map.width / 2 + (building.position.x - player.position.x) * scale, map.height / 2 - (building.position.z - player.position.z) * scale, 5, 5);
  });
  enemies.forEach(enemy => {
    ctx.fillStyle = '#b84d55';
    ctx.fillRect(map.width / 2 + (enemy.position.x - player.position.x) * scale, map.height / 2 - (enemy.position.z - player.position.z) * scale, 4, 4);
  });
  wildlife.forEach(animal => {
    ctx.fillStyle = animal.species === 'wolf' ? '#9a5962' : '#f2e4a5';
    ctx.fillRect(map.width / 2 + (animal.x - player.position.x) * scale, map.height / 2 - (animal.z - player.position.z) * scale, 3, 3);
  });
  ctx.font = 'bold 12px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#263d35';
  ctx.strokeText('N', map.width / 2, 20);
  ctx.fillStyle = '#f3f5e8';
  ctx.fillText('N', map.width / 2, 20);
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

let saveQueue: Promise<void> = Promise.resolve();

async function saveGame(notify: boolean) {
  if (!gameStarted) return false;
  try {
    const snapshot = structuredClone({
      version: 13,
      seed,
      outfit,
      appearance: { ...appearance },
      playerName: characterName,
      npcAppearanceSeed,
      wildlife: wildlife.map(animal => ({ ...animal })),
      player: { x: player.position.x, y: player.position.y, z: player.position.z },
      planetPositions: {
        player: { ...playerGeographic, altitude: world.heightAt(player.position.x, player.position.z) },
        vehicle: { ...vehicleGeographic, altitude: world.heightAt(vehicle.position.x, vehicle.position.z) },
        npc: { ...npcGeographic, altitude: world.heightAt(npc.position.x, npc.position.z) },
      },
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
      atlas: {
        explored: [...atlasState.explored],
        markers: atlasState.markers.map(marker => ({ ...marker })),
        zoom: atlasState.zoom,
        centerLatitude: atlasState.centerLatitude,
        centerLongitude: atlasState.centerLongitude,
        level: atlasState.level,
      },
      stones,
      selectedWeapon,
      axeRequiresCrafting: true,
      backpackEquipped,
      onboarding: { ...onboarding },
      depleted: world.depletedSnapshot(),
      treeHarvest: world.treeHarvestSnapshot(),
      minerals: { ...mineralInventory },
      mining: world.miningSnapshot(),
      ingots: { ...ingots },
      ironPickaxe,
      npcState: { ...npcState },
      health,
      tools: [...tools],
      ...(torch.crafted ? { torch: { ...torch } } : {}),
      calendar: { minute: gameMinutes, day, speed: gameSpeed },
      vehicle: { x: vehicle.position.x, z: vehicle.position.z, yaw: vehicle.rotation.y },
    });
    if (!isSaveData(snapshot)) throw new Error('Invalid world state; the previous save was retained');
    const pending = saveQueue.then(async () => {
      const db = await openDatabase();
      try {
        const tx = db.transaction('saves', 'readwrite');
        tx.objectStore('saves').put(snapshot, 'primary');
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error ?? new Error('Save transaction aborted'));
        });
      } finally {
        db.close();
      }
    });
    saveQueue = pending.then(() => undefined, () => undefined);
    await pending;
    if (notify) toast('World saved');
    return true;
  } catch (error) {
    console.error('Could not save world', error);
    toast('Could not save world. Check browser storage and console.');
    return false;
  }
}

async function loadGame() {
  try {
    await saveQueue;
    const saved = await readSaveRecord('primary');
    if (!saved) { toast('No saved world found'); return false; }
    if (!isSaveData(saved)) { toast('Save is invalid or from an unsupported version'); return false; }
      if (!saved.axeRequiresCrafting) {
        const backupDb = await openDatabase();
        try {
          const backupTx = backupDb.transaction('saves', 'readwrite');
          const store = backupTx.objectStore('saves');
          const existing = store.get('pre-equipment-backup');
          existing.onsuccess = () => { if (!existing.result) store.put(saved, 'pre-equipment-backup'); };
          await new Promise<void>((resolve, reject) => {
            backupTx.oncomplete = () => resolve();
            backupTx.onerror = () => reject(backupTx.error);
            backupTx.onabort = () => reject(backupTx.error ?? new Error('Equipment backup transaction aborted'));
          });
        } finally {
          backupDb.close();
        }
      }
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
      if (saved.version < 11) {
        const backupDb = await openDatabase();
        const backupTx = backupDb.transaction('saves', 'readwrite');
        const store = backupTx.objectStore('saves');
        const existing = store.get('pre-planet-engine-backup');
        existing.onsuccess = () => { if (!existing.result) store.put(saved, 'pre-planet-engine-backup'); };
        await new Promise<void>((resolve, reject) => {
          backupTx.oncomplete = () => resolve();
          backupTx.onerror = () => reject(backupTx.error);
          backupTx.onabort = () => reject(backupTx.error ?? new Error('Planet engine backup transaction aborted'));
        });
        backupDb.close();
      }
      if (saved.version < 12) {
        const backupDb = await openDatabase();
        const backupTx = backupDb.transaction('saves', 'readwrite');
        const store = backupTx.objectStore('saves');
        const existing = store.get('pre-geographic-movement-backup');
        existing.onsuccess = () => { if (!existing.result) store.put(saved, 'pre-geographic-movement-backup'); };
        await new Promise<void>((resolve, reject) => {
          backupTx.oncomplete = () => resolve();
          backupTx.onerror = () => reject(backupTx.error);
          backupTx.onabort = () => reject(backupTx.error ?? new Error('Geographic movement backup transaction aborted'));
        });
        backupDb.close();
      }
      if (saved.version < 13) {
        const backupDb = await openDatabase();
        const backupTx = backupDb.transaction('saves', 'readwrite');
        const store = backupTx.objectStore('saves');
        const existing = store.get('pre-timber-backup');
        existing.onsuccess = () => { if (!existing.result) store.put(saved, 'pre-timber-backup'); };
        await new Promise<void>((resolve, reject) => {
          backupTx.oncomplete = () => resolve();
          backupTx.onerror = () => reject(backupTx.error);
          backupTx.onabort = () => reject(backupTx.error ?? new Error('Timber backup transaction aborted'));
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
      backpackEquipped = save.backpackEquipped ?? true;
      setAuthoredBackpackVisible(player, backpackEquipped);
      onboarding = save.onboarding ? { ...save.onboarding } : { mode: 'free', gathered: false, openedPack: false };
      if (save.wildlife) resetWildlife(save.wildlife);
      Object.assign(resources, save.resources);
      Object.assign(mineralInventory, save.version >= 8 ? save.minerals : emptyMinerals());
      Object.assign(ingots, { iron: save.version >= 8 ? save.ingots?.iron ?? 0 : 0,
        copper: save.version >= 8 ? save.ingots?.copper ?? 0 : 0, glass: save.version >= 9 ? save.ingots?.glass ?? 0 : 0 });
      ironPickaxe = save.version >= 8 && Boolean(save.ironPickaxe);
      if (save.npcState) Object.assign(npcState, save.npcState);
      if (npcState.carrying && npcState.carryingAmount === undefined) {
        npcState.carryingAmount = npcState.carrying === 'wood' ? 3 : 2;
      }
      health = save.health ?? 100;
      tools.push(...toolsFromSave(save));
      Object.assign(torch, save.torch ?? { crafted: false, equipped: false, lit: false });
      stones = save.stones ?? 0;
      selectedWeapon = save.selectedWeapon ?? 'fists';
      playerGeographic = save.version >= 12 && save.planetPositions
        ? { ...save.planetPositions.player }
        : planetPositionToGeographic(save.player.x, save.player.z, save.player.y ?? 0);
      const savedPlayerPosition = projectGeographicPosition(playerGeographic, new THREE.Vector3(save.player.x, 0, save.player.z));
      vehicleGeographic = save.version >= 12 && save.planetPositions
        ? { ...save.planetPositions.vehicle }
        : planetPositionToGeographic(save.vehicle.x, save.vehicle.z);
      const savedVehiclePosition = projectGeographicPosition(vehicleGeographic, new THREE.Vector3(save.vehicle.x, 0, save.vehicle.z));
      npcGeographic = save.version >= 12 && save.planetPositions?.npc
        ? { ...save.planetPositions.npc }
        : planetPositionToGeographic(save.npc.x, save.npc.z);
      const savedNpcPosition = projectGeographicPosition(npcGeographic, new THREE.Vector3(save.npc.x, 0, save.npc.z));
      world.updateChunks(savedPlayerPosition.x, savedPlayerPosition.z, true);
      world.restore(save.terrain);
      world.restoreDepleted(save.depleted ?? []);
      world.restoreTreeHarvest(save.version >= 13 ? save.treeHarvest ?? {} : {});
      world.restoreMining(save.version >= 8 ? (save.mining ?? {}) : {});
      player.position.set(savedPlayerPosition.x, world.heightAt(savedPlayerPosition.x, savedPlayerPosition.z), savedPlayerPosition.z);
      npc.position.set(savedNpcPosition.x, world.heightAt(savedNpcPosition.x, savedNpcPosition.z), savedNpcPosition.z);
      vehicle.position.set(savedVehiclePosition.x, world.heightAt(savedVehiclePosition.x, savedVehiclePosition.z), savedVehiclePosition.z);
      vehicle.rotation.y = THREE.MathUtils.euclideanModulo((save.vehicle.yaw ?? 0) + Math.PI, Math.PI * 2) - Math.PI;
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
      structureCollisionDirty = true;
      world.setFloorCover(structures);
      roads.splice(0, roads.length, ...(save.roads ?? []).map(road => ({ ...road })));
      surfacePaint.splice(0, surfacePaint.length, ...(save.paint ?? []).map(paint => ({ ...paint, strokes: paint.strokes.map(stroke => ({ ...stroke })) })));
      if (save.atlas) {
        atlasState.explored.splice(0, atlasState.explored.length, ...save.atlas.explored);
        atlasState.markers.splice(0, atlasState.markers.length, ...save.atlas.markers.map(marker => ({ ...marker })));
        atlasState.zoom = save.atlas.zoom;
        atlasState.centerLatitude = save.atlas.centerLatitude;
        atlasState.centerLongitude = save.atlas.centerLongitude;
        atlasState.level = save.atlas.level;
      }
      refreshRoads();
      refreshPaintMarkers();
      world.setDepositExclusions([
        ...buildingRecords.map(record => ({ x: record.x, z: record.z, radius: buildingRadius(record.kind) + 0.45 })),
        ...structures.map(piece => ({ x: piece.x, z: piece.z, radius: 1 })),
      ]);
      autoRoof = save.autoRoof ?? true;
      roofStyle = save.roofStyle ?? 'flat'; // Older saves omit the flat selection.
      roofAxis = save.roofAxis ?? 'auto';
      for (const request of save.pendingRoofs ?? []) pendingRoofs.set(roofKey(request), { ...request });
      (document.querySelector('#autoRoof') as HTMLInputElement).checked = autoRoof;
      (document.querySelector('#roofStyle') as HTMLSelectElement).value = roofStyle;
      (document.querySelector('#roofAxis') as HTMLSelectElement).value = roofAxis;
      constructionRenderer.refresh(structures, surfacePaint);
      if (save.player.y !== undefined) {
        player.position.y = floorSurface(structures, player.position.x, player.position.z, save.player.y, world.heightAt(player.position.x, player.position.z));
      }
      vehicle.position.y = roverSurfaceAt(vehicle.position.x, vehicle.position.z, vehicle.position.y);
      vehicleGeographic.altitude = vehicle.position.y;
      roverSteeringYaw = 0;
      updateRoverVisual(0, 0, 0, true);
      updatePowerLines();
      rebaseWorld();
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
