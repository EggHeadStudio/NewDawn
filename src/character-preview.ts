import * as THREE from 'three';
import { createCharacter } from './assets';
import type { CharacterAppearance } from './appearance';
import { attachAuthoredCharacter, updateAuthoredCharacter } from './authored-character';
import { disposeCharacter } from './characters';

function disposeModel(model: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  model.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object.userData.authoredShared) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
}

export class CharacterPreview {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(35, 1, 0.1, 30);
  private model: THREE.Group | undefined;
  private angle = 0;
  private pointer: { id: number; x: number } | undefined;
  private lastTime = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera.position.set(0, 1.3, 4.5);
    this.camera.lookAt(0, 1.0, 0);
    this.scene.add(new THREE.HemisphereLight('#e9f4f2', '#47604c', 2));
    const light = new THREE.DirectionalLight('#fff0ce', 2.4);
    light.position.set(3, 5, 4);
    this.scene.add(light);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1, 0.12, 32), new THREE.MeshStandardMaterial({ color: '#49655c' }));
    base.position.y = -0.07;
    this.scene.add(base);
    canvas.addEventListener('pointerdown', event => {
      this.pointer = { id: event.pointerId, x: event.clientX };
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', event => {
      if (this.pointer?.id !== event.pointerId) return;
      this.angle += (event.clientX - this.pointer.x) * 0.015;
      this.pointer.x = event.clientX;
    });
    canvas.addEventListener('pointerup', () => { this.pointer = undefined; });
    canvas.addEventListener('pointercancel', () => { this.pointer = undefined; });
  }

  setAppearance(appearance: CharacterAppearance) {
    if (this.model) {
      this.scene.remove(this.model);
      disposeCharacter(this.model);
    }
    this.model = createCharacter(appearance);
    attachAuthoredCharacter(this.model, appearance, error => {
      console.error('Could not load authored character preview', error);
    });
    this.scene.add(this.model);
  }

  rotate(amount: number) { this.angle += amount; }

  render(time: number) {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    if (this.canvas.width !== Math.round(width * this.renderer.getPixelRatio())
      || this.canvas.height !== Math.round(height * this.renderer.getPixelRatio())) {
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
    if (this.model) {
      this.model.rotation.y = this.angle;
      const dt = this.lastTime ? Math.min((time - this.lastTime) / 1000, 0.1) : 0;
      if (!updateAuthoredCharacter(this.model, dt, 0, false, undefined, false)) {
        const torso = this.model.getObjectByName('torso');
        if (torso) torso.scale.y = 1 + Math.sin(time * 0.002) * 0.012;
      }
    }
    this.lastTime = time;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.model) {
      this.scene.remove(this.model);
      disposeCharacter(this.model);
    }
    disposeModel(this.scene);
    this.renderer.dispose();
  }
}
