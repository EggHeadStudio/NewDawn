import * as THREE from 'three';
import { defaultAppearance, type CharacterAppearance, type Outfit } from './appearance';
import { createHighBun, disposeAuthoredCharacter } from './authored-character';

type Surface = THREE.MeshStandardMaterial;
type Ring = readonly [y: number, width: number, depth: number, offsetZ?: number];

function material(color: string, roughness = 0.96, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function part(parent: THREE.Object3D, geometry: THREE.BufferGeometry, surface: THREE.Material,
  position: [number, number, number], name?: string) {
  const mesh = new THREE.Mesh(geometry, surface);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (name) mesh.name = name;
  parent.add(mesh);
  return mesh;
}

export function shapedGeometry(rings: readonly Ring[], sides = 12) {
  const vertices: number[] = [];
  const indices: number[] = [];
  for (const [y, width, depth, offsetZ = 0] of rings) {
    for (let side = 0; side < sides; side++) {
      const angle = side / sides * Math.PI * 2;
      vertices.push(Math.sin(angle) * width, y, Math.cos(angle) * depth + offsetZ);
    }
  }
  for (let row = 0; row < rings.length - 1; row++) {
    for (let side = 0; side < sides; side++) {
      const a = row * sides + side;
      const b = row * sides + (side + 1) % sides;
      const c = a + sides;
      const d = b + sides;
      indices.push(a, b, c, b, d, c);
    }
  }
  const bottom = vertices.length / 3;
  vertices.push(0, rings[0][0], rings[0][3] ?? 0);
  const top = vertices.length / 3;
  vertices.push(0, rings[rings.length - 1][0], rings[rings.length - 1][3] ?? 0);
  for (let side = 0; side < sides; side++) {
    const next = (side + 1) % sides;
    indices.push(bottom, side, next);
    indices.push(top, (rings.length - 1) * sides + next, (rings.length - 1) * sides + side);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function sculpt(parent: THREE.Object3D, surface: Surface, rings: readonly Ring[],
  position: [number, number, number], name?: string, sides = 12) {
  return part(parent, shapedGeometry(rings, sides), surface, position, name);
}

function faceGeometry(angular: boolean, feminine: boolean) {
  const geometry = new THREE.SphereGeometry(1, 24, 16);
  const vertices = geometry.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    const nx = vertices.getX(i);
    const ny = vertices.getY(i);
    const nz = vertices.getZ(i);
    const jaw = ny < -0.2 ? (angular ? 0.9 : 0.83) + (ny + 1) * 0.16 - (feminine ? 0.04 : 0) : 1;
    const cheek = 1 + 0.08 * Math.exp(-(((ny + 0.12) / 0.3) ** 2));
    let z = nz * (nz >= 0 ? 0.115 : 0.13);
    if (nz > 0) {
      const nose = Math.exp(-((nx / 0.22) ** 2) - ((ny + 0.08) / 0.34) ** 2) * 0.045;
      const eyes = Math.exp(-(((Math.abs(nx) - 0.42) / 0.22) ** 2) - ((ny - 0.13) / 0.13) ** 2) * 0.012;
      z += (nose - eyes) * nz;
    }
    vertices.setXYZ(i, nx * 0.13 * jaw * cheek, ny * 0.165, z);
  }
  geometry.computeVertexNormals();
  return geometry;
}

function clothPanel(parent: THREE.Object3D, surface: Surface, width: number, length: number) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -width, 0.48, -0.11, 0, 0.49, -0.14, width, 0.48, -0.11,
    -width * 1.07, 0.08, -0.18, 0, 0.06, -0.20, width * 1.07, 0.08, -0.18,
    -width * 1.16, -length, -0.23, 0, -length - 0.025, -0.25, width * 1.16, -length, -0.23,
  ], 3));
  geometry.setIndex([0, 3, 1, 1, 3, 4, 1, 4, 2, 2, 4, 5, 3, 6, 4, 4, 6, 7, 4, 7, 5, 5, 7, 8]);
  geometry.computeVertexNormals();
  const cloth = surface.clone();
  cloth.side = THREE.DoubleSide;
  return part(parent, geometry, cloth, [0, 0, 0], 'cloak');
}

