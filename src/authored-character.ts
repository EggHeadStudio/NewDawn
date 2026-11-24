import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { CharacterAppearance } from './appearance';

type Action = 'chop' | 'mine' | 'build' | 'attack' | 'hurt' | undefined;
type Avatar = {
  disposed: boolean;
  mixers: THREE.AnimationMixer[];
  actions: Map<string, THREE.AnimationAction[]>;
  current?: string;
  materials: Set<THREE.Material>;
  skeletons: Set<THREE.Skeleton>;
  tools: Map<string, THREE.Object3D>;
};

const loader = new GLTFLoader();
const cache = new Map<string, Promise<GLTF>>();
const assetBase = `${import.meta.env.BASE_URL}assets/characters/quaternius/`;

function load(name: string) {
  let pending = cache.get(name);
  if (!pending) {
    pending = loader.loadAsync(`${assetBase}${name}`).catch(error => {
      cache.delete(name);
      throw error;
    });
    cache.set(name, pending);
  }
  return pending;
}

export function authoredAnimation(movement: number, running: boolean, action: Action, carrying: boolean) {
  if (action === 'hurt') return 'Hit_Chest';
  if (action === 'attack' || action === 'chop' || action === 'mine') return 'Sword_Attack';
  if (action === 'build') return 'PickUp_Table';
  if (carrying) return movement > 0.1 ? 'Walk_Loop' : 'Idle_Loop';
  return movement > 0.1 ? (running ? 'Sprint_Loop' : 'Walk_Loop') : 'Idle_Loop';
}

function headOnly(model: GLTF, feminine: boolean) {
  model.scene.traverse(object => {
    if (!(object instanceof THREE.SkinnedMesh) || !object.name.toLowerCase().includes('superhero')) return;
    const geometry = object.geometry.clone();
    const position = geometry.getAttribute('position');
    const original = geometry.index;
    if (!original) throw new Error('Character body has no triangle index');
    const indices: number[] = [];
    for (let i = 0; i < original.count; i += 3) {
      const triangle = [original.getX(i), original.getX(i + 1), original.getX(i + 2)];
      if (triangle.every(index => position.getY(index) > (feminine ? 1.49 : 1.53) && Math.abs(position.getX(index)) < 0.22)) {
        indices.push(...triangle);
      }
    }
    if (!indices.length) throw new Error('Character head geometry is empty');
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    object.geometry.dispose();
    object.geometry = geometry;
  });
  return model;
}

const preparedHeads = new Map<string, Promise<GLTF>>();
function loadHead(feminine: boolean) {
  const name = feminine ? 'Superhero_Female_FullBody.gltf' : 'Superhero_Male_FullBody.gltf';
  let pending = preparedHeads.get(name);
  if (!pending) {
    pending = load(name).then(model => headOnly(model, feminine)).catch(error => {
      preparedHeads.delete(name);
      throw error;
    });
    preparedHeads.set(name, pending);
  }
  return pending;
}

