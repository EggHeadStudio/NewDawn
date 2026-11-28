import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { CharacterAppearance } from './appearance';

type Action = 'chop' | 'mine' | 'build' | 'gather' | 'attack' | 'hurt' | 'saw' | undefined;
type HeldTool = 'chop' | 'mine' | 'weapon' | 'stick' | 'saw';
type Avatar = {
  disposed: boolean;
  mixers: THREE.AnimationMixer[];
  actions: Map<string, THREE.AnimationAction[]>;
  current?: string;
  materials: Set<THREE.Material>;
  skeletons: Set<THREE.Skeleton>;
  tools: Map<string, THREE.Object3D>;
  backpackVisible: boolean;
  backpack?: THREE.Object3D;
  sawRig?: { upper: THREE.Object3D; lower: THREE.Object3D; hand: THREE.Object3D; rest: THREE.Quaternion };
  sawTime: number;
};

const loader = new GLTFLoader();
const cache = new Map<string, Promise<GLTF>>();
const assetBase = `${import.meta.env.BASE_URL}assets/characters/quaternius/`;
let backpackAsset: Promise<GLTF> | undefined;

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

function loadBackpack() {
  if (!backpackAsset) {
    backpackAsset = loader.loadAsync(`${import.meta.env.BASE_URL}assets/characters/equipment/hiking-backpack.glb`)
      .catch(error => {
        backpackAsset = undefined;
        throw error;
      });
  }
  return backpackAsset;
}

export function visibleCharacterTool(action: Action, selected: HeldTool | null): HeldTool | null {
  if (action === 'chop' || action === 'mine' || action === 'saw') return action;
  if (action === 'build') return 'chop';
  return selected;
}

export function authoredAnimation(movement: number, running: boolean, action: Action, carrying: boolean) {
  if (action === 'hurt') return 'Hit_Chest';
  if (action === 'saw') return 'Fixing_Kneeling';
  if (action === 'attack' || action === 'chop' || action === 'mine') return 'Sword_Attack';
  if (action === 'build' || action === 'gather') return 'PickUp_Table';
  if (carrying) return movement > 0.1 ? 'Walk_Loop' : 'Idle_Loop';
  return movement > 0.1 ? (running ? 'Sprint_Loop' : 'Walk_Loop') : 'Idle_Loop';
}

export function poseSawArm(upper: THREE.Object3D, lower: THREE.Object3D, hand: THREE.Object3D,
  saw: THREE.Object3D, target: THREE.Vector3, stroke: number) {
  const shoulder = upper.getWorldPosition(new THREE.Vector3());
  const elbow = lower.getWorldPosition(new THREE.Vector3());
  const wrist = hand.getWorldPosition(new THREE.Vector3());
  const upperLength = shoulder.distanceTo(elbow);
  const lowerLength = elbow.distanceTo(wrist);
  const towardCut = target.clone().sub(shoulder);
  if (upperLength < 0.001 || lowerLength < 0.001 || towardCut.lengthSq() < 0.000001) return;
  const desired = target.clone().addScaledVector(towardCut.normalize(), -(0.36 + stroke * 0.07));
  const reach = desired.clone().sub(shoulder);
  const distance = Math.min(upperLength + lowerLength - 0.001, Math.max(Math.abs(upperLength - lowerLength) + 0.001, reach.length()));
  if (reach.lengthSq() < 0.000001) return;
  const direction = reach.normalize();
  const along = (upperLength ** 2 - lowerLength ** 2 + distance ** 2) / (2 * distance);
  const bend = elbow.clone().sub(shoulder);
  bend.addScaledVector(direction, -bend.dot(direction));
  if (bend.lengthSq() < 0.000001) {
    bend.set(0, 1, 0).addScaledVector(direction, -direction.y);
    if (bend.lengthSq() < 0.000001) bend.set(1, 0, 0);
  }
  const elbowGoal = shoulder.clone().addScaledVector(direction, along)
    .addScaledVector(bend.normalize(), Math.sqrt(Math.max(0, upperLength ** 2 - along ** 2)));
  const handGoal = shoulder.clone().addScaledVector(direction, distance);
  const align = (bone: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3) => {
    const worldRotation = bone.getWorldQuaternion(new THREE.Quaternion());
    const parentRotation = bone.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion();
    const turn = new THREE.Quaternion().setFromUnitVectors(from.normalize(), to.normalize());
    bone.quaternion.copy(parentRotation.invert().multiply(turn).multiply(worldRotation));
    bone.updateWorldMatrix(false, true);
  };
  align(upper, elbow.clone().sub(shoulder), elbowGoal.sub(shoulder));
  const movedElbow = lower.getWorldPosition(new THREE.Vector3());
  const movedWrist = hand.getWorldPosition(new THREE.Vector3());
  align(lower, movedWrist.sub(movedElbow), handGoal.sub(movedElbow));

  const bladeDirection = target.clone().sub(hand.getWorldPosition(new THREE.Vector3()));
  if (bladeDirection.lengthSq() < 0.000001) return;
  bladeDirection.normalize();
  const bladeSide = new THREE.Vector3(0, 1, 0).addScaledVector(bladeDirection, -bladeDirection.y);
  if (bladeSide.lengthSq() < 0.000001) bladeSide.set(1, 0, 0);
  bladeSide.normalize();
  const bladeNormal = bladeSide.clone().cross(bladeDirection).normalize();
  const bladeRotation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(bladeSide, bladeDirection, bladeNormal));
  saw.quaternion.copy(hand.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(bladeRotation));
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