function braid(parent: THREE.Object3D, surface: Surface, x: number, z: number, length: number) {
  for (let i = 0; i < length; i++) {
    const lock = part(parent, new THREE.CapsuleGeometry(0.021, 0.045, 3, 6), surface,
      [x + (i % 2 ? 0.012 : -0.012), -0.04 - i * 0.052, z]);
    lock.rotation.z = i % 2 ? 0.28 : -0.28;
  }
}

function heldTool(arm: THREE.Group, kind: 'chop' | 'mine' | 'weapon' | 'stick' | 'saw', wood: Surface, metal: Surface) {
  const tool = new THREE.Group();
  tool.name = `tool-${kind}`;
  tool.position.set(0, -0.25, 0.06);
  tool.rotation.x = -0.5;
  tool.visible = false;
  if (kind === 'weapon') {
    part(tool, new THREE.CylinderGeometry(0.025, 0.028, 0.17, 7), wood, [0, -0.10, 0]);
    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(-0.035, 0);
    bladeShape.lineTo(-0.035, 0.38);
    bladeShape.lineTo(0, 0.48);
    bladeShape.lineTo(0.035, 0.38);
    bladeShape.lineTo(0.035, 0);
    bladeShape.closePath();
    part(tool, new THREE.ExtrudeGeometry(bladeShape, { depth: 0.018, bevelEnabled: false }), metal, [0, 0, -0.009]);
    part(tool, new THREE.BoxGeometry(0.17, 0.028, 0.045), metal, [0, 0, 0]);
    part(tool, new THREE.SphereGeometry(0.032, 8, 6), metal, [0, -0.20, 0]);
  } else if (kind === 'stick') {
    part(tool, new THREE.CylinderGeometry(0.055, 0.025, 0.62, 7), wood, [0, 0.05, 0]);
  } else if (kind === 'saw') {
    const blade = new THREE.Shape();
    blade.moveTo(-0.035, -0.02);
    blade.lineTo(0.09, 0);
    blade.lineTo(0.055, 0.52);
    blade.lineTo(0.005, 0.54);
    for (let i = 0; i <= 16; i++) blade.lineTo(i % 2 ? -0.018 : -0.027, 0.50 - i * 0.03);
    blade.closePath();
    part(tool, new THREE.ExtrudeGeometry(blade, { depth: 0.012, bevelEnabled: false }), metal, [0, 0, -0.006]);
    part(tool, new THREE.BoxGeometry(0.095, 0.14, 0.035), wood, [0.025, -0.06, 0]);
    const grip = part(tool, new THREE.BoxGeometry(0.04, 0.055, 0.045), metal, [0.025, -0.06, 0.005]);
    grip.name = 'saw-grip';
  } else {
    part(tool, new THREE.CylinderGeometry(0.022, 0.03, 0.58, 6), wood, [0, -0.20, 0]);
    const head = part(tool, new THREE.BoxGeometry(kind === 'mine' ? 0.4 : 0.23, 0.1, 0.07), metal, [0.08, 0.18, 0]);
    head.rotation.z = kind === 'mine' ? -0.12 : 0.2;
  }
  arm.add(tool);
}

function hand(parent: THREE.Object3D, surface: Surface, side: number, fingerGeometry: THREE.BufferGeometry) {
  sculpt(parent, surface, [[-0.09, 0.04, 0.027], [-0.015, 0.055, 0.034], [0.025, 0.045, 0.03]],
    [0, -0.25, 0], undefined, 8);
  const thumb = part(parent, new THREE.CapsuleGeometry(0.014, 0.035, 3, 6), surface, [side * -0.052, -0.27, 0.012]);
  thumb.rotation.z = side * -0.5;
  for (let finger = 0; finger < 4; finger++) {
    const digit = part(parent, fingerGeometry, surface, [(finger - 1.5) * 0.022, -0.35, 0.003]);
    if (finger === 0 || finger === 3) digit.scale.y = 0.87;
    digit.rotation.z = (finger - 1.5) * 0.045;
  }
}

