import * as THREE from 'three';
import { defaultAppearance, type CharacterAppearance } from './appearance';
import { createCharacter } from './characters';

export type EnemyKind = 'raider' | 'undead' | 'necromancer' | 'armored' | 'nightcreature' | 'champion';

export const enemyProfiles: Record<EnemyKind, { health: number; speed: number; damage: number; reach: number; cooldown: number; ranged: boolean }> = {
  raider: { health: 3, speed: 1.45, damage: 10, reach: 1.5, cooldown: 1.8, ranged: false },
  undead: { health: 4, speed: 1.0, damage: 10, reach: 1.5, cooldown: 2.2, ranged: false },
  necromancer: { health: 3, speed: 1.05, damage: 8, reach: 8, cooldown: 3.5, ranged: true },
  armored: { health: 6, speed: 0.9, damage: 14, reach: 1.6, cooldown: 2.4, ranged: false },
  nightcreature: { health: 3, speed: 1.8, damage: 8, reach: 1.4, cooldown: 1.4, ranged: false },
  champion: { health: 9, speed: 1.1, damage: 18, reach: 1.8, cooldown: 2.5, ranged: false },
};

export function enemyIntent(kind: EnemyKind, distance: number, ready: boolean) {
  const profile = enemyProfiles[kind];
  if (distance >= 18) return { movement: 0, attack: false };
  const movement = profile.ranged ? (distance < 3.5 ? -1 : distance > 6 ? 1 : 0) : (distance > profile.reach * 0.8 ? 1 : 0);
  return { movement, attack: ready && distance <= profile.reach };
}

export function stepEnemyProjectile(position: THREE.Vector3, velocity: THREE.Vector3, remaining: number, dt: number,
  player: THREE.Vector3, blocked: (point: THREE.Vector3) => boolean) {
  position.addScaledVector(velocity, dt);
  remaining -= dt;
  const obstruction = blocked(position);
  const hit = !obstruction && position.distanceTo(player) < 0.75;
  return { remaining, hit, finished: hit || obstruction || remaining <= 0 };
}

export function chooseEnemyKind(day: number, roll: number): EnemyKind {
  const kinds: EnemyKind[] = ['raider', 'undead'];
  if (day >= 3) kinds.push('necromancer');
  if (day >= 5) kinds.push('armored');
  if (day >= 7) kinds.push('nightcreature');
  if (day >= 12 && roll > 0.9) return 'champion';
  return kinds[Math.min(kinds.length - 1, Math.floor(Math.max(0, roll) * kinds.length))];
}

function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, surface: THREE.Material,
  position: [number, number, number], name?: string) {
  const object = new THREE.Mesh(geometry, surface);
  object.position.set(...position);
  object.castShadow = true;
  if (name) object.name = name;
  parent.add(object);
  return object;
}

function colored(color: string, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.86, metalness });
}

function changeFace(root: THREE.Group, skinColor: string, eyeColor: string) {
  const face = root.getObjectByName('face');
  if (face instanceof THREE.Mesh && face.material instanceof THREE.MeshStandardMaterial) face.material.color.set(skinColor);
  for (const name of ['eyeL', 'eyeR']) {
    const eye = root.getObjectByName(name);
    if (eye instanceof THREE.Mesh && eye.material instanceof THREE.MeshStandardMaterial) {
      eye.material.color.set(eyeColor);
      eye.material.emissive.set(eyeColor);
      eye.material.emissiveIntensity = 1.2;
    }
  }
}

function horns(head: THREE.Object3D, surface: THREE.Material, size: number) {
  for (const side of [-1, 1]) {
    const horn = mesh(head, new THREE.ConeGeometry(0.055 * size, 0.38 * size, 6), surface, [side * 0.17, 0.24, -0.015]);
    horn.rotation.z = side * -0.6;
  }
}

