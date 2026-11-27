import * as THREE from 'three';
import { defaultAppearance, type CharacterAppearance } from './appearance';
import { createCharacter, shapedGeometry } from './characters';
import type { PlanetaryProjectile } from './planetary-projectile';

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

export function stepEnemyProjectile(position: THREE.Vector3, motion: PlanetaryProjectile, remaining: number, dt: number,
  player: THREE.Vector3, blocked: (point: THREE.Vector3) => boolean) {
  const previous = position.clone();
  const next = motion.step(dt);
  position.set(next.x, next.y, next.z);
  remaining -= dt;
  const obstruction = blocked(position);
  const closest = new THREE.Line3(previous, position).closestPointToPoint(player, true, new THREE.Vector3());
  const hit = !obstruction && closest.distanceTo(player) < 0.75;
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
    const horn = mesh(head, new THREE.ConeGeometry(0.045 * size, 0.27 * size, 6), surface, [side * 0.13, 0.17, -0.015]);
    horn.rotation.z = side * -0.6;
  }
}

function faceWrap() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.12, -0.035, 0.055, -0.055, -0.03, 0.105, 0, -0.035, 0.125, 0.055, -0.03, 0.105, 0.12, -0.035, 0.055,
    -0.10, -0.11, 0.04, -0.05, -0.125, 0.075, 0, -0.13, 0.09, 0.05, -0.125, 0.075, 0.10, -0.11, 0.04,
  ], 3));
  geometry.setIndex([0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 8, 3, 8, 4, 4, 8, 9]);
  geometry.computeVertexNormals();
  return geometry;
}