export function attachAuthoredCharacter(root: THREE.Group, appearance: CharacterAppearance, onError: (error: unknown) => void,
  options: { backpack?: boolean; highBun?: boolean; onBackpackError?: (error: unknown) => void } = {}) {
  const avatar: Avatar = { disposed: false, mixers: [], actions: new Map(), materials: new Set(), skeletons: new Set(),
    tools: new Map(), backpackVisible: true, sawTime: 0 };
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
    const needed = ['Idle_Loop', 'Walk_Loop', 'Sprint_Loop', 'Sword_Attack', 'Hit_Chest', 'PickUp_Table', 'Fixing_Kneeling'];
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
        if (options.highBun) {
          const head = model.getObjectByName('Head');
          if (!head) throw new Error('Character outfit is missing the head bone');
          model.updateMatrixWorld(true);
          const bun = createHighBun();
          bun.position.copy(head.worldToLocal(model.localToWorld(new THREE.Vector3(0, 1.79, -0.08))));
          bun.quaternion.copy(head.getWorldQuaternion(new THREE.Quaternion()).invert()
            .multiply(model.getWorldQuaternion(new THREE.Quaternion())));
          head.add(bun);
        }
        if (options.backpack) {
          const back = model.getObjectByName('spine_02');
          const reportError = options.onBackpackError ?? (error => console.error('Could not load backpack art', error));
          if (!back) reportError(new Error('Character outfit is missing the backpack attachment bone'));
          else void loadBackpack().then(asset => {
            if (avatar.disposed) return;
            const backpack = asset.scene.clone(true);
            backpack.name = 'survivor-backpack';
            backpack.position.set(0, 0.13, -0.32);
            backpack.scale.setScalar(0.35);
            backpack.visible = avatar.backpackVisible;
            backpack.traverse(object => {
              object.userData.authoredShared = true;
              if (object instanceof THREE.Mesh) {
                object.castShadow = true;
                object.receiveShadow = true;
              }
            });
            avatar.backpack = backpack;
            back.add(backpack);
          }).catch(error => { if (!avatar.disposed) reportError(error); });
        }
        for (const kind of ['chop', 'mine', 'weapon', 'stick', 'saw']) {
          const fallback = root.getObjectByName(`tool-${kind}`);
          if (!fallback) continue;
          const tool = fallback.clone();
          tool.traverse(object => { object.userData.authoredShared = true; });
          tool.position.set(0, 0, 0);
          if (kind === 'mine') {
            tool.position.y = 0.06;
            // The authored hand's +Y points towards the fingers, not up the shaft.
            tool.rotation.x = Math.PI - 0.5;
          }
          tool.visible = false;
          hand.add(tool);
          avatar.tools.set(kind, tool);
        }
        const upper = model.getObjectByName('upperarm_r');
        const lower = model.getObjectByName('lowerarm_r');
        const saw = avatar.tools.get('saw');
        if (upper && lower && saw) avatar.sawRig = { upper, lower, hand, rest: saw.quaternion.clone() };
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

export function createHighBun() {
  const bun = new THREE.Group();
  bun.name = 'taru-high-bun';
  const hair = new THREE.MeshStandardMaterial({ color: '#563a2c', roughness: 0.9 });
  const main = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 10), hair);
  main.scale.set(1, 0.85, 0.85);
  main.castShadow = true;
  bun.add(main);
  return bun;
}

export function setAuthoredBackpackVisible(root: THREE.Group, visible: boolean) {
  const avatar = root.userData.authoredAvatar as Avatar | undefined;
  if (!avatar || avatar.disposed) return;
  avatar.backpackVisible = visible;
  if (avatar.backpack) avatar.backpack.visible = visible;
}

export function updateAuthoredCharacter(root: THREE.Group, dt: number, movement: number, running: boolean, action: Action, carrying: boolean, attackTool: HeldTool | null = null, sawTarget?: THREE.Vector3) {
  const avatar = root.userData.authoredAvatar as Avatar | undefined;
  if (!avatar || avatar.disposed || !avatar.mixers.length) return false;
  const name = authoredAnimation(movement, running, action, carrying);
  for (const [kind, tool] of avatar.tools) {
    tool.visible = root.userData.enemy ? kind === 'weapon'
      : kind === visibleCharacterTool(action, attackTool);
  }
  if (name !== avatar.current) {
    if (avatar.current) avatar.actions.get(avatar.current)?.forEach(previous => previous.fadeOut(0.16));
    avatar.actions.get(name)?.forEach(next => next.reset().setEffectiveTimeScale(name === 'Fixing_Kneeling' ? 2 : 1)
      .setEffectiveWeight(1).fadeIn(0.16).play());
    avatar.current = name;
  }
  avatar.mixers.forEach(mixer => mixer.update(dt));
  const saw = avatar.tools.get('saw');
  if (action === 'saw' && sawTarget && saw && avatar.sawRig) {
    avatar.sawTime += dt;
    const stroke = Math.sin(avatar.sawTime * 15);
    const target = root.parent ? root.parent.localToWorld(sawTarget.clone()) : sawTarget.clone();
    poseSawArm(avatar.sawRig.upper, avatar.sawRig.lower, avatar.sawRig.hand, saw, target, stroke);
  } else {
    avatar.sawTime = 0;
    if (saw && avatar.sawRig) saw.quaternion.copy(avatar.sawRig.rest);
  }
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
