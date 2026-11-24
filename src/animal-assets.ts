import * as THREE from 'three';
import type { Species } from './wildlife';

export function createAnimal(species: Species, variant: number) {
  const root = new THREE.Group();
  const colors = {
    deer: ['#aa7953', '#c39a6f'], rabbit: ['#b2a08a', '#d2c4a8'],
    wolf: ['#777f78', '#958c7c'], bird: ['#537c83', '#aa855c'],
    bear: ['#5a4939', '#755a41'], snake: ['#5d7a46', '#886c35'],
    squirrel: ['#9b7353', '#bd9667'], reindeer: ['#80644d', '#a27a55'],
    moose: ['#5c4a3b', '#745d48'], cow: ['#d6c8ad', '#5a5046'],
    sheep: ['#e1dcc9', '#c9c1a8'], fox: ['#b85f31', '#d17842'],
  }[species];
  const fur = new THREE.MeshStandardMaterial({ color: colors[variant % colors.length], roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: '#3e3933', roughness: 1 });
  const light = new THREE.MeshStandardMaterial({ color: '#e1d3b7', roughness: 1 });
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = root) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  if (species === 'bird') {
    const body = add(new THREE.SphereGeometry(0.25, 8, 6), fur, 0, 0.3, 0);
    body.scale.set(0.8, 0.8, 1.4);
    add(new THREE.SphereGeometry(0.14, 8, 6), fur, 0, 0.42, 0.3);
    const beak = add(new THREE.ConeGeometry(0.07, 0.2, 4), light, 0, 0.4, 0.47);
    beak.rotation.x = Math.PI / 2;
    for (const side of [-1, 1]) {
      const wing = new THREE.Group();
      wing.name = side < 0 ? 'wingL' : 'wingR';
      wing.position.set(side * 0.16, 0.36, 0);
      root.add(wing);
      add(new THREE.BoxGeometry(0.45, 0.06, 0.35), fur, side * 0.2, 0, -0.02, wing);
    }
    return root;
  }
  if (species === 'snake') {
    const segments = 9;
    for (let index = 0; index < segments; index++) {
      const segment = add(new THREE.IcosahedronGeometry(index === segments - 1 ? 0.18 : 0.14, 1), fur,
        Math.sin(index * 0.9) * 0.18, 0.13 + Math.sin(index * 0.9) * 0.03, index * 0.17 - 0.7);
      segment.scale.set(1.15, 0.7, 1);
      segment.name = `snake-${index}`;
    }
    add(new THREE.SphereGeometry(0.055, 6, 4), dark, 0.07, 0.19, 0.92);
    return root;
  }
  if (species === 'squirrel') {
    const body = add(new THREE.SphereGeometry(0.28, 8, 6), fur, 0, 0.42, 0);
    body.scale.set(0.9, 0.85, 1.15);
    add(new THREE.SphereGeometry(0.16, 8, 6), fur, 0, 0.63, 0.25);
    const tail = add(new THREE.SphereGeometry(0.32, 8, 6), fur, 0, 0.62, -0.42);
    tail.scale.set(0.55, 1.25, 0.9);
    tail.name = 'bushyTail';
    for (const side of [-1, 1]) {
      add(new THREE.ConeGeometry(0.055, 0.16, 5), fur, side * 0.1, 0.79, 0.22).rotation.z = side * -0.35;
      for (const z of [-0.12, 0.12]) {
        const leg = add(new THREE.CapsuleGeometry(0.045, 0.24, 3, 5), dark, side * 0.16, 0.16, z);
        leg.name = `leg-${side}-${z}`;
      }
    }
    root.scale.setScalar(0.9);
    return root;
  }
  const isLarge = species === 'bear' || species === 'moose' || species === 'cow' || species === 'reindeer';
  const size = species === 'rabbit' ? 0.52 : species === 'wolf' || species === 'fox' ? 0.85 : species === 'sheep' ? 0.75 : isLarge ? 1.25 : 1;
  const body = add(new THREE.SphereGeometry(0.53, 9, 7), fur, 0, 1.0, 0);
  body.scale.set(species === 'bear' ? 1 : species === 'cow' || species === 'sheep' ? 0.82 : 0.68,
    species === 'bear' ? 0.95 : 0.75, isLarge ? 1.45 : 1.25);
  const head = add(new THREE.SphereGeometry(0.3, 8, 6), fur, 0, 1.4, 0.62);
  head.scale.set(species === 'bear' ? 1.2 : species === 'fox' ? 0.82 : 0.9,
    species === 'moose' ? 0.82 : 1, species === 'wolf' || species === 'moose' ? 1.3 : species === 'fox' ? 1.1 : 1);
  const snout = add(new THREE.SphereGeometry(species === 'wolf' ? 0.18 : 0.12, 8, 6), light, 0, 1.32, 0.9);
  snout.scale.z = 1.2;
  add(new THREE.SphereGeometry(0.05, 6, 4), dark, 0, 1.37, 1.04);
  for (const side of [-1, 1]) {
    const ear = add(new THREE.ConeGeometry(species === 'rabbit' ? 0.12 : species === 'cow' || species === 'sheep' ? 0.16 : 0.1,
      species === 'rabbit' ? 0.6 : species === 'cow' || species === 'sheep' ? 0.18 : 0.27, 6),
      fur, side * 0.2, species === 'rabbit' ? 1.83 : 1.64, 0.55);
    ear.rotation.z = side * -0.2;
    add(new THREE.SphereGeometry(0.04, 6, 4), dark, side * 0.19, 1.47, 0.82);
    for (const z of [-0.38, 0.42]) {
      const leg = new THREE.Group();
      leg.position.set(side * 0.27, 0.87, z);
      leg.name = `leg-${side}-${z}`;
      root.add(leg);
      add(new THREE.CapsuleGeometry(0.09, species === 'deer' ? 0.62 : 0.42, 3, 6), fur, 0, species === 'deer' ? -0.4 : -0.3, 0, leg);
    }
    if (species === 'deer' || species === 'reindeer' || species === 'moose') {
      const antler = add(new THREE.CylinderGeometry(0.035, 0.045, species === 'moose' ? 0.72 : 0.5, 5), light, side * 0.19, 1.85, 0.58);
      antler.rotation.z = side * -0.3;
      const branch = add(new THREE.CylinderGeometry(0.025, 0.03, species === 'moose' ? 0.45 : 0.3, 5), light, side * 0.28, 1.97, 0.58);
      branch.rotation.z = side * -0.8;
    }
  }
  const tail = add(new THREE.ConeGeometry(species === 'wolf' ? 0.16 : species === 'fox' ? 0.23 : 0.11,
    species === 'wolf' ? 0.65 : species === 'fox' ? 0.9 : 0.25, 7), species === 'fox' ? light : fur, 0, 1.03, -0.72);
  tail.rotation.x = -1;
  root.scale.setScalar(size);
  return root;
}