export function createCharacter(input: Outfit | CharacterAppearance = 'ember', options: { highBun?: boolean } = {}) {
  const appearance = typeof input === 'string' ? defaultAppearance(input) : input;
  const root = new THREE.Group();
  const skin = material({ light: '#d3a68e', warm: '#b98365', brown: '#8e604b', deep: '#5e4035' }[appearance.skin]);
  const hair = material({ dark: '#282727', brown: '#49362c', blond: '#a98a60', red: '#874d39', silver: '#a6a49a' }[appearance.hairColor]);
  const palette = {
    ember: ['#885b4b', '#c4b8a0', '#41494a'],
    sage: ['#66745c', '#c4b8a0', '#41483e'],
    azure: ['#526f78', '#c4b8a0', '#444a51'],
  }[appearance.outfit];
  const outer = material(palette[0]);
  const linen = material(palette[1]);
  const trousers = material(palette[2]);
  const leather = material('#594535');
  const darkLeather = material('#392f29');
  const fur = material('#a99a80');
  const metal = material('#808680', 0.72, 0.36);
  const eyes = material('#282b29');
  const eyeWhite = material('#cdbdac');
  const fingerGeometry = new THREE.CapsuleGeometry(0.009, 0.035, 2, 5);
  const shape = appearance.body === 'feminine' ? 0.88 : 1;
  const rugged = appearance.clothing === 'tunic' || appearance.clothing === 'fur';
  const jacket = appearance.clothing !== 'shirt';

  const torso = new THREE.Group();
  torso.name = 'torso';
  torso.position.y = 0.96;
  root.add(torso);
  const hipWidth = appearance.body === 'feminine' ? 0.235 : 0.22;
  const waistWidth = appearance.body === 'feminine' ? 0.19 : 0.21;
  sculpt(torso, jacket ? outer : linen, [
    [-0.06, hipWidth, 0.135], [0.04, hipWidth + 0.01, 0.145], [0.18, waistWidth, 0.135],
    [0.36, 0.255 * shape, 0.155], [0.51, 0.29 * shape, 0.14], [0.59, 0.22 * shape, 0.10], [0.64, 0.095, 0.075],
  ], [0, 0, 0], 'chest');
  sculpt(torso, trousers, [[-0.12, hipWidth - 0.02, 0.12], [0, hipWidth + 0.01, 0.14], [0.10, hipWidth, 0.13]], [0, 0, 0], 'hips');
  const collar = sculpt(torso, rugged ? fur : linen, [[0, 0.105, 0.075], [0.075, 0.12, 0.085]], [0, 0.55, 0], 'collar');
  collar.rotation.x = -0.08;
  if (jacket) {
    for (const side of [-1, 1]) {
      const lapel = part(torso, new THREE.BoxGeometry(0.035, 0.22, 0.018), rugged ? leather : linen,
        [side * 0.06, 0.42, 0.148]);
      lapel.rotation.z = side * 0.22;
      if (appearance.clothing === 'jacket') {
        part(torso, new THREE.BoxGeometry(0.11, 0.095, 0.025), outer, [side * 0.14 * shape, 0.15, 0.14]);
      }
    }
  }
  sculpt(torso, leather, [[0, 0.23 * shape, 0.143], [0.07, 0.23 * shape, 0.143]], [0, -0.005, 0], 'belt');
  part(torso, new THREE.BoxGeometry(0.055, 0.05, 0.018), metal, [0, 0.03, 0.15]);
  const strap = part(torso, new THREE.BoxGeometry(0.035, 0.57, 0.014), darkLeather, [0.035, 0.32, 0.155]);
  strap.rotation.z = -0.40;
  sculpt(torso, leather, [[0, 0.055, 0.035], [0.11, 0.06, 0.04]], [0.20 * shape, -0.08, 0.12], 'pouch', 8);
  if (rugged) {
    clothPanel(torso, outer, 0.25 * shape, appearance.clothing === 'fur' ? 0.52 : 0.31);
    if (appearance.clothing === 'fur') {
      const mantle = sculpt(torso, fur, [[0, 0.27 * shape, 0.13], [0.075, 0.30 * shape, 0.13], [0.12, 0.16, 0.08]], [0, 0.49, -0.015]);
      mantle.rotation.x = -0.08;
    }
  }

  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 1.71;
  root.add(head);
  sculpt(head, skin, [[-0.19, 0.07, 0.065], [-0.10, 0.075, 0.07]], [0, 0, 0], 'neck');
  part(head, faceGeometry(appearance.face === 'angular', appearance.body === 'feminine'), skin, [0, 0, 0], 'face');
  for (const side of [-1, 1]) {
    const ear = part(head, new THREE.SphereGeometry(1, 8, 6), skin, [side * 0.13, -0.005, 0]);
    ear.scale.set(0.023, 0.039, 0.018);
    const white = part(head, new THREE.SphereGeometry(1, 8, 6), eyeWhite, [side * 0.054, 0.015, 0.105], side < 0 ? 'eyeWhiteL' : 'eyeWhiteR');
    white.scale.set(0.016, 0.006, 0.004);
    const eye = part(head, new THREE.SphereGeometry(1, 8, 6), eyes, [side * 0.054, 0.015, 0.112], side < 0 ? 'eyeL' : 'eyeR');
    eye.scale.set(0.006, 0.006, 0.003);
    const brow = part(head, new THREE.BoxGeometry(0.045, 0.008, 0.009), hair, [side * 0.054, 0.045, 0.11]);
    brow.rotation.z = side * -0.11;
  }
  part(head, new THREE.BoxGeometry(0.046, 0.006, 0.008), darkLeather, [0, -0.085, 0.109]);
  if (appearance.hair !== 'shaved') {
    const scalp = part(head, new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.57), hair, [0, 0.035, -0.006], 'hair');
    scalp.scale.set(0.137, 0.135, 0.13);
    if (appearance.hair === 'long' || appearance.hair === 'braided') {
      sculpt(head, hair, [[-0.19, 0.10, 0.045], [-0.06, 0.14, 0.06], [0.10, 0.13, 0.06]], [0, 0, -0.105], 'long-hair');
      if (appearance.hair === 'braided') {
        braid(head, hair, -0.115, 0.045, 5);
        braid(head, hair, 0.115, 0.045, 5);
      }
    } else if (appearance.hair === 'curly') {
      for (let i = 0; i < 7; i++) {
        const angle = i * Math.PI * 2 / 7;
        const curl = part(head, new THREE.IcosahedronGeometry(0.038, 1), hair, [Math.sin(angle) * 0.10, 0.145, Math.cos(angle) * 0.085]);
        curl.scale.y = 0.8;
      }
    }
    if (options.highBun) {
      const bun = createHighBun();
      bun.position.set(0, 0.13, -0.08);
      head.add(bun);
    }
  }
  if (appearance.facialHair !== 'none') {
    if (appearance.facialHair !== 'moustache') {
      sculpt(head, hair, [[-0.15, 0.055, 0.035], [-0.09, 0.105, 0.05], [-0.03, 0.105, 0.025]], [0, 0, 0.07], 'beard');
      if (appearance.facialHair === 'braided') braid(head, hair, 0, 0.11, 3);
    }
    for (const side of [-1, 1]) {
      const moustache = part(head, new THREE.CapsuleGeometry(0.012, 0.038, 3, 6), hair, [side * 0.026, -0.061, 0.115]);
      moustache.rotation.z = side * -1.2;
    }
  }
  if (appearance.hat === 'cap' || appearance.hat === 'beanie') {
    const hat = part(head, new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.54), outer, [0, 0.075, 0]);
    hat.scale.set(0.15, 0.12, 0.14);
    if (appearance.hat === 'cap') part(head, new THREE.BoxGeometry(0.19, 0.015, 0.105), leather, [0, 0.075, 0.13]);
    else part(head, new THREE.TorusGeometry(0.145, 0.012, 5, 16), linen, [0, 0.075, 0]).rotation.x = Math.PI / 2;
  } else if (appearance.hat === 'hood') {
    const hood = part(head, new THREE.SphereGeometry(1, 12, 8), outer, [0, 0.025, -0.07], 'hood');
    hood.scale.set(0.165, 0.20, 0.095);
  } else if (appearance.hat === 'helmet') {
    const helmet = part(head, new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), metal, [0, 0.075, -0.01]);
    helmet.scale.set(0.155, 0.14, 0.145);
    part(head, new THREE.BoxGeometry(0.025, 0.13, 0.015), metal, [0, 0.01, 0.13]);
  }

  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.name = side < 0 ? 'legL' : 'legR';
    leg.position.set(side * 0.125 * shape, 0.90, 0);
    root.add(leg);
    sculpt(leg, trousers, [[-0.42, 0.067, 0.075], [-0.30, 0.085, 0.085], [-0.13, 0.095, 0.10], [0.02, 0.105, 0.105]], [0, 0, 0], 'thigh');
    const knee = new THREE.Group();
    knee.name = side < 0 ? 'kneeL' : 'kneeR';
    knee.position.y = -0.40;
    leg.add(knee);
    sculpt(knee, trousers, [[-0.29, 0.055, 0.06], [-0.17, 0.07, 0.07], [-0.04, 0.075, 0.075], [0.03, 0.067, 0.075]], [0, 0, 0], 'calf');
    sculpt(knee, leather, [[-0.38, 0.065, 0.075], [-0.23, 0.068, 0.065], [-0.16, 0.072, 0.07]], [0, 0, 0], 'boot');
    sculpt(knee, darkLeather, [[-0.47, 0.075, 0.13, 0.055], [-0.40, 0.075, 0.13, 0.055], [-0.36, 0.062, 0.075, 0.02]], [0, 0, 0], 'foot', 8);

    const arm = new THREE.Group();
    arm.name = side < 0 ? 'armL' : 'armR';
    arm.position.set(side * 0.275 * shape, 1.47, 0);
    arm.rotation.z = side * 0.12;
    root.add(arm);
    sculpt(arm, jacket ? outer : linen, [[-0.32, 0.057, 0.065], [-0.22, 0.065, 0.07], [-0.06, 0.08, 0.085], [0.03, 0.075, 0.075]], [0, 0, 0], 'sleeve');
    const elbow = new THREE.Group();
    elbow.name = side < 0 ? 'elbowL' : 'elbowR';
    elbow.position.y = -0.31;
    arm.add(elbow);
    sculpt(elbow, rugged ? leather : jacket ? outer : linen,
      [[-0.23, 0.048, 0.05], [-0.15, 0.055, 0.06], [-0.02, 0.062, 0.065], [0.025, 0.058, 0.065]], [0, 0, 0], 'forearm');
    hand(elbow, skin, side, fingerGeometry);
    if (side > 0) {
      heldTool(elbow, 'chop', leather, metal);
      heldTool(elbow, 'mine', leather, metal);
      heldTool(elbow, 'weapon', leather, metal);
      heldTool(elbow, 'stick', leather, metal);
      heldTool(elbow, 'saw', leather, metal);
    }
  }
  root.scale.y = { short: 0.9, medium: 1, tall: 1.1 }[appearance.height];
  return root;
}

export function disposeCharacter(model: THREE.Object3D) {
  disposeAuthoredCharacter(model);
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  model.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object.userData.authoredShared) return;
    geometries.add(object.geometry);
    (Array.isArray(object.material) ? object.material : [object.material]).forEach(surface => materials.add(surface));
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(surface => surface.dispose());
}
