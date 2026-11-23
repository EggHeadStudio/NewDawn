import * as THREE from 'three';
import { defaultAppearance, type CharacterAppearance, type Outfit } from './appearance';

type Material = THREE.MeshStandardMaterial;

function material(color: string, roughness = 0.94, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function part(parent: THREE.Object3D, geometry: THREE.BufferGeometry, surface: THREE.Material,
  position: [number, number, number], name?: string) {
  const mesh = new THREE.Mesh(geometry, surface);
  mesh.position.set(...position);
  mesh.castShadow = true;
  if (name) mesh.name = name;
  parent.add(mesh);
  return mesh;
}

function ellipsoid(parent: THREE.Object3D, surface: THREE.Material, position: [number, number, number],
  scale: [number, number, number], name?: string) {
  const mesh = part(parent, new THREE.SphereGeometry(1, 12, 8), surface, position, name);
  mesh.scale.set(...scale);
  return mesh;
}

function taperedFace(angular: boolean) {
  const geometry = new THREE.SphereGeometry(1, angular ? 10 : 14, 10);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const jaw = y < 0 ? 0.83 + (y + 1) * 0.17 : 1;
    positions.setXYZ(i, x * 0.175 * jaw, y * 0.225, z * (z > 0 ? 0.16 : 0.175));
  }
  geometry.computeVertexNormals();
  return geometry;
}

function cloak(parent: THREE.Object3D, surface: THREE.Material, length: number) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.31, 0.51, -0.12, 0, 0.53, -0.16, 0.31, 0.51, -0.12,
    -0.36, 0.05, -0.22, 0, 0.02, -0.25, 0.36, 0.05, -0.22,
    -0.42, -length, -0.31, 0, -length - 0.04, -0.35, 0.42, -length, -0.31,
  ], 3));
  geometry.setIndex([0, 3, 1, 1, 3, 4, 1, 4, 2, 2, 4, 5, 3, 6, 4, 4, 6, 7, 4, 7, 5, 5, 7, 8]);
  geometry.computeVertexNormals();
  return part(parent, geometry, surface, [0, 0, 0], 'cloak');
}

function braid(parent: THREE.Object3D, surface: Material, x: number, y: number, z: number, length: number) {
  for (let i = 0; i < length; i++) {
    const segment = ellipsoid(parent, surface, [x + (i % 2 ? 0.018 : -0.018), y - i * 0.085, z], [0.048, 0.07, 0.045]);
    segment.rotation.z = i % 2 ? 0.3 : -0.3;
  }
}

function heldTool(arm: THREE.Group, kind: 'chop' | 'mine' | 'weapon', leather: Material, metal: Material) {
  const tool = new THREE.Group();
  tool.name = `tool-${kind}`;
  tool.position.set(0, -0.25, 0.09);
  tool.rotation.x = -0.5;
  tool.visible = false;
  const length = kind === 'weapon' ? 0.72 : 0.58;
  part(tool, new THREE.CylinderGeometry(0.025, 0.035, length, 6), leather, [0, -length * 0.35, 0]);
  if (kind === 'weapon') {
    const blade = part(tool, new THREE.BoxGeometry(0.09, 0.48, 0.035), metal, [0, 0.12, 0]);
    blade.rotation.z = 0.1;
    part(tool, new THREE.BoxGeometry(0.19, 0.04, 0.055), metal, [0, -0.12, 0]);
  } else {
    const head = part(tool, new THREE.BoxGeometry(kind === 'mine' ? 0.42 : 0.24, 0.11, 0.08), metal, [0.08, 0.18, 0]);
    head.rotation.z = kind === 'mine' ? -0.12 : 0.2;
  }
  arm.add(tool);
}

