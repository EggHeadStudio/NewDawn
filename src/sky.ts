import * as THREE from 'three';
import type { Weather } from './calendar';
import type { VegetationQuality } from './vegetation-lod';

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
uniform samplerCube cloudMap;
uniform float volumeClouds;
uniform sampler2D moonSurface;
uniform float moonSurfaceReady;
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
    vec3 axis = abs(direction);
    vec3 normal, right, up;
    float face, projection;
    if (axis.y >= axis.x && axis.y >= axis.z) {
      normal = vec3(0.0, sign(direction.y), 0.0);
      right = vec3(1.0, 0.0, 0.0); up = vec3(0.0, 0.0, 1.0);
      face = direction.y > 0.0 ? 0.0 : 1.0; projection = axis.y;
    } else if (axis.x >= axis.z) {
      normal = vec3(sign(direction.x), 0.0, 0.0);
      right = vec3(0.0, 1.0, 0.0); up = vec3(0.0, 0.0, 1.0);
      face = direction.x > 0.0 ? 2.0 : 3.0; projection = axis.x;
    } else {
      normal = vec3(0.0, 0.0, sign(direction.z));
      right = vec3(1.0, 0.0, 0.0); up = vec3(0.0, 1.0, 0.0);
      face = direction.z > 0.0 ? 4.0 : 5.0; projection = axis.z;
    }
    vec2 starGrid = (vec2(dot(direction, right), dot(direction, up)) / projection * 0.5 + 0.5) * 90.0;
    vec2 starCell = floor(starGrid);
    vec2 seed = starCell + face * vec2(113.0, 157.0);
    float starSeed = hash(seed);
    vec2 starCenter = 0.15 + 0.7 * vec2(hash(seed + 17.3), hash(seed + 93.7));
    vec2 center = (starCell + starCenter) / 90.0 * 2.0 - 1.0;
    vec3 starDirection = normalize(normal + right * center.x + up * center.y);
    float starDistance = length(direction - starDirection);
    float starWidth = max(length(fwidth(direction)) * 0.5, 0.00005);
    float star = (1.0 - smoothstep(0.0012, 0.0012 + starWidth, starDistance))
      * step(0.97, starSeed) * (0.25 + 0.75 * hash(seed + 46.2));
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
  vec2 towardSun = vec2(dot(sunDirection, moonRight), dot(sunDirection, moonUp));
  float sunProjection = length(towardSun);
  towardSun = sunProjection > 0.0001 ? towardSun / sunProjection : vec2(1.0, 0.0);
  float phaseCosine = moonPhase * 2.0 - 1.0;
  float surfaceTowardCamera = sqrt(max(0.0, 1.0 - moonRadius));
  float illumination = dot(moonUV, towardSun) * sqrt(max(0.0, 1.0 - phaseCosine * phaseCosine))
    + phaseCosine * surfaceTowardCamera;
  float lit = smoothstep(-0.05, 0.05, illumination);
  vec3 moonColor = vec3(0.76, 0.82, 0.9);
  if (moonDisc > 0.0 && moonSurfaceReady > 0.5) {
    vec2 surfaceUV = vec2(0.5 - atan(moonUV.x, surfaceTowardCamera) / 6.28318530718,
      0.5 + asin(clamp(moonUV.y, -1.0, 1.0)) / 3.14159265359);
    moonColor *= 0.5 + texture2D(moonSurface, surfaceUV).r;
  }
  color = mix(color, moonColor, moonDisc * lit);
  if (volumeClouds > 0.5) {
    vec4 cloudSample = textureCube(cloudMap, direction);
    color = color * (1.0 - cloudSample.a) + cloudSample.rgb;
  } else {
    vec2 cloudUV = direction.xz / max(direction.y + 0.22, 0.25) * 2.5 + vec2(drift, drift * 0.35);
    float cloudNoise = noise(cloudUV) * 0.65 + noise(cloudUV * 2.4 + 19.0) * 0.35;
    float cloud = smoothstep(0.76 - cloudiness * 0.35, 0.86 - cloudiness * 0.35, cloudNoise);
    cloud *= smoothstep(-0.02, 0.12, direction.y);
    vec3 cloudColor = mix(vec3(0.055, 0.075, 0.12), vec3(0.92, 0.94, 0.91), daylight);
    cloudColor *= 1.0 - cloudiness * 0.32;
    float cloudOpacity = mix(0.82, 1.0, smoothstep(0.7, 1.0, cloudiness));
    color = mix(color, cloudColor, cloud * cloudOpacity);
  }
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #ifdef TONE_MAPPING
    // Fog uses the unlit horizon color; match it below the horizon without flattening the upper sky.
    vec3 fogHorizon = linearToOutputTexel(vec4(horizon, 1.0)).rgb;
    vec3 mappedHorizon = linearToOutputTexel(vec4(toneMapping(horizon), 1.0)).rgb;
    gl_FragColor.rgb += (fogHorizon - mappedHorizon) * (1.0 - smoothstep(0.0, 0.12, direction.y));
  #endif
}`;

const cloudVolumeFragmentShader = `
uniform vec3 sunDirection;
uniform vec3 moonDirection;
uniform float daylight;
uniform float twilight;
uniform float moonPhase;
uniform float cloudiness;
uniform float drift;
varying vec3 skyDirection;

float cloudHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float cloudNoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(cloudHash(i), cloudHash(i + vec3(1, 0, 0)), f.x),
        mix(cloudHash(i + vec3(0, 1, 0)), cloudHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(cloudHash(i + vec3(0, 0, 1)), cloudHash(i + vec3(1, 0, 1)), f.x),
        mix(cloudHash(i + vec3(0, 1, 1)), cloudHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float cloudProfile(float height) {
  float y = (height - 1.0) / 0.8;
  return smoothstep(0.0, 0.18, y) * (1.0 - smoothstep(0.58, 1.0, y));
}
vec3 cloudCoordinates(vec3 p) {
  vec3 q = p * vec3(6.0, 4.8, 6.0);
  q.xz += vec2(13.71 + drift, 41.27 + drift * 0.35);
  return q;
}
float cloudDensity(vec3 p) {
  vec3 q = cloudCoordinates(p);
  float field = cloudNoise(q) * 0.52 + cloudNoise(q * 2.03 + 19.0) * 0.28
    + cloudNoise(q * 4.09 + 47.0) * 0.14 + cloudNoise(q * 8.31 + 73.0) * 0.06;
  return max(0.0, field - mix(0.68, 0.32, cloudiness)) * cloudProfile(p.y) * 10.0;
}
float lightTransmission(vec3 p, vec3 lightDirection) {
  p += lightDirection * 0.25;
  float density = max(0.0, cloudNoise(cloudCoordinates(p)) - mix(0.68, 0.32, cloudiness))
    * cloudProfile(p.y) * 10.0;
  return exp(-density * 1.7);
}
void main() {
  vec3 direction = normalize(skyDirection);
  gl_FragColor = vec4(0.0);
  if (direction.y > 0.0) {
    float transmission = 1.0;
    vec3 scattering = vec3(0.0);
    float moonLight = moonPhase * smoothstep(-0.02, 0.15, moonDirection.y);
    vec3 ambient = mix(vec3(0.015, 0.022, 0.035) * (0.25 + 0.75 * moonLight),
      vec3(0.36, 0.4, 0.46), daylight);
    vec3 directSun = mix(vec3(0.78, 0.8, 0.77), vec3(1.0, 0.57, 0.32), twilight * 0.65) * daylight;
    vec3 directMoon = vec3(0.05, 0.07, 0.105) * moonLight * (1.0 - daylight);
    for (int stepIndex = 0; stepIndex < 8; stepIndex++) {
      float sampleHeight = 1.0 + 0.8 * (float(stepIndex) + 0.5) / 8.0;
      vec3 p = direction * (sampleHeight / max(direction.y, 0.06));
      float density = cloudDensity(p);
      float sunLight = daylight > 0.001 ? lightTransmission(p, sunDirection) : 0.0;
      float moonFill = daylight < 0.999 && moonLight > 0.001 ? lightTransmission(p, moonDirection) : 0.0;
      float alpha = 1.0 - exp(-density * 0.8 / max(direction.y, 0.1));
      scattering += transmission * alpha * (ambient + directSun * sunLight + directMoon * moonFill)
        * mix(1.0, 0.62, smoothstep(0.6, 1.0, cloudiness));
      transmission *= 1.0 - alpha;
    }
    float horizonFade = smoothstep(0.0, 0.12, direction.y);
    gl_FragColor = vec4(scattering * horizonFade, (1.0 - transmission) * horizonFade);
  }
}`;

export class Sky {
  private readonly cloudMap: { value: THREE.CubeTexture | null } = { value: null };
  private readonly moonMap: { value: THREE.Texture | null } = { value: null };
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
    cloudMap: this.cloudMap,
    volumeClouds: { value: 0 },
    moonSurface: this.moonMap,
    moonSurfaceReady: { value: 0 },
  };
  private readonly mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly cloudScene = new THREE.Scene();
  private readonly cloudMaterial: THREE.ShaderMaterial;
  private cloudTarget?: THREE.WebGLCubeRenderTarget;
  private cloudCamera?: THREE.CubeCamera;
  private cloudElapsed = Infinity;
  private moonLoading?: Promise<void>;
  private disposed = false;
  private readonly invalidateClouds = () => {
    this.cloudElapsed = Infinity;
    this.uniforms.volumeClouds.value = 0;
  };
  private readonly dayZenith = new THREE.Color('#407ea8');
  private readonly nightZenith = new THREE.Color('#081222');

  constructor(scene: THREE.Scene, private readonly renderer: THREE.WebGLRenderer) {
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader, fragmentShader, side: THREE.BackSide,
      depthWrite: false, depthTest: false, fog: false,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    scene.add(this.mesh);
    this.cloudMaterial = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader, fragmentShader: cloudVolumeFragmentShader,
      side: THREE.BackSide, depthWrite: false, depthTest: false, toneMapped: false,
    });
    this.cloudScene.add(new THREE.Mesh(this.mesh.geometry, this.cloudMaterial));
    renderer.domElement.addEventListener('webglcontextrestored', this.invalidateClouds);
  }

  setQuality(quality: VegetationQuality) {
    if (quality === 'low') {
      this.uniforms.volumeClouds.value = 0;
      this.cloudMap.value = null;
      this.cloudTarget?.dispose();
      this.cloudTarget = undefined;
      this.cloudCamera = undefined;
    } else if (!this.cloudTarget) {
      this.cloudTarget = new THREE.WebGLCubeRenderTarget(256, {
        depthBuffer: false, generateMipmaps: false,
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      });
      this.cloudMap.value = this.cloudTarget.texture;
      this.cloudCamera = new THREE.CubeCamera(0.1, 200, this.cloudTarget);
      this.invalidateClouds();
    }
  }

  loadMoonSurface() {
    this.moonLoading ??= new THREE.TextureLoader()
      .loadAsync(`${import.meta.env.BASE_URL}assets/environment/sky/moon.jpg`)
      .then(texture => {
        if (this.disposed) { texture.dispose(); return; }
        texture.colorSpace = THREE.SRGBColorSpace;
        this.moonMap.value = texture;
        this.uniforms.moonSurfaceReady.value = 1;
      });
    return this.moonLoading;
  }

  dispose() {
    this.disposed = true;
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.invalidateClouds);
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.cloudMaterial.dispose();
    this.cloudTarget?.dispose();
    this.moonMap.value?.dispose();
    this.moonMap.value = null;
    this.uniforms.moonSurfaceReady.value = 0;
    this.cloudScene.clear();
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
    this.cloudElapsed += dt;
    if (this.cloudCamera && this.cloudElapsed >= 0.2) {
      // Cache the expensive volume, not the full-resolution stars or celestial discs.
      this.cloudCamera.update(this.renderer, this.cloudScene);
      this.cloudElapsed = 0;
      this.uniforms.volumeClouds.value = 1;
    }
  }
}
