import * as THREE from 'three';
export { createCharacter } from './characters';
export { createEnemy } from './enemies';
export type { Outfit } from './appearance';

function mat(color: string, roughness = 0.82) {
  return new THREE.MeshStandardMaterial({ color, roughness });
}

export function createShelter() {
  const root = new THREE.Group();
  const wood = mat('#79543a');
  const wall = mat('#a77a4d');
  const roof = mat('#b85f43');
  const floor = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.18, 3.2), wood);
  floor.position.y = 0.09;
  floor.castShadow = true;
  floor.receiveShadow = true;
  root.add(floor);
  [[-1.35,-1.35],[1.35,-1.35],[-1.35,1.35],[1.35,1.35]].forEach(([x,z]) => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.2, 0.18), wood);
    post.position.set(x, 1.1, z);
    post.castShadow = true;
    root.add(post);
  });
  [-1.35, 1.35].forEach(z => {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(2.7, 1.7, 0.12), wall);
    panel.position.set(0, 0.95, z);
    panel.castShadow = true;
    root.add(panel);
  });
  for (const z of [-0.75, 0, 0.75]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 2.7), wood);
    beam.position.set(z, 1.9, 0);
    root.add(beam);
  }
  const roofMesh = new THREE.Mesh(new THREE.ConeGeometry(2.55, 1.45, 4), roof);
  roofMesh.position.y = 2.35;
  roofMesh.rotation.y = Math.PI / 4;
  roofMesh.scale.z = 1.12;
  roofMesh.castShadow = true;
  root.add(roofMesh);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.72, 1.45, 0.08), mat('#5a3b27'));
  door.position.set(0, 0.82, 1.42);
  root.add(door);
  root.userData.building = 'shelter';
  return root;
}

export function createStorage() {
  const root = new THREE.Group();
  const wood = mat('#8a5f3d');
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.8, 2.2), wood);
  base.position.y = 0.9;
  base.castShadow = true;
  root.add(base);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(2.55, 0.16, 2.35), mat('#68422e'));
  lid.position.y = 1.85;
  lid.castShadow = true;
  root.add(lid);
  [-0.72, 0, 0.72].forEach(x => {
    const band = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.75, 2.24), mat('#5a4a3b'));
    band.position.set(x, 0.9, 0);
    root.add(band);
  });
  root.userData.building = 'storage';
  return root;
}

export function createLamp() {
  const root = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 2.4, 8), mat('#3e4b50'));
  pole.position.y = 1.2;
  pole.castShadow = true;
  root.add(pole);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), mat('#ffd98a', 0.25));
  bulb.position.y = 2.45;
  root.add(bulb);
  const glow = new THREE.PointLight('#ffc66b', 0, 7);
  glow.position.copy(bulb.position);
  root.add(glow);
  root.userData.light = glow;
  root.userData.building = 'lamp';
  return root;
}

export function createGenerator() {
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.2, 1.2), mat('#55717a'));
  body.position.y = 0.6;
  body.castShadow = true;
  root.add(body);
  [-0.72, 0.72].forEach(x => {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 10), mat('#2d3b40'));
    wheel.position.set(x, 0.3, 0.62);
    wheel.rotation.x = Math.PI / 2;
    root.add(wheel);
  });
  root.userData.building = 'generator';
  return root;
}

export function createBattery() {
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.1, 0.8), mat('#3c6062'));
  body.position.y = 0.55;
  body.castShadow = true;
  root.add(body);
  for (const x of [-0.28, 0.28]) {
    const terminal = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.16, 8), mat('#d4ad62'));
    terminal.position.set(x, 1.16, 0);
    root.add(terminal);
  }
  root.userData.building = 'battery';
  return root;
}

export function createCable() {
  const root = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.18, 8), mat('#536c69'));
  base.position.y = 0.09;
  root.add(base);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.75, 8), mat('#9f8560'));
  pole.position.y = 0.5;
  root.add(pole);
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), mat('#d8b15e'));
  top.position.y = 0.9;
  root.add(top);
  root.userData.building = 'cable';
  return root;
}

export function createWindTurbine() {
  const root = new THREE.Group();
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 3.8, 8), mat('#d4ddd7'));
  mast.position.y = 1.9;
  mast.castShadow = true;
  root.add(mast);
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), mat('#5d6b72'));
  hub.position.set(0, 3.8, 0.15);
  root.add(hub);
  const blades = new THREE.Group();
  blades.position.set(0, 3.8, 0.22);
  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.55, 0.05), mat('#edf1ed'));
    blade.position.y = 0.78;
    blade.rotation.z = i * Math.PI * 2 / 3;
    blade.castShadow = true;
    blades.add(blade);
  }
  root.add(blades);
  root.userData.blades = blades;
  root.userData.building = 'turbine';
  return root;
}

export function createVehicle() {
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.55, 1.3), mat('#b84d3d'));
  body.position.y = 0.65;
  body.castShadow = true;
  root.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.75, 1.15), mat('#67a0aa'));
  cabin.position.set(-0.35, 1.28, 0);
  cabin.castShadow = true;
  root.add(cabin);
  const wheels: THREE.Mesh[] = [];
  [-0.78, 0.78].forEach(x => [-0.68, 0.68].forEach(z => {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.18, 10), mat('#263237'));
    wheel.position.set(x, 0.32, z);
    wheel.rotation.x = Math.PI / 2;
    wheel.castShadow = true;
    wheels.push(wheel);
    root.add(wheel);
  }));
  root.userData.wheels = wheels;
  root.userData.vehicle = true;
  return root;
}