export function createCharacter(input: Outfit | CharacterAppearance = 'ember') {
  const appearance = typeof input === 'string' ? defaultAppearance(input) : input;
  const root = new THREE.Group();
  const skin = material({ light: '#d8a994', warm: '#b67d5f', brown: '#875744', deep: '#593b34' }[appearance.skin]);
  const hair = material({ dark: '#282727', brown: '#49362c', blond: '#ae8d60', red: '#8c4a35', silver: '#aba99d' }[appearance.hairColor]);
  const palette = {
    ember: ['#9a5843', '#c4b598', '#484b4a'],
    sage: ['#687d5c', '#c4b598', '#404d43'],
    azure: ['#537985', '#c6bda8', '#444d57'],
  }[appearance.outfit];
  const outer = material(palette[0]);
  const linen = material(palette[1]);
  const trousers = material(palette[2]);
  const leather = material('#594535');
  const darkLeather = material('#392f29');
  const fur = material('#b4a284');
  const metal = material('#858b85', 0.72, 0.35);
  const eyes = material('#272b2a');
  const shape = appearance.body === 'feminine' ? 0.9 : 1;
  const rugged = appearance.clothing === 'tunic' || appearance.clothing === 'fur';

  const torso = new THREE.Group();
  torso.name = 'torso';
  torso.position.y = 0.91;
  root.add(torso);
  const chest = ellipsoid(torso, appearance.clothing === 'shirt' ? linen : outer, [0, 0.35, 0], [0.34 * shape, 0.42, 0.20], 'chest');
  chest.rotation.x = -0.04;
  const hem = part(torso, new THREE.CylinderGeometry(0.25 * shape, 0.29 * shape, 0.27, 8), appearance.clothing === 'shirt' ? linen : outer, [0, 0.08, 0]);
  hem.scale.z = 0.72;
  const collar = part(torso, new THREE.BoxGeometry(0.25, 0.09, 0.08), rugged ? fur : linen, [0, 0.62, 0.14]);
  collar.rotation.x = -0.25;
  for (const side of [-1, 1]) {
    const lapel = part(torso, new THREE.BoxGeometry(0.055, 0.25, 0.035), rugged ? leather : linen, [side * 0.105, 0.45, 0.19]);
    lapel.rotation.z = side * 0.24;
  }
  part(torso, new THREE.BoxGeometry(0.57 * shape, 0.085, 0.36), leather, [0, 0.05, 0], 'belt');
  part(torso, new THREE.BoxGeometry(0.085, 0.07, 0.025), metal, [0, 0.05, 0.19]);
  const strap = part(torso, new THREE.BoxGeometry(0.055, 0.61, 0.035), darkLeather, [0.04, 0.35, 0.205]);
  strap.rotation.z = -0.48;
  const pouch = ellipsoid(torso, leather, [0.24 * shape, -0.01, 0.17], [0.10, 0.12, 0.06], 'pouch');
  pouch.rotation.z = -0.1;
  if (rugged) {
    const capeMaterial = outer.clone();
    capeMaterial.side = THREE.DoubleSide;
    cloak(torso, capeMaterial, appearance.clothing === 'fur' ? 0.54 : 0.34);
    for (const side of [-1, 1]) {
      const shoulder = ellipsoid(torso, fur, [side * 0.28 * shape, 0.57, -0.03], [0.18, 0.095, 0.20]);
      shoulder.rotation.z = side * 0.25;
    }
  } else if (appearance.clothing === 'jacket') {
    part(torso, new THREE.BoxGeometry(0.13, 0.12, 0.035), leather, [0.18 * shape, 0.25, 0.19]);
  }

  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 1.77;
  head.scale.setScalar(0.85);
  root.add(head);
  part(head, new THREE.CylinderGeometry(0.09, 0.105, 0.18, 8), skin, [0, -0.22, 0]);
  part(head, taperedFace(appearance.face === 'angular'), skin, [0, 0, 0], 'face');
  for (const side of [-1, 1]) {
    ellipsoid(head, skin, [side * 0.17, -0.01, 0], [0.033, 0.057, 0.026]);
    ellipsoid(head, eyes, [side * 0.073, 0.025, 0.148], [0.023, 0.012, 0.014], side < 0 ? 'eyeL' : 'eyeR');
    const brow = part(head, new THREE.BoxGeometry(0.06, 0.012, 0.014), hair, [side * 0.073, 0.058, 0.147]);
    brow.rotation.z = side * -0.1;
  }
  const nose = part(head, new THREE.ConeGeometry(0.036, 0.09, 5), skin, [0, -0.035, 0.165]);
  nose.rotation.x = Math.PI / 2;
  part(head, new THREE.BoxGeometry(0.065, 0.009, 0.01), darkLeather, [0, -0.11, 0.148]);
  if (appearance.hair !== 'shaved') {
    const scalp = part(head, new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.58), hair, [0, 0.045, -0.012]);
    scalp.scale.set(0.18, 0.18, 0.17);
    if (appearance.hair === 'long' || appearance.hair === 'braided') {
      ellipsoid(head, hair, [0, -0.10, -0.14], [0.16, 0.25, 0.09]);
      if (appearance.hair === 'braided') {
        braid(head, hair, -0.14, 0.03, 0.08, 5);
        braid(head, hair, 0.14, 0.03, 0.08, 5);
      }
    } else if (appearance.hair === 'curly') {
      for (let i = 0; i < 7; i++) {
        const angle = i * Math.PI * 2 / 7;
        ellipsoid(head, hair, [Math.sin(angle) * 0.13, 0.18, Math.cos(angle) * 0.11], [0.065, 0.065, 0.065]);
      }
    }
  }
  if (appearance.facialHair !== 'none') {
    if (appearance.facialHair !== 'moustache') {
      ellipsoid(head, hair, [0, -0.135, 0.105], [0.13, 0.12, 0.08]);
      if (appearance.facialHair === 'braided') braid(head, hair, 0, -0.19, 0.15, 3);
    }
    for (const side of [-1, 1]) {
      const moustache = ellipsoid(head, hair, [side * 0.045, -0.075, 0.158], [0.055, 0.018, 0.018]);
      moustache.rotation.z = side * -0.22;
    }
  }
  if (appearance.hat === 'cap' || appearance.hat === 'beanie') {
    const hat = part(head, new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.54), outer, [0, 0.10, 0]);
    hat.scale.set(0.19, 0.16, 0.18);
    if (appearance.hat === 'cap') {
      const brim = part(head, new THREE.BoxGeometry(0.25, 0.025, 0.14), leather, [0, 0.10, 0.17]);
      brim.rotation.x = -0.08;
    } else {
      part(head, new THREE.TorusGeometry(0.18, 0.022, 5, 12), linen, [0, 0.10, 0]).rotation.x = Math.PI / 2;
    }
  } else if (appearance.hat === 'hood') {
    const hood = part(head, new THREE.SphereGeometry(1, 12, 8), outer, [0, 0.04, -0.085]);
    hood.scale.set(0.225, 0.27, 0.15);
  } else if (appearance.hat === 'helmet') {
    const helmet = part(head, new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), metal, [0, 0.085, -0.01]);
    helmet.scale.set(0.205, 0.20, 0.19);
    part(head, new THREE.BoxGeometry(0.035, 0.16, 0.025), metal, [0, 0.015, 0.17]);
  }

  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.name = side < 0 ? 'legL' : 'legR';
    leg.position.set(side * 0.17 * shape, 0.87, 0);
    root.add(leg);
    const thigh = ellipsoid(leg, trousers, [0, -0.21, 0], [0.105, 0.25, 0.11]);
    thigh.rotation.x = 0.04;
    const knee = new THREE.Group();
    knee.name = side < 0 ? 'kneeL' : 'kneeR';
    knee.position.y = -0.42;
    leg.add(knee);
    ellipsoid(knee, trousers, [0, -0.14, 0], [0.085, 0.21, 0.09]);
    ellipsoid(knee, leather, [0, -0.28, 0], [0.095, 0.12, 0.10]);
    const foot = ellipsoid(knee, darkLeather, [0, -0.37, 0.055], [0.10, 0.075, 0.18]);
    foot.rotation.x = -0.04;
    part(knee, new THREE.BoxGeometry(0.17, 0.025, 0.28), darkLeather, [0, -0.435, 0.05]);

    const arm = new THREE.Group();
    arm.name = side < 0 ? 'armL' : 'armR';
    arm.position.set(side * 0.34 * shape, 1.43, 0);
    arm.rotation.z = side * 0.07;
    root.add(arm);
    const sleeve = ellipsoid(arm, appearance.clothing === 'shirt' ? linen : outer, [side * 0.025, -0.16, 0], [0.095, 0.22, 0.10]);
    sleeve.rotation.z = side * 0.08;
    const elbow = new THREE.Group();
    elbow.name = side < 0 ? 'elbowL' : 'elbowR';
    elbow.position.set(side * 0.035, -0.34, 0);
    arm.add(elbow);
    ellipsoid(elbow, rugged ? leather : linen, [0, -0.12, 0], [0.09, 0.16, 0.09]);
    ellipsoid(elbow, skin, [0, -0.27, 0.01], [0.07, 0.09, 0.05]);
    if (side > 0) {
      heldTool(elbow, 'chop', leather, metal);
      heldTool(elbow, 'mine', leather, metal);
      heldTool(elbow, 'weapon', leather, metal);
    }
  }
  root.scale.y = { short: 0.9, medium: 1, tall: 1.1 }[appearance.height];
  return root;
}

export function disposeCharacter(model: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  model.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    (Array.isArray(object.material) ? object.material : [object.material]).forEach(surface => materials.add(surface));
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(surface => surface.dispose());
}