export function attachAuthoredCharacter(root: THREE.Group, appearance: CharacterAppearance, onError: (error: unknown) => void) {
  const avatar: Avatar = { disposed: false, mixers: [], actions: new Map(), materials: new Set(), skeletons: new Set(), tools: new Map() };
  root.userData.authoredAvatar = avatar;
  const fallbackParts = [...root.children];
  const feminine = appearance.body === 'feminine';
  const body = feminine ? 'Female' : 'Male';
  const outfit = appearance.clothing === 'fur' || appearance.clothing === 'tunic' ? 'Ranger' : 'Peasant';
  const hair = appearance.hair === 'shaved' ? undefined : appearance.hair === 'long' || appearance.hair === 'braided'
    ? 'Hair_Long' : appearance.hair === 'curly' ? 'Hair_Buns' : 'Hair_SimpleParted';
  const requests = [
    loadHead(feminine),
    load(`${body}_${outfit}.gltf`),
    load('UAL1_Standard.glb'),
    ...(hair ? [load(`${hair}.gltf`)] : []),
    ...(appearance.facialHair !== 'none' ? [load('Hair_Beard.gltf')] : []),
  ];
  void Promise.all(requests).then(models => {
    if (avatar.disposed) return;
    const clips = models[2].animations;
    const needed = ['Idle_Loop', 'Walk_Loop', 'Sprint_Loop', 'Sword_Attack', 'Hit_Chest', 'PickUp_Table'];
    for (const name of needed) if (!clips.some(clip => clip.name === name)) throw new Error(`Missing animation: ${name}`);
    const group = new THREE.Group();
    group.name = 'authored-character';
    const meshModels = [models[0], models[1], ...models.slice(3)];
    const materialCopies = new Map<string, THREE.Material>();
    for (let index = 0; index < meshModels.length; index++) {
      const model = clone(meshModels[index].scene);
      model.traverse(object => {
        object.userData.authoredShared = true;
        if (index === 1 && /Head_Hood/.test(object.name)) object.visible = appearance.hat === 'hood';
        if (!(object instanceof THREE.SkinnedMesh)) return;
        avatar.skeletons.add(object.skeleton);
        object.castShadow = true;
        object.receiveShadow = true;
        const surfaces = (Array.isArray(object.material) ? object.material : [object.material]).map(surface => {
          const tint = index >= 2 || (index === 0 && /hair/i.test(surface.name))
            ? ({ dark: '#453a34', brown: '#795b49', blond: '#d8bc84', red: '#a65e42', silver: '#c4c5c0' }[appearance.hairColor])
            : /superhero|regular/i.test(surface.name)
              ? ({ light: '#ffe2d2', warm: '#e9b69e', brown: '#ba856d', deep: '#895c50' }[appearance.skin])
              : /ranger|peasant/i.test(surface.name)
                ? ({ ember: '#e0b0a2', sage: '#d1e1c4', azure: '#bed8df' }[appearance.outfit]) : undefined;
          if (!tint) return surface;
          const key = `${surface.uuid}:${tint}`;
          const existing = materialCopies.get(key);
          if (existing) return existing;
          const copy: THREE.Material = surface.clone();
          if (copy instanceof THREE.MeshStandardMaterial) copy.color.set(tint);
          materialCopies.set(key, copy);
          avatar.materials.add(copy);
          return copy;
        });
        object.material = Array.isArray(object.material) ? surfaces : surfaces[0];
      });
      if (index === 1) {
        const hand = model.getObjectByName('hand_r');
        if (!hand) throw new Error('Character outfit is missing the right hand bone');
        for (const kind of ['chop', 'mine', 'weapon']) {
          const fallback = root.getObjectByName(`tool-${kind}`);
          if (!fallback) continue;
          const tool = fallback.clone();
          tool.traverse(object => { object.userData.authoredShared = true; });
          tool.position.set(0, 0, 0);
          tool.visible = false;
          hand.add(tool);
          avatar.tools.set(kind, tool);
        }
      }
      group.add(model);
      const mixer = new THREE.AnimationMixer(model);
      avatar.mixers.push(mixer);
      for (const name of needed) {
        const clip = clips.find(item => item.name === name)!;
        const actions = avatar.actions.get(name) ?? [];
        actions.push(mixer.clipAction(clip));
        avatar.actions.set(name, actions);
      }
    }
    fallbackParts.forEach(child => { child.visible = false; });
    root.add(group);
    updateAuthoredCharacter(root, 0, 0, false, undefined, false);
  }).catch(error => {
    if (!avatar.disposed) {
      disposeAuthoredCharacter(root);
      fallbackParts.forEach(child => { child.visible = true; });
      root.getObjectByName('authored-character')?.removeFromParent();
      onError(error);
    }
  });
}

export function updateAuthoredCharacter(root: THREE.Group, dt: number, movement: number, running: boolean, action: Action, carrying: boolean) {
  const avatar = root.userData.authoredAvatar as Avatar | undefined;
  if (!avatar || avatar.disposed || !avatar.mixers.length) return false;
  const name = authoredAnimation(movement, running, action, carrying);
  for (const [kind, tool] of avatar.tools) {
    tool.visible = root.userData.enemy ? kind === 'weapon'
      : kind === (action === 'attack' ? 'weapon' : action === 'build' ? 'chop' : action);
  }
  if (name !== avatar.current) {
    if (avatar.current) avatar.actions.get(avatar.current)?.forEach(previous => previous.fadeOut(0.16));
    avatar.actions.get(name)?.forEach(next => next.reset().setEffectiveWeight(1).fadeIn(0.16).play());
    avatar.current = name;
  }
  avatar.mixers.forEach(mixer => mixer.update(dt));
  return true;
}

export function disposeAuthoredCharacter(root: THREE.Object3D) {
  const avatar = root.userData.authoredAvatar as Avatar | undefined;
  if (!avatar) return;
  avatar.disposed = true;
  avatar.mixers.forEach(mixer => { mixer.stopAllAction(); mixer.uncacheRoot(mixer.getRoot()); });
  avatar.skeletons.forEach(skeleton => skeleton.dispose());
  avatar.materials.forEach(material => material.dispose());
}
