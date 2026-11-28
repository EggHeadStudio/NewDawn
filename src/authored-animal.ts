import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { AnimalBehavior, Species } from './wildlife';

type AuthoredSpecies = 'sheep' | 'rabbit' | 'cow' | 'bird' | 'squirrel' | 'wolf' | 'fox' | 'deer' | 'moose' | 'bear' | 'reindeer';
type RestAction = 'idle' | 'graze' | 'peck' | 'sniff';
type AnimalArt = {
  disposed: boolean;
  mixer?: THREE.AnimationMixer;
  visual?: THREE.Object3D;
  actions: Map<string, THREE.AnimationAction>;
  skeletons: Set<THREE.Skeleton>;
  current?: string;
  species: AuthoredSpecies;
  rest: RestAction;
};

const sources = {
  sheep: { file: 'sheep.glb', clips: ['idle', 'graze', 'walk', 'trot'] },
  rabbit: { file: 'mountain-hare.glb', clips: ['idle', 'hop'] },
  cow: { file: 'dairy-cow.glb', clips: ['idle', 'graze', 'walk', 'trot'] },
  bird: { file: 'hooded-crow.glb', clips: ['idle', 'peck', 'fly'] },
  squirrel: { file: 'red-squirrel.glb', clips: ['idle', 'sniff', 'walk', 'run'] },
  wolf: { file: 'gray-wolf.glb', clips: ['idle', 'walk', 'trot'] },
  fox: { file: 'red-fox.glb', clips: ['idle', 'walk', 'trot'] },
  deer: { file: 'roe-deer.glb', clips: ['idle', 'graze', 'walk', 'trot'] },
  moose: { file: 'moose.glb', clips: ['idle', 'graze', 'walk', 'trot'] },
  bear: { file: 'grizzly-bear.glb', clips: ['idle', 'walk', 'trot'] },
  reindeer: { file: 'reindeer.glb', clips: ['idle', 'graze', 'walk', 'trot'] },
} as const;
const loader = new GLTFLoader();
const prototypes = new Map<AuthoredSpecies, Promise<GLTF>>();

function sameSkeleton(a: THREE.Skeleton, b: THREE.Skeleton) {
  return a.bones.length === b.bones.length && a.boneInverses.length === b.boneInverses.length
    && a.bones.every((bone, index) => bone === b.bones[index])
    && a.boneInverses.every((inverse, index) => inverse.equals(b.boneInverses[index]));
}

function loadAnimal(species: AuthoredSpecies) {
  let pending = prototypes.get(species);
  if (!pending) {
    pending = loader.loadAsync(`${import.meta.env.BASE_URL}assets/animals/${sources[species].file}`).catch(error => {
      prototypes.delete(species);
      throw error;
    });
    prototypes.set(species, pending);
  }
  return pending;
}

export function attachAuthoredAnimal(root: THREE.Group, species: Species, variant: number,
  onError: (error: unknown) => void = error => console.error(`Could not load authored ${species}`, error)) {
  if (species !== 'sheep' && species !== 'rabbit' && species !== 'cow' && species !== 'bird'
    && species !== 'squirrel' && species !== 'wolf' && species !== 'fox' && species !== 'deer'
    && species !== 'moose' && species !== 'bear' && species !== 'reindeer') return;
  const animal: AnimalArt = { disposed: false, actions: new Map(), skeletons: new Set(), species,
    rest: variant % 2 ? species === 'bird' ? 'peck' : species === 'rabbit' || species === 'wolf' || species === 'fox' || species === 'bear' ? 'idle'
      : species === 'squirrel' ? 'sniff' : 'graze' : 'idle' };
  root.userData.authoredAnimal = animal;
  const fallback = [...root.children];
  void loadAnimal(species).then(model => {
    if (animal.disposed) return;
    const clips = sources[species].clips.map(name => {
      const clip = model.animations.find(item => item.name === name);
      if (!clip) throw new Error(`${species} animation missing: ${name}`);
      return clip;
    });
    const visual = clone(model.scene);
    visual.name = 'authored-animal';
    visual.scale.multiplyScalar(1 / root.scale.x);
    visual.traverse(object => {
      object.userData.animalShared = true;
      if (object instanceof THREE.SkinnedMesh) {
        const shared = [...animal.skeletons].find(skeleton => sameSkeleton(skeleton, object.skeleton));
        if (shared) {
          object.skeleton.dispose();
          object.skeleton = shared;
        } else animal.skeletons.add(object.skeleton);
      }
      if (object instanceof THREE.Mesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
    const mixer = new THREE.AnimationMixer(visual);
    clips.forEach(clip => animal.actions.set(clip.name, mixer.clipAction(clip)));
    animal.mixer = mixer;
    animal.visual = visual;
    root.add(visual);
    fallback.forEach(object => { object.visible = false; });
  }).catch(error => { if (!animal.disposed) onError(error); });
}

/** A blocked fleeing/chasing animal should not start grazing merely because its speed is zero. */
export function authoredAnimalAction(species: AuthoredSpecies, speed: number, behavior: AnimalBehavior, rest: RestAction) {
  if (species === 'bird') return behavior === 'fly' ? 'fly' : behavior === 'rest' && speed < 0.025 ? rest : 'idle';
  if (behavior === 'rest' && speed < 0.025) return rest;
  if (speed < 0.025) return 'idle';
  if (species === 'rabbit') return 'hop';
  if (species === 'squirrel') return speed < 2 ? 'walk' : 'run';
  return speed < 1 ? 'walk' : 'trot';
}

export function updateAuthoredAnimal(root: THREE.Group, dt: number, speed: number, behavior: AnimalBehavior, nearby: boolean) {
  const animal = root.userData.authoredAnimal as AnimalArt | undefined;
  if (!animal || animal.disposed || !animal.mixer || !animal.visual) return false;
  if (!nearby) return true;
  const name = authoredAnimalAction(animal.species, speed, behavior, animal.rest);
  const action = animal.actions.get(name);
  if (!action) throw new Error(`Missing animal animation: ${name}`);
  const playback = name === 'walk' ? speed / (animal.species === 'cow' ? 1.1 : animal.species === 'moose' ? 1.5
    : animal.species === 'squirrel' || animal.species === 'deer' || animal.species === 'reindeer' ? 1.2 : 1)
    : name === 'trot' ? speed / (animal.species === 'cow' ? 2.6 : animal.species === 'deer' ? 3
      : animal.species === 'reindeer' ? 3.2 : animal.species === 'moose' ? 4 : 2.5)
      : name === 'hop' ? speed / 4 : name === 'run' ? speed / 3.4 : 1;
  if (name !== animal.current) {
    if (animal.current) animal.actions.get(animal.current)?.fadeOut(0.16);
    action.reset().setEffectiveWeight(1).fadeIn(0.16).play();
    animal.current = name;
    animal.visual.userData.animation = name;
  }
  action.setEffectiveTimeScale(playback);
  animal.mixer.update(dt);
  return true;
}

export function disposeAuthoredAnimal(root: THREE.Object3D) {
  const animal = root.userData.authoredAnimal as AnimalArt | undefined;
  if (!animal) return;
  animal.disposed = true;
  if (animal.mixer && animal.visual) {
    animal.mixer.stopAllAction();
    animal.mixer.uncacheRoot(animal.visual);
  }
  animal.skeletons.forEach(skeleton => skeleton.dispose());
}
