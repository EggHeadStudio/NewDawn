import * as THREE from 'three';

const handRotation = new THREE.Quaternion();
const flameTime = { value: 0 };
const flameWind = { value: 0 };
let flameCount = 0;

function flame() {
  const group = new THREE.Group();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.16, 0, 0, 0.16, 0, 0, -0.16, 0.46, 0, 0.16, 0.46, 0,
    0, 0, -0.16, 0, 0, 0.16, 0, 0.46, -0.16, 0, 0.46, 0.16,
  ], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([
    0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 1, 1, 1,
  ], 2));
  geometry.setIndex([0, 1, 2, 2, 1, 3, 4, 5, 6, 6, 5, 7]);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: flameTime,
      wind: flameWind,
      phase: { value: flameCount++ * 2.7 },
      orange: { value: new THREE.Color('#e84908') },
      yellow: { value: new THREE.Color('#ff9d27') },
      core: { value: new THREE.Color('#ffe4a0') },
    },
    vertexShader: `
      uniform float time;
      uniform float wind;
      uniform float phase;
      varying vec2 flameUv;
      void main() {
        flameUv = uv;
        vec3 p = position;
        float height = uv.y * uv.y;
        p.x += height * (wind * 0.045 + sin(time * 5.3 + uv.y * 8.0 + phase) * 0.025);
        p.z += height * sin(time * 4.1 + uv.y * 7.0 + phase) * 0.018;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform float phase;
      uniform vec3 orange;
      uniform vec3 yellow;
      uniform vec3 core;
      varying vec2 flameUv;
      void main() {
        float h = flameUv.y;
        float flow = time * 6.0 + phase;
        float x = flameUv.x * 2.0 - 1.0;
        x += 0.10 * h * sin(flow + h * 12.0);
        float ripple = sin(h * 19.0 - flow) * sin(x * 8.0 + h * 11.0 - flow * 0.7);
        float width = (0.72 - h * 0.30) * pow(1.0 - h, 0.65) * (0.92 + 0.08 * ripple);
        float body = 1.0 - smoothstep(width - 0.10, width + 0.08, abs(x));
        float fork = max(0.0, sin(flow * 0.43)) * smoothstep(0.50, 0.85, h);
        body *= 1.0 - 0.8 * fork * (1.0 - smoothstep(0.03, 0.19, abs(x - 0.12 * sin(flow))));
        float tip = 1.0 - smoothstep(0.77, 1.0, h);
        float base = smoothstep(0.0, 0.06, h);
        float hot = (1.0 - smoothstep(0.10, 0.48, abs(x))) * (1.0 - smoothstep(0.20, 0.74, h));
        float brightness = clamp(0.35 + 0.16 * ripple + (1.0 - h) * 0.25, 0.0, 1.0);
        vec3 color = mix(orange, yellow, brightness);
        color = mix(color, core, hot * 0.70);
        float alpha = body * tip * base * (0.68 + hot * 0.25);
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    forceSinglePass: true,
  });
  group.add(new THREE.Mesh(geometry, material));
  return group;
}

export function updateFireAnimation(time: number, wind: number) {
  flameTime.value = time;
  flameWind.value = wind;
}

export function fireLightIntensity(time: number, phase = 0) {
  return 26 + Math.sin(time * 7.7 + phase) * 1.1
    + Math.sin(time * 13.4 + phase * 1.7) * 0.55
    + Math.sin(time * 19.1 + phase * 0.8) * 0.25;
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

export function torchFirePosition(fire: THREE.Object3D, renderOrigin: THREE.Vector3) {
  return fire.getWorldPosition(new THREE.Vector3()).add(renderOrigin);
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
  private readonly opacity = new Float32Array(5 * 4);
  private readonly geometry = new THREE.BufferGeometry();
  private readonly points: THREE.Points;

  constructor(scene: THREE.Scene) {
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('sparkOpacity', new THREE.BufferAttribute(this.opacity, 1));
    const material = new THREE.PointsMaterial({
      color: '#ffc16d', size: 0.07, transparent: true, opacity: 0.75, depthWrite: false,
    });
    material.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float sparkOpacity;\nvarying float vSparkOpacity;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSparkOpacity = sparkOpacity;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vSparkOpacity;')
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\ndiffuseColor.a *= vSparkOpacity * (1.0 - smoothstep(0.3, 0.5, length(gl_PointCoord - 0.5)));');
    };
    material.customProgramCacheKey = () => 'fire-sparks-soft-v1';
    this.points = new THREE.Points(this.geometry, material);
    this.points.visible = false;
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  update(origins: readonly THREE.Vector3[], time: number, wind = 0) {
    const count = Math.min(5, origins.length);
    this.points.visible = count > 0;
    this.geometry.setDrawRange(0, count * 4);
    if (count === 0) return;
    const origin = origins[0];
    this.points.position.copy(origin);
    for (let source = 0; source < count; source++) {
      for (let spark = 0; spark < 4; spark++) {
        const phase = (time * 0.7 + spark * 0.25 + source * 0.13) % 1;
        const offset = (source * 4 + spark) * 3;
        this.positions[offset] = origins[source].x - origin.x + Math.sin(spark * 8 + time * 2) * phase * 0.12 - wind * phase * 0.12;
        this.positions[offset + 1] = origins[source].y - origin.y + phase * 0.6;
        this.positions[offset + 2] = origins[source].z - origin.z + Math.cos(spark * 7 + time * 2) * phase * 0.12 - wind * phase * 0.04;
        this.opacity[source * 4 + spark] = Math.min(1, phase * 5, (1 - phase) * 3);
      }
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.sparkOpacity.needsUpdate = true;
  }
}