export function createEnemy(kind: EnemyKind = 'raider') {
  const base: CharacterAppearance = {
    ...defaultAppearance('ember'), face: 'angular', hair: 'braided', facialHair: 'beard',
    clothing: 'fur', hat: 'none',
  };
  if (kind === 'raider') Object.assign(base, { hair: 'shaved', facialHair: 'none', clothing: 'tunic', hat: 'hood', outfit: 'sage' });
  if (kind === 'undead') Object.assign(base, { hair: 'shaved', facialHair: 'none', clothing: 'tunic', outfit: 'sage' });
  if (kind === 'necromancer') Object.assign(base, { hair: 'shaved', facialHair: 'none', clothing: 'tunic', hat: 'hood', outfit: 'azure' });
  if (kind === 'armored' || kind === 'champion') Object.assign(base, { hair: 'short', hat: 'helmet', clothing: 'fur', outfit: 'sage' });
  if (kind === 'nightcreature') Object.assign(base, { hair: 'shaved', facialHair: 'none', clothing: 'tunic', outfit: 'azure' });
  const root = createCharacter(base);
  root.userData.enemy = true;
  root.userData.enemyKind = kind;
  const torso = root.getObjectByName('torso')!;
  const head = root.getObjectByName('head')!;
  const armL = root.getObjectByName('armL')!;
  const armR = root.getObjectByName('armR')!;
  const elbowR = root.getObjectByName('elbowR')!;
  const iron = colored('#535a59', 0.55);
  const bone = colored('#b3b0a1');
  const dark = colored('#282d2e');

  if (kind === 'raider' || kind === 'undead' || kind === 'armored' || kind === 'champion') {
    const weapon = root.getObjectByName('tool-weapon');
    if (weapon) weapon.visible = true;
  }
  if (kind === 'raider') {
    mesh(head, new THREE.BoxGeometry(0.25, 0.13, 0.06), dark, [0, -0.10, 0.16], 'mask');
    for (const side of [-1, 1]) {
      const spike = mesh(torso, new THREE.ConeGeometry(0.055, 0.24, 5), iron, [side * 0.32, 0.68, 0]);
      spike.rotation.z = side * -0.35;
    }
  }
  if (kind === 'undead') {
    changeFace(root, '#919b86', '#dabb72');
    for (const side of [-1, 1]) {
      const rib = mesh(torso, new THREE.BoxGeometry(0.13, 0.035, 0.025), bone, [side * 0.1, 0.36, 0.21]);
      rib.rotation.z = side * -0.25;
    }
    mesh(head, new THREE.BoxGeometry(0.13, 0.04, 0.03), bone, [0, -0.12, 0.15]);
  }
  if (kind === 'necromancer') {
    changeFace(root, '#8e8d7e', '#b384dc');
    const robe = mesh(root, new THREE.CylinderGeometry(0.25, 0.48, 0.98, 7), dark, [0, 0.49, 0], 'robe');
    robe.scale.z = 0.7;
    const staff = new THREE.Group();
    staff.name = 'staff';
    staff.position.set(0, -0.10, 0.06);
    mesh(staff, new THREE.CylinderGeometry(0.035, 0.045, 1.7, 6), colored('#665048'), [0, 0.22, 0]);
    const crystal = mesh(staff, new THREE.OctahedronGeometry(0.15), new THREE.MeshStandardMaterial({ color: '#b995d8', emissive: '#51376d', emissiveIntensity: 1.2, roughness: 0.6 }), [0, 1.12, 0]);
    crystal.scale.y = 1.4;
    elbowR.add(staff);
  }
  if (kind === 'armored' || kind === 'champion') {
    const plate = mesh(torso, new THREE.BoxGeometry(0.55, 0.4, 0.13), iron, [0, 0.37, 0.16], 'breastplate');
    plate.rotation.x = -0.06;
    for (const side of [-1, 1]) {
      const shoulder = mesh(torso, new THREE.SphereGeometry(1, 8, 6), iron, [side * 0.33, 0.58, 0]);
      shoulder.scale.set(0.19, 0.11, 0.18);
    }
    const shield = mesh(armL, new THREE.CylinderGeometry(0.32, 0.32, 0.08, 6), iron, [-0.06, -0.30, 0.17], 'shield');
    shield.rotation.x = Math.PI / 2;
    mesh(armL, new THREE.SphereGeometry(0.08, 8, 6), bone, [-0.06, -0.30, 0.23]);
  }
  if (kind === 'nightcreature' || kind === 'champion') {
    changeFace(root, kind === 'nightcreature' ? '#65706a' : '#80685c', '#d36e54');
    horns(head, bone, kind === 'champion' ? 1.2 : 0.85);
    if (kind === 'nightcreature') {
      root.scale.set(0.9, 1.13, 0.9);
      for (const arm of [armL, armR]) {
        for (let i = -1; i <= 1; i++) {
          const claw = mesh(arm, new THREE.ConeGeometry(0.025, 0.14, 5), bone, [i * 0.055, -0.72, 0.04]);
          claw.rotation.z = Math.PI;
        }
      }
    } else {
      root.scale.setScalar(1.2);
      const crest = mesh(head, new THREE.ConeGeometry(0.11, 0.28, 5), iron, [0, 0.35, -0.04]);
      crest.rotation.z = 0.2;
    }
  }
  return root;
}
