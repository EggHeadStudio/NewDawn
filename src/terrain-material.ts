import * as THREE from 'three';

export class TerrainTextures {
  readonly color: THREE.Texture;
  readonly surface: THREE.Texture;

  constructor() {
    const loader = new THREE.TextureLoader();
    const load = (name: string, fallback: string) => {
      const path = `${import.meta.env.BASE_URL}assets/environment/terrain/terrain_${name}_atlas.jpg`;
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Unable to create terrain fallback texture');
      context.fillStyle = fallback;
      context.fillRect(0, 0, 1, 1);
      const texture = new THREE.CanvasTexture(canvas);
      const pending = loader.load(path, loaded => {
        texture.dispose();
        texture.image = loaded.image;
        texture.needsUpdate = true;
        loaded.dispose();
      }, undefined, error => {
        console.error(`Failed to load terrain texture ${path}`, error);
        pending.dispose();
      });
      return texture;
    };
    this.color = load('color', '#82946d');
    this.color.colorSpace = THREE.SRGBColorSpace;
    this.surface = load('surface', '#8080cc');
  }

  get ready() {
    return this.color.image instanceof HTMLImageElement && this.surface.image instanceof HTMLImageElement;
  }

  dispose() {
    this.color.dispose();
    this.surface.dispose();
  }
}

export function createTerrainMaterial(textures: TerrainTextures, origin: THREE.Vector2, reflected: boolean) {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1, map: textures.color,
    normalMap: textures.surface, roughnessMap: textures.surface,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.terrainOrigin = { value: origin };
    shader.uniforms.terrainDirection = { value: reflected ? -1 : 1 };
    shader.uniforms.terrainColorAtlas = { value: textures.color };
    shader.uniforms.terrainSurfaceAtlas = { value: textures.surface };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform vec2 terrainOrigin;
        uniform float terrainDirection;
        attribute vec4 terrainBlend;
        varying vec2 terrainCoordinate;
        varying vec4 terrainWeights;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        terrainCoordinate = position.xz * vec2(1.0, terrainDirection) + terrainOrigin;
        terrainWeights = vec4(terrainBlend.xy, terrainBlend.z,
          max(terrainBlend.w, smoothstep(0.35, 0.72, 1.0 - normal.y)));`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec2 terrainCoordinate;
        varying vec4 terrainWeights;
        uniform sampler2D terrainColorAtlas;
        uniform sampler2D terrainSurfaceAtlas;
        vec3 terrainSample(sampler2D atlas, vec2 uv, vec2 tile) {
          vec2 atlasSize = vec2(1632.0, 1088.0);
          vec2 point = (vec2(tile.x, 1.0 - tile.y) * 544.0 + 16.0 + fract(uv) * 512.0) / atlasSize;
          vec2 scale = vec2(512.0) / atlasSize;
          return textureGrad(atlas, point, dFdx(uv) * scale, dFdy(uv) * scale).rgb;
        }`)
      .replace('#include <map_fragment>', '')
      .replace('#include <color_fragment>', `
        float rock = clamp(terrainWeights.w, 0.0, 1.0);
        float sand = clamp(terrainWeights.y, 0.0, 1.0) * (1.0 - rock);
        float forest = clamp(terrainWeights.x, 0.0, 1.0) * (1.0 - rock - sand);
        float snow = clamp(terrainWeights.z, 0.0, 1.0) * (1.0 - rock * 0.45);
        float pattern = sin(terrainCoordinate.x * 0.130899694) * cos(terrainCoordinate.y * 0.130899694);
        float dirt = smoothstep(0.25, 0.8, pattern) * 0.3 * (1.0 - rock - sand - forest) * (1.0 - snow);
        vec4 weights = vec4(1.0 - rock - sand - forest, forest, sand, rock) * (1.0 - snow);
        weights.x -= dirt;
        vec2 terrainUv = terrainCoordinate / 3.0;
        vec3 groundColor = terrainSample(terrainColorAtlas, terrainUv, vec2(0, 0)) * weights.x
          + terrainSample(terrainColorAtlas, terrainUv, vec2(1, 0)) * weights.y
          + terrainSample(terrainColorAtlas, terrainUv, vec2(2, 0)) * weights.z
          + terrainSample(terrainColorAtlas, terrainUv, vec2(0, 1)) * weights.w
          + terrainSample(terrainColorAtlas, terrainUv, vec2(1, 1)) * dirt
          + terrainSample(terrainColorAtlas, terrainUv, vec2(2, 1)) * snow;
        diffuseColor.rgb *= groundColor * mix(vec3(1.0), vColor, 0.25);`)
      .replace('#include <roughnessmap_fragment>', `
        vec3 surface0 = terrainSample(terrainSurfaceAtlas, terrainUv, vec2(0, 0));
        vec3 surface1 = terrainSample(terrainSurfaceAtlas, terrainUv, vec2(1, 0));
        vec3 surface2 = terrainSample(terrainSurfaceAtlas, terrainUv, vec2(2, 0));
        vec3 surface3 = terrainSample(terrainSurfaceAtlas, terrainUv, vec2(0, 1));
        vec3 surface4 = terrainSample(terrainSurfaceAtlas, terrainUv, vec2(1, 1));
        vec3 surface5 = terrainSample(terrainSurfaceAtlas, terrainUv, vec2(2, 1));
        vec3 surface = surface0 * weights.x + surface1 * weights.y
          + surface2 * weights.z + surface3 * weights.w + surface4 * dirt + surface5 * snow;
        float roughnessFactor = roughness * surface.b;`)
      .replace('#include <normal_fragment_maps>', `
        vec2 normalXY = (surface.rg * 2.0 - 1.0) * 0.65;
        vec3 terrainNormal = vec3(normalXY, sqrt(max(1.0 - dot(normalXY, normalXY), 0.0)));
        mat3 terrainTbn = getTangentFrame(-vViewPosition, normal, terrainUv);
        normal = normalize(terrainTbn * terrainNormal);`);
  };
  return material;
}
