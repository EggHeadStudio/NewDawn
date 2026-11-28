import * as THREE from 'three';
import type { Season, Weather } from './calendar';
import type { Biome } from './world';

export const MAX_FOOTPRINTS = 64;

type Surface = 'snow' | 'sand' | 'mud' | 'soil' | 'rock';
type Print = { x: number; z: number; y: number; heading: number; normal: THREE.Vector3; age: number; duration: number; opacity: number };

const surfaces: Record<Surface, { color: string; opacity: number; duration: number }> = {
  snow: { color: '#656d70', opacity: 0.48, duration: 32 },
  sand: { color: '#806343', opacity: 0.55, duration: 26 },
  mud: { color: '#51422e', opacity: 0.55, duration: 24 },
  soil: { color: '#46573b', opacity: 0.3, duration: 16 },
  rock: { color: '#59615e', opacity: 0.13, duration: 9 },
};

export function footprintSurface(biome: Biome, season: Season, weather: Weather, height: number): Surface | undefined {
  if (biome === 'ocean' || height <= 0.1) return undefined;
  if (biome === 'snow' || (season === 'Winter' && height > 0.45)) return 'snow';
  if (biome === 'beach' || biome === 'desert') return 'sand';
  if (biome === 'rock') return 'rock';
  return weather === 'Rain' || weather === 'Storm' ? 'mud' : 'soil';
}

