import * as THREE from 'three';
import type { Weather } from './calendar';
import type { ShelterIndex } from './shelter';

type Particle = { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number };

export class Effects {
  private readonly particles: Particle[] = [];
  private readonly geometry = new THREE.BoxGeometry(0.13, 0.13, 0.13);
  private readonly materials = {
    wood: new THREE.MeshStandardMaterial({ color: '#b98a53' }),
    stone: new THREE.MeshStandardMaterial({ color: '#b0aaa0' }),
    food: new THREE.MeshStandardMaterial({ color: '#cb7470' }),
    build: new THREE.MeshStandardMaterial({ color: '#efd29a' }),
    damage: new THREE.MeshStandardMaterial({ color: '#ef8d76' }),
  };
  constructor(private readonly scene: THREE.Scene) {}

  burst(position: THREE.Vector3, kind: keyof Effects['materials']) {
    for (let i = 0; i < 8 && this.particles.length < 64; i++) {
      const mesh = new THREE.Mesh(this.geometry, this.materials[kind]);
      mesh.position.copy(position).add(new THREE.Vector3(0, 0.6, 0));
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity: new THREE.Vector3((Math.random() - 0.5) * 2.5, 1 + Math.random() * 2, (Math.random() - 0.5) * 2.5),
        life: 0.65 + Math.random() * 0.35,
      });
    }
  }

  update(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.velocity.y -= 5 * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.rotation.x += dt * 4;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
      }
    }
  }

  shift(dx: number, dz: number) {
    for (const particle of this.particles) {
      particle.mesh.position.x += dx;
      particle.mesh.position.z += dz;
    }
  }
}

export class Precipitation {
  private readonly points: THREE.Points;
  private readonly positions = new Float32Array(150 * 3);
  private readonly visibility = new Float32Array(150).fill(1);
  private weather: Weather = 'Clear';

  constructor(scene: THREE.Scene) {
    for (let i = 0; i < this.positions.length; i += 3) {
      this.positions[i] = (Math.random() - 0.5) * 24;
      this.positions[i + 1] = Math.random() * 14;
      this.positions[i + 2] = (Math.random() - 0.5) * 24;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('particleVisibility', new THREE.BufferAttribute(this.visibility, 1));
    const material = new THREE.PointsMaterial({ color: '#e2eff1', size: 0.09, transparent: true, opacity: 0.8, depthWrite: false });
    material.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float particleVisibility;\nvarying float weatherVisibility;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nweatherVisibility = particleVisibility;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float weatherVisibility;')
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (weatherVisibility < 0.5) discard;');
    };
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.visible = false;
    scene.add(this.points);
  }

  update(weather: Weather, focus: THREE.Vector3, dt: number, shelter?: ShelterIndex) {
    if (weather !== this.weather) {
      this.weather = weather;
      const material = this.points.material as THREE.PointsMaterial;
      material.size = weather === 'Snow' ? 0.16 : 0.09;
    }
    this.points.visible = weather === 'Rain' || weather === 'Snow' || weather === 'Storm';
    if (!this.points.visible) return;
    this.points.position.set(focus.x, focus.y, focus.z);
    for (let i = 1; i < this.positions.length; i += 3) {
      this.positions[i] -= dt * (weather === 'Snow' ? 1.5 : 10);
      if (this.positions[i] < 0) this.positions[i] += 14;
      this.visibility[(i - 1) / 3] = shelter?.coverAt(focus.x + this.positions[i - 1], focus.y + this.positions[i], focus.z + this.positions[i + 1]) ? 0 : 1;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.particleVisibility.needsUpdate = true;
  }
}