export function animateAnimal(model: THREE.Group, species: Species, moving: boolean, time: number) {
  if (species === 'bird') {
    const left = model.getObjectByName('wingL');
    const right = model.getObjectByName('wingR');
    const flap = moving ? Math.sin(time * 0.012) * 0.75 : 0.1;
    if (left) left.rotation.z = -flap;
    if (right) right.rotation.z = flap;
  } else if (species === 'snake') {
    for (let index = 0; index < 9; index++) {
      const segment = model.getObjectByName(`snake-${index}`);
      if (segment) segment.position.x = Math.sin(time * 0.006 + index * 0.9) * (moving ? 0.18 : 0.03);
    }
  } else if (species === 'squirrel') {
    const tail = model.getObjectByName('bushyTail');
    if (tail) tail.rotation.z = moving ? Math.sin(time * 0.008) * 0.35 : 0.08;
    for (const side of [-1, 1]) for (const z of [-0.12, 0.12]) {
      const leg = model.getObjectByName(`leg-${side}-${z}`);
      if (leg) leg.rotation.x = moving ? Math.sin(time * 0.014) * 0.65 * side * Math.sign(z) : 0;
    }
  } else {
    for (const side of [-1, 1]) for (const z of [-0.38, 0.42]) {
      const leg = model.getObjectByName(`leg-${side}-${z}`);
      if (leg) leg.rotation.x = moving ? Math.sin(time * 0.01) * 0.55 * side * Math.sign(z) : 0;
    }
  }
}

export function disposeAnimal(model: THREE.Group) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  model.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
}
