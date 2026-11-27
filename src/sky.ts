import * as THREE from 'three';
import type { Weather } from './calendar';

const TAU = Math.PI * 2;

/** Local solar time; +x is east and +z is north in the projected world. */
export function solarDirection(minutes: number, day: number, latitude: number) {
  const lat = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(latitude, -90, 90));
  const declination = THREE.MathUtils.degToRad(23.44) * Math.sin(TAU * (day - 80) / 365);
  const hour = TAU * (minutes / 1440 - 0.5);
  return new THREE.Vector3(
    -Math.cos(declination) * Math.sin(hour),
    Math.sin(lat) * Math.sin(declination) + Math.cos(lat) * Math.cos(declination) * Math.cos(hour),
    Math.cos(lat) * Math.sin(declination) - Math.sin(lat) * Math.cos(declination) * Math.cos(hour),
  ).normalize();
}

export function lunarPhase(day: number) {
  const phase = ((day - 1) % 29.5 + 29.5) % 29.5 / 29.5;
  return { phase, illumination: (1 - Math.cos(TAU * phase)) / 2 };
}

export function celestialState(minutes: number, day: number, latitude: number) {
  const lunar = lunarPhase(day);
  return {
    sun: solarDirection(minutes, day, latitude),
    moon: solarDirection(minutes - lunar.phase * 1440, day, latitude),
    illumination: lunar.illumination,
  };
}

const vertexShader = `
varying vec3 skyDirection;
void main() {
  skyDirection = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const fragmentShader = `
uniform vec3 horizon;
uniform vec3 zenith;
uniform vec3 sunDirection;
uniform vec3 moonDirection;
uniform float daylight;
uniform float twilight;
uniform float cloudiness;
uniform float drift;
uniform float moonPhase;
varying vec3 skyDirection;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x), f.y);
}
void main() {
  vec3 direction = normalize(skyDirection);
  float height = max(direction.y, 0.0);
  vec3 color = mix(horizon, zenith, pow(height, 0.55));
  if (daylight < 0.35) {
    float night = (1.0 - smoothstep(0.02, 0.35, daylight))
      * smoothstep(0.0, 0.1, direction.y);
    float moonGlare = moonPhase * smoothstep(-0.02, 0.15, moonDirection.y);
    vec2 starGrid = vec2(atan(direction.z, direction.x) / 6.2831853,
      asin(clamp(direction.y, -1.0, 1.0)) / 3.1415927) * vec2(300.0, 150.0);
    vec2 starCell = floor(starGrid);
    float starSeed = hash(starCell);
    vec2 starCenter = 0.15 + 0.7 * vec2(hash(starCell + 17.3), hash(starCell + 93.7));
    float starDistance = length(fract(starGrid) - starCenter);
    float starWidth = clamp(length(vec2(fwidth(starGrid.x), fwidth(starGrid.y))) * 0.5, 0.015, 0.15);
    float star = (1.0 - smoothstep(0.06, 0.06 + starWidth, starDistance))
      * step(0.97, starSeed) * (0.25 + 0.75 * hash(starCell + 46.2));
    float band = exp(-pow(dot(direction, normalize(vec3(0.35, 0.6, 0.72))) / 0.13, 2.0));
    float bandTexture = 0.35 + 0.65 * noise(direction.xz * 11.0 + direction.y * 7.0);
    color += night * (1.0 - moonGlare * 0.65)
      * (vec3(0.7, 0.8, 1.0) * star * 0.7 + vec3(0.025, 0.035, 0.05) * band * bandTexture);
  }
  float sunDot = max(dot(direction, sunDirection), 0.0);
  float sunAbove = smoothstep(-0.02, 0.04, sunDirection.y);
  color += vec3(1.0, 0.52, 0.22) * pow(sunDot, 28.0) * (0.18 + twilight * 0.22) * sunAbove;
  float sunDisc = smoothstep(0.9997, 0.99985, sunDot) * sunAbove;
  color = mix(color, vec3(1.0, 0.87, 0.63) * 2.0, sunDisc);
  vec3 moonRight = normalize(cross(vec3(0.0, 1.0, 0.001), moonDirection));
  vec3 moonUp = cross(moonDirection, moonRight);
  vec2 moonUV = vec2(dot(direction, moonRight), dot(direction, moonUp)) / 0.018;
  float moonRadius = dot(moonUV, moonUV);
  float moonDisc = (1.0 - smoothstep(0.85, 1.0, moonRadius))
    * smoothstep(0.0, 0.03, moonDirection.y) * (1.0 - daylight);
  float limb = sqrt(max(0.0, 1.0 - moonUV.y * moonUV.y));
  float lit = smoothstep(-0.05, 0.05, moonUV.x + (moonPhase * 2.0 - 1.0) * limb);
  color = mix(color, vec3(0.76, 0.82, 0.9), moonDisc * lit);
  vec2 cloudUV = direction.xz / max(direction.y + 0.22, 0.25) * 2.5 + vec2(drift, drift * 0.35);
  float cloudNoise = noise(cloudUV) * 0.65 + noise(cloudUV * 2.4 + 19.0) * 0.35;
  float cloud = smoothstep(0.76 - cloudiness * 0.35, 0.86 - cloudiness * 0.35, cloudNoise);
  cloud *= smoothstep(-0.02, 0.12, direction.y);
  vec3 cloudColor = mix(vec3(0.055, 0.075, 0.12), vec3(0.92, 0.94, 0.91), daylight);
  cloudColor *= 1.0 - cloudiness * 0.32;
  color = mix(color, cloudColor, cloud * 0.82);
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Sky {
  private readonly uniforms = {
    horizon: { value: new THREE.Color() },
    zenith: { value: new THREE.Color() },
    sunDirection: { value: new THREE.Vector3() },
    moonDirection: { value: new THREE.Vector3() },
    daylight: { value: 0 },
    twilight: { value: 0 },
    cloudiness: { value: 0.2 },
    drift: { value: 0 },
    moonPhase: { value: 0 },
  };
  private readonly mesh: THREE.Mesh;
  private readonly dayZenith = new THREE.Color('#407ea8');
  private readonly nightZenith = new THREE.Color('#081222');

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader, fragmentShader, side: THREE.BackSide,
      depthWrite: false, depthTest: false, fog: false,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    scene.add(this.mesh);
  }

  update(camera: THREE.Vector3, celestial: ReturnType<typeof celestialState>,
    daylight: number, twilight: number, horizon: THREE.Color, weather: Weather, wind: number, dt: number) {
    this.mesh.position.copy(camera);
    this.uniforms.sunDirection.value.copy(celestial.sun);
    this.uniforms.moonDirection.value.copy(celestial.moon);
    this.uniforms.moonPhase.value = celestial.illumination;
    this.uniforms.daylight.value = daylight;
    this.uniforms.twilight.value = twilight;
    this.uniforms.horizon.value.copy(horizon);
    this.uniforms.zenith.value.lerpColors(this.nightZenith, this.dayZenith, daylight);
    const cloud = weather === 'Storm' ? 1 : weather === 'Rain' ? 0.85
      : weather === 'Snow' ? 0.8 : weather === 'Cloudy' ? 0.7 : 0.2;
    this.uniforms.cloudiness.value = THREE.MathUtils.damp(this.uniforms.cloudiness.value, cloud, 0.35, dt);
    this.uniforms.drift.value = (this.uniforms.drift.value + dt * Math.min(1.6, wind) * 0.012) % 1000;
  }
}
