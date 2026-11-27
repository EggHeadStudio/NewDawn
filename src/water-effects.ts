import * as THREE from 'three';

type Splash = {
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  drops: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  age: number;
  active: boolean;
  entry: boolean;
};

export class WaterEffects {
  private readonly splashes: Splash[] = [];
  private next = 0;
  private readonly ringGeometry = new THREE.RingGeometry(0.7, 1, 24);

  constructor(scene: THREE.Scene, capacity = 8) {
    for (let i = 0; i < capacity; i++) {
      const ring = new THREE.Mesh(this.ringGeometry, new THREE.MeshBasicMaterial({
        color: '#c4eff0', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
      }));
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24), 3));
      const drops = new THREE.Points(geometry, new THREE.PointsMaterial({
        color: '#d9f7f5', size: 0.1, transparent: true, opacity: 0, depthWrite: false,
      }));
      drops.visible = false;
      scene.add(ring, drops);
      this.splashes.push({ ring, drops, age: 0, active: false, entry: false });
    }
  }

  get activeCount() { return this.splashes.filter(splash => splash.active).length; }

  emit(x: number, z: number, entry: boolean) {
    const splash = this.splashes[this.next];
    this.next = (this.next + 1) % this.splashes.length;
    splash.age = 0;
    splash.active = true;
    splash.entry = entry;
    splash.ring.position.set(x, -0.065, z);
    splash.drops.position.set(x, -0.065, z);
    splash.ring.visible = true;
    splash.drops.visible = entry;
    this.refresh(splash);
  }

  update(dt: number) {
    for (const splash of this.splashes) {
      if (!splash.active) continue;
      splash.age += dt;
      if (splash.age >= 1) {
        splash.active = false;
        splash.ring.visible = false;
        splash.drops.visible = false;
      } else {
        this.refresh(splash);
      }
    }
  }

  private refresh(splash: Splash) {
    const age = splash.age;
    splash.ring.scale.setScalar(0.2 + age * (splash.entry ? 1.3 : 0.8));
    splash.ring.material.opacity = (1 - age) * 0.7;
    splash.drops.material.opacity = Math.max(0, 0.9 - age * 1.4);
    const positions = splash.drops.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      const angle = i * Math.PI * 2 / positions.count;
      const distance = age * (0.65 + (i % 3) * 0.1);
      positions.setXYZ(i, Math.cos(angle) * distance,
        Math.max(0, age * (2.1 + (i % 3) * 0.2) - 3.8 * age * age), Math.sin(angle) * distance);
    }
    positions.needsUpdate = true;
  }
}