function hoodGeometry() {
  const outer = [
    [-0.16, -0.16, 0.035], [-0.175, 0.055, 0.035], [-0.13, 0.20, 0.025], [0, 0.27, -0.02],
    [0.13, 0.20, 0.025], [0.175, 0.055, 0.035], [0.16, -0.16, 0.035],
  ];
  const inner = [
    [-0.10, -0.12, 0.09], [-0.115, 0.045, 0.105], [-0.085, 0.135, 0.105], [0, 0.17, 0.09],
    [0.085, 0.135, 0.105], [0.115, 0.045, 0.105], [0.10, -0.12, 0.09],
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([...outer, ...inner].flat(), 3));
  const indices: number[] = [];
  for (let i = 0; i < outer.length - 1; i++) indices.push(i, i + 7, i + 1, i + 1, i + 7, i + 8);
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
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
  const chest = root.getObjectByName('chest');
  if (chest instanceof THREE.Mesh && chest.material instanceof THREE.MeshStandardMaterial) {
    if (kind === 'necromancer') chest.material.color.set('#34343e');
    else if (kind === 'undead') chest.material.color.set('#55594a');
    else if (kind === 'nightcreature') chest.material.color.set('#3d4948');
  }

  if (kind === 'raider' || kind === 'undead' || kind === 'armored' || kind === 'champion') {
    const weapon = root.getObjectByName('tool-weapon');
    if (weapon) weapon.visible = true;
  }
  if (kind === 'raider') {
    const wrap = colored('#453d34');
    wrap.side = THREE.DoubleSide;
    mesh(head, faceWrap(), wrap, [0, 0, 0], 'mask');
    for (const side of [-1, 1]) {
      const spike = mesh(torso, new THREE.ConeGeometry(0.035, 0.15, 5), iron, [side * 0.26, 0.57, -0.02]);
      spike.rotation.z = side * -0.35;
    }
  }
  if (kind === 'undead') {
    changeFace(root, '#919b86', '#dabb72');
    const face = head.getObjectByName('face');
    if (face) face.visible = false;
    for (const name of ['eyeWhiteL', 'eyeWhiteR']) {
      const white = head.getObjectByName(name);
      if (white) white.visible = false;
    }
    mesh(head, shapedGeometry([[-0.14, 0.055, 0.055], [-0.09, 0.09, 0.07], [-0.03, 0.11, 0.085],
      [0.06, 0.115, 0.09], [0.13, 0.09, 0.075], [0.16, 0.05, 0.045]], 12), bone, [0, 0, 0], 'skull');
    for (const side of [-1, 1]) {
      const rib = mesh(torso, new THREE.BoxGeometry(0.10, 0.018, 0.012), bone, [side * 0.09, 0.34, 0.151]);
      rib.rotation.z = side * -0.25;
      const socket = mesh(head, new THREE.SphereGeometry(1, 10, 6), dark, [side * 0.05, 0.018, 0.084]);
      socket.scale.set(0.032, 0.023, 0.012);
      const eye = head.getObjectByName(side < 0 ? 'eyeL' : 'eyeR');
      if (eye) eye.position.set(side * 0.05, 0.018, 0.097);
    }
    for (let tooth = -2; tooth <= 2; tooth++) {
      mesh(head, new THREE.BoxGeometry(0.012, 0.018, 0.008), bone, [tooth * 0.014, -0.105, 0.068]);
    }
  }
  if (kind === 'necromancer') {
    changeFace(root, '#8e8d7e', '#b384dc');
    const oldHood = head.getObjectByName('hood');
    if (oldHood) oldHood.visible = false;
    const cowl = colored('#29272e');
    cowl.side = THREE.DoubleSide;
    mesh(head, hoodGeometry(), cowl, [0, 0, 0], 'cowl');
    mesh(root, shapedGeometry([[0.02, 0.34, 0.22], [0.20, 0.31, 0.20], [0.65, 0.23, 0.15], [1.01, 0.21, 0.13]], 10),
      dark, [0, 0, 0], 'robe');
    const sash = mesh(torso, new THREE.BoxGeometry(0.04, 0.62, 0.012), colored('#7b6873'), [0.04, 0.31, 0.16], 'sash');
    sash.rotation.z = -0.32;
    const staff = new THREE.Group();
    staff.name = 'staff';
    staff.position.set(0, -0.10, 0.06);
    mesh(staff, new THREE.CylinderGeometry(0.035, 0.045, 1.7, 6), colored('#665048'), [0, 0.22, 0]);
    const crystal = mesh(staff, new THREE.OctahedronGeometry(0.15), new THREE.MeshStandardMaterial({ color: '#b995d8', emissive: '#51376d', emissiveIntensity: 1.2, roughness: 0.6 }), [0, 1.12, 0]);
    crystal.scale.y = 1.4;
    elbowR.add(staff);
  }
  if (kind === 'armored' || kind === 'champion') {
    mesh(torso, shapedGeometry([[0.12, 0.235, 0.17], [0.25, 0.25, 0.18], [0.44, 0.28, 0.18], [0.53, 0.27, 0.15]], 12),
      iron, [0, 0, 0.012], 'breastplate');
    for (const side of [-1, 1]) {
      const shoulder = mesh(torso, new THREE.SphereGeometry(1, 8, 6), iron, [side * 0.27, 0.52, 0]);
      shoulder.scale.set(0.13, 0.07, 0.13);
    }
    const shield = mesh(armL, new THREE.CylinderGeometry(0.25, 0.25, 0.06, 8), iron, [-0.06, -0.27, 0.13], 'shield');
    shield.rotation.x = Math.PI / 2;
    mesh(armL, new THREE.SphereGeometry(0.045, 8, 6), bone, [-0.06, -0.27, 0.17]);
  }
  if (kind === 'nightcreature' || kind === 'champion') {
    changeFace(root, kind === 'nightcreature' ? '#65706a' : '#80685c', '#d36e54');
    horns(head, bone, kind === 'champion' ? 1.2 : 0.85);
    if (kind === 'nightcreature') {
      root.scale.set(0.9, 1.13, 0.9);
      for (const arm of [armL, armR]) {
        for (let i = -1; i <= 1; i++) {
          const claw = mesh(arm, new THREE.ConeGeometry(0.018, 0.11, 5), bone, [i * 0.035, -0.67, 0.04]);
          claw.rotation.z = Math.PI;
        }
      }
    } else {
      root.scale.setScalar(1.2);
      const crest = mesh(head, new THREE.ConeGeometry(0.075, 0.18, 5), iron, [0, 0.23, -0.04]);
      crest.rotation.z = 0.2;
    }
  }
  return root;
}
