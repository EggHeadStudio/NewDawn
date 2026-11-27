import * as THREE from 'three';
import type { Weather } from './calendar';
import type { ShelterIndex } from './shelter';

type ImpactKind = 'wood' | 'stone' | 'soil' | 'food' | 'build' | 'damage';
type Particle = { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number; duration: number };

export class Effects {
  private readonly particles: Particle[] = [];
  private readonly geometries = {
    wood: new THREE.BoxGeometry(0.23, 0.055, 0.035),
    stone: new THREE.DodecahedronGeometry(0.09, 0),
    soil: new THREE.DodecahedronGeometry(0.07, 0),
    food: new THREE.PlaneGeometry(0.12, 0.06),
    dust: new THREE.IcosahedronGeometry(0.18, 1),
    damage: new THREE.IcosahedronGeometry(0.06, 0),
  };
  private readonly materials = {
    wood: new THREE.MeshStandardMaterial({ color: '#b98a53' }),
    stone: new THREE.MeshStandardMaterial({ color: '#b0aaa0' }),
    soil: new THREE.MeshStandardMaterial({ color: '#79634c' }),
    food: new THREE.MeshStandardMaterial({ color: '#728b4e', side: THREE.DoubleSide }),
    build: new THREE.MeshStandardMaterial({ color: '#efd29a' }),
    damage: new THREE.MeshStandardMaterial({ color: '#d8c3a9' }),
    dust: new THREE.MeshBasicMaterial({ color: '#b2a791', transparent: true, opacity: 0.3, depthWrite: false }),
  };
  private focus: THREE.Vector3 | null = null;
  private wind = 0;
  private quality: 'low' | 'medium' | 'high' = 'medium';
  lastImpact: ImpactKind | null = null;

  constructor(private readonly scene: THREE.Scene) {
    for (let i = 0; i < 64; i++) {
      const mesh = new THREE.Mesh(this.geometries.stone, this.materials.stone);
      mesh.visible = false;
      this.scene.add(mesh);
      this.particles.push({ mesh, velocity: new THREE.Vector3(), life: 0, duration: 0 });
    }
  }

  get activeCount() { return this.particles.filter(particle => particle.life > 0).length; }

  burst(position: THREE.Vector3, kind: ImpactKind) {
    if (this.focus && this.focus.distanceToSquared(position) > 45 ** 2) return;
    const limit = this.quality === 'low' ? 4 : this.quality === 'high' ? 12 : 8;
    let emitted = 0;
    for (const particle of this.particles) {
      if (particle.life > 0) continue;
      if (emitted >= limit) break;
      const dust = kind !== 'damage' && emitted % 3 === 0;
      const geometry = dust ? this.geometries.dust : this.geometries[kind === 'build' ? 'wood' : kind];
      const mesh = particle.mesh;
      mesh.geometry = geometry;
      mesh.material = dust ? this.materials.dust : this.materials[kind];
      mesh.position.copy(position);
      mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
      mesh.scale.setScalar(dust ? 0.5 : 0.7 + Math.random() * 0.6);
      mesh.visible = true;
      particle.velocity.set((Math.random() - 0.5) * (dust ? 0.6 : 2),
        (dust ? 0.3 : 1) + Math.random() * (dust ? 0.5 : 1.5),
        (Math.random() - 0.5) * (dust ? 0.6 : 2));
      particle.duration = dust ? 0.65 : 0.45 + Math.random() * 0.3;
      particle.life = particle.duration;
      emitted++;
    }
    if (emitted) this.lastImpact = kind;
  }

  update(dt: number, focus?: THREE.Vector3, wind = 0, quality: 'low' | 'medium' | 'high' = 'medium') {
    this.focus = focus ?? null;
    this.wind = Math.max(0, Math.min(1.6, wind));
    this.quality = quality;
    for (const p of this.particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      const dust = p.mesh.geometry === this.geometries.dust;
      p.velocity.y -= (dust ? 0.3 : 5) * dt;
      p.velocity.x += this.wind * (dust ? 0.4 : 0.12) * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.rotation.x += dt * 4;
      if (dust) p.mesh.scale.setScalar((0.5 + (1 - p.life / p.duration)) * Math.min(1, Math.max(0, p.life / 0.2)));
      if (p.life <= 0) {
        p.life = 0;
        p.mesh.visible = false;
      }
    }
  }

  reset() {
    this.lastImpact = null;
    for (const particle of this.particles) {
      particle.life = 0;
      particle.mesh.visible = false;
    }
  }

  dispose() {
    this.reset();
    for (const particle of this.particles) this.scene.remove(particle.mesh);
    Object.values(this.geometries).forEach(geometry => geometry.dispose());
    Object.values(this.materials).forEach(material => material.dispose());
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