function bootGeometry() {
  const sole = new THREE.Shape();
  sole.moveTo(-0.055, -0.07);
  sole.lineTo(-0.065, 0.07);
  sole.quadraticCurveTo(-0.065, 0.15, 0, 0.16);
  sole.quadraticCurveTo(0.065, 0.15, 0.065, 0.07);
  sole.lineTo(0.055, -0.07);
  sole.closePath();
  const heel = new THREE.Shape();
  heel.moveTo(-0.05, -0.09);
  heel.lineTo(-0.05, -0.15);
  heel.quadraticCurveTo(0, -0.17, 0.05, -0.15);
  heel.lineTo(0.05, -0.09);
  heel.closePath();
  const positions: number[] = [];
  const edges: number[] = [];
  const indices: number[] = [];
  for (const shape of [sole, heel]) {
    const points = shape.getPoints(4);
    if (points[0].equals(points[points.length - 1])) points.pop();
    if (!THREE.ShapeUtils.isClockWise(points)) points.reverse();
    const center = points.reduce((sum, point) => sum.add(point), new THREE.Vector2()).divideScalar(points.length);
    const base = positions.length / 3;
    positions.push(center.x, 0, -center.y);
    edges.push(1);
    for (const point of points) {
      const inner = center.clone().lerp(point, 0.72);
      positions.push(inner.x, 0, -inner.y, point.x, 0, -point.y);
      edges.push(1, 0);
    }
    for (let i = 0; i < points.length; i++) {
      const inner = base + 1 + i * 2;
      const outer = inner + 1;
      const nextInner = base + 1 + ((i + 1) % points.length) * 2;
      const nextOuter = nextInner + 1;
      indices.push(base, nextInner, inner, inner, nextInner, outer, outer, nextInner, nextOuter);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('footprintEdge', new THREE.Float32BufferAttribute(edges, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export class Footprints {
  readonly mesh: THREE.InstancedMesh;
  private readonly alpha = new THREE.InstancedBufferAttribute(new Float32Array(MAX_FOOTPRINTS), 1);
  private readonly prints: Array<Print | undefined> = Array(MAX_FOOTPRINTS);
  private readonly transform = new THREE.Object3D();
  private readonly yaw = new THREE.Quaternion();
  private readonly origin = new THREE.Vector3();
  private last?: { x: number; z: number };
  private distance = 0;
  private next = 0;
  private side = 1;

  constructor(scene: THREE.Scene) {
    const geometry = bootGeometry();
    geometry.setAttribute('footprintAlpha', this.alpha);
    // Multiplication preserves the terrain's lighting instead of brightening shaded prints.
    const material = new THREE.MeshBasicMaterial({
      color: '#ffffff', transparent: true, depthWrite: false,
      blending: THREE.MultiplyBlending, premultipliedAlpha: true, fog: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    material.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float footprintAlpha;\nattribute float footprintEdge;\nvarying float vFootprintAlpha;\nvarying float vFootprintEdge;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFootprintAlpha = footprintAlpha;\nvFootprintEdge = footprintEdge;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vFootprintAlpha;\nvarying float vFootprintEdge;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vFootprintAlpha * vFootprintEdge;');
    };
    material.customProgramCacheKey = () => 'footprint-opacity-v3';
    this.mesh = new THREE.InstancedMesh(geometry, material, MAX_FOOTPRINTS);
    this.mesh.name = 'footprints';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  get activeCount() { return this.prints.filter(Boolean).length; }

  update(dt: number, position: { x: number; z: number }, canPrint: boolean,
    surfaceAt: (x: number, z: number) => Surface | undefined, heightAt: (x: number, z: number) => number) {
    let active = false;
    let alphaChanged = false;
    let colorChanged = false;
    for (let index = 0; index < MAX_FOOTPRINTS; index++) {
      const print = this.prints[index];
      if (!print) continue;
      print.age += dt;
      alphaChanged = true;
      if (print.age >= print.duration) {
        this.prints[index] = undefined;
        this.alpha.setX(index, 0);
      } else {
        this.alpha.setX(index, print.opacity * Math.min(1, (print.duration - print.age) / 5));
        active = true;
      }
    }

    if (this.last && canPrint) {
      const dx = position.x - this.last.x;
      const dz = position.z - this.last.z;
      const length = Math.hypot(dx, dz);
      if (length <= 5 && length > 0.00001) {
        const heading = Math.atan2(dx, dz);
        const spacing = 0.75;
        let traveled = spacing - this.distance;
        while (traveled <= length) {
          const x = this.last.x + dx * traveled / length + Math.cos(heading) * this.side * 0.12;
          const z = this.last.z + dz * traveled / length - Math.sin(heading) * this.side * 0.12;
          const surface = surfaceAt(x, z);
          if (surface) {
            const profile = surfaces[surface];
            const y = heightAt(x, z);
            const normal = new THREE.Vector3(heightAt(x - 0.1, z) - heightAt(x + 0.1, z), 0.2,
              heightAt(x, z - 0.1) - heightAt(x, z + 0.1)).normalize();
            this.prints[this.next] = { x, y, z, heading, normal, age: 0, ...profile };
            this.mesh.setColorAt(this.next, new THREE.Color(profile.color));
            colorChanged = true;
            this.setMatrix(this.next);
            this.alpha.setX(this.next, profile.opacity);
            alphaChanged = true;
            this.next = (this.next + 1) % MAX_FOOTPRINTS;
            this.side *= -1;
            active = true;
          }
          traveled += spacing;
        }
        this.distance = (this.distance + length) % spacing;
      } else if (length > 5) this.distance = 0;
    } else this.distance = 0;
    this.last = { x: position.x, z: position.z };

    if (Math.hypot(position.x - this.origin.x, position.z - this.origin.z) > 24) {
      this.origin.set(position.x, 0, position.z);
      this.mesh.position.copy(this.origin);
      for (let index = 0; index < MAX_FOOTPRINTS; index++) if (this.prints[index]) this.setMatrix(index);
    }
    this.mesh.visible = active;
    if (alphaChanged) this.alpha.needsUpdate = true;
    if (colorChanged && this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private setMatrix(index: number) {
    const print = this.prints[index];
    if (!print) return;
    this.transform.position.set(print.x - this.origin.x, print.y + 0.025, print.z - this.origin.z);
    this.transform.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), print.normal);
    this.yaw.setFromAxisAngle(new THREE.Vector3(0, 1, 0), print.heading + Math.PI);
    this.transform.quaternion.multiply(this.yaw);
    this.transform.updateMatrix();
    this.mesh.setMatrixAt(index, this.transform.matrix);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  reset() {
    this.prints.fill(undefined);
    this.alpha.array.fill(0);
    this.alpha.needsUpdate = true;
    this.mesh.visible = false;
    this.last = undefined;
    this.distance = 0;
    this.next = 0;
    this.side = 1;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
