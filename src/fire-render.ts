import * as THREE from 'three';

const handRotation = new THREE.Quaternion();

function flame() {
  const group = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.38, 7),
    new THREE.MeshBasicMaterial({ color: '#ff9d3e', transparent: true, opacity: 0.85, depthWrite: false }));
  outer.position.y = 0.17;
  const core = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.25, 7),
    new THREE.MeshBasicMaterial({ color: '#ffe6a0' }));
  core.position.y = 0.1;
  group.add(outer, core);
  return group;
}

export function createHandTorch() {
  const group = new THREE.Group();
  group.name = 'hand-torch';
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.028, 0.58, 8),
    new THREE.MeshStandardMaterial({ color: '#745038', roughness: 1 }));
  shaft.position.y = 0.12;
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.06, 0.16, 8),
    new THREE.MeshStandardMaterial({ color: '#473429', roughness: 1 }));
  head.position.y = 0.45;
  const fire = flame();
  fire.position.y = 0.52;
  const light = new THREE.PointLight('#ffad57', 0, 9, 2);
  light.position.y = 0.66;
  group.add(shaft, head, fire, light);
  return { group, fire, light };
}

export function attachHandTorch(character: THREE.Group, torch: THREE.Group) {
  const authored = character.getObjectByName('authored-character');
  const hand = authored?.getObjectByName('hand_l') ?? character.getObjectByName('elbowL');
  if (!hand) return;
  if (torch.parent !== hand) {
    hand.add(torch);
    torch.position.set(0, authored ? 0 : -0.25, authored ? 0 : 0.06);
  }
  hand.updateWorldMatrix(true, false);
  hand.getWorldQuaternion(handRotation);
  torch.quaternion.copy(handRotation.invert());
}

export function createTorchPost() {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#70503a', roughness: 1 });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 1.65, 8), wood);
  post.position.y = 0.825;
  post.castShadow = true;
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.11, 0.16, 8),
    new THREE.MeshStandardMaterial({ color: '#493930', roughness: 0.95 }));
  bowl.position.y = 1.7;
  const fire = flame();
  fire.position.y = 1.8;
  fire.visible = false;
  fire.name = 'post-flame';
  group.add(post, bowl, fire);
  return group;
}

export class FireSparks {
  private readonly positions = new Float32Array(5 * 4 * 3);
  private readonly geometry = new THREE.BufferGeometry();
  private readonly points: THREE.Points;

  constructor(scene: THREE.Scene) {
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.points = new THREE.Points(this.geometry, new THREE.PointsMaterial({
      color: '#ffc16d', size: 0.07, transparent: true, opacity: 0.75, depthWrite: false,
    }));
    this.points.visible = false;
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  update(origins: readonly THREE.Vector3[], time: number) {
    const count = Math.min(5, origins.length);
    this.points.visible = count > 0;
    this.geometry.setDrawRange(0, count * 4);
    for (let source = 0; source < count; source++) {
      for (let spark = 0; spark < 4; spark++) {
        const phase = (time * 0.7 + spark * 0.25 + source * 0.13) % 1;
        const offset = (source * 4 + spark) * 3;
        this.positions[offset] = origins[source].x + Math.sin(spark * 8 + time * 2) * phase * 0.12;
        this.positions[offset + 1] = origins[source].y + phase * 0.6;
        this.positions[offset + 2] = origins[source].z + Math.cos(spark * 7 + time * 2) * phase * 0.12;
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
  }
}
