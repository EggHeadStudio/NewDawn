import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { Document, NodeIO } from '@gltf-transform/core';
import { Euler, Quaternion, Vector3 } from 'three';
import sharp from 'sharp';

const [textures, output] = process.argv.slice(2);
if (!textures || !output) {
  throw new Error('Usage: node scripts/generate-mature-fir.mjs poly-haven-fir-tree-01-1k-texture-directory output.glb');
}

// Authored whorled skeleton; the source photos are CC0 Poly Haven Fir Tree 01.
// This offline conversion does not add generation work to the game.
let seed = 1847;
const random = () => {
  seed = Math.imul(seed, 1664525) + 1013904223 | 0;
  return (seed >>> 0) / 4294967296;
};
const up = new Vector3(0, 1, 0);
const wood = { positions: [], normals: [], uvs: [], indices: [] };
const needles = { positions: [], normals: [], uvs: [], indices: [] };
const branch = (curve, radius, count, segments) => {
  const first = wood.positions.length / 3;
  const length = curve(0).distanceTo(curve(1));
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const origin = curve(t);
    const tangent = curve(Math.min(1, t + 0.001)).sub(curve(Math.max(0, t - 0.001))).normalize();
    const rotation = new Quaternion().setFromUnitVectors(up, tangent);
    for (let j = 0; j <= segments; j++) {
      const angle = j / segments * Math.PI * 2;
      const normal = new Vector3(Math.cos(angle), 0, Math.sin(angle)).applyQuaternion(rotation);
      const position = origin.clone().addScaledVector(normal, Math.max(0.001, radius * (1 - t)));
      wood.positions.push(...position);
      wood.normals.push(...normal);
      wood.uvs.push(j / segments, -t * length / Math.max(0.15, radius * Math.PI * 2));
      if (i < count && j < segments) {
        const a = first + i * (segments + 1) + j;
        const b = a + segments + 1;
        wood.indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
};
const spray = (origin, heading, size) => {
  const rotation = new Quaternion().setFromUnitVectors(up, heading.clone().normalize());
  for (const turn of [0, Math.PI / 2]) {
    const first = needles.positions.length / 3;
    const localRotation = new Quaternion().setFromEuler(new Euler(0, turn, 0));
    const normal = new Vector3(0, 0, 1).applyQuaternion(localRotation).applyQuaternion(rotation);
    for (const [x, y, u, v] of [[-0.5, 1, 0, 0], [-0.5, 0, 0, 1], [0.5, 0, 1, 1], [0.5, 1, 1, 0]]) {
      const vertex = new Vector3(x * size * 340 / 390, y * size, 0)
        .applyQuaternion(localRotation).applyQuaternion(rotation).add(origin);
      needles.positions.push(...vertex);
      needles.normals.push(...normal);
      needles.uvs.push(u, v);
    }
    needles.indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
  }
};

branch(t => new Vector3(0.045 * Math.sin(t * 3), 9 * t, 0.04 * Math.sin(t * 5)), 0.17, 18, 8);
for (let tier = 0; tier < 16; tier++) {
  const h = 1.65 + tier * 0.45;
  const remaining = (9 - h) / (9 - 1.65);
  const arms = Math.round(4 + remaining * 3);
  const azimuth = tier * 2.39996 + random() * 0.35;
  for (let arm = 0; arm < arms; arm++) {
    const angle = azimuth + arm * Math.PI * 2 / arms + (random() - 0.5) * 0.25;
    const length = 2.5 * remaining ** 0.8 * (0.8 + random() * 0.35);
    const height = h + (random() - 0.5) * 0.16;
    const outward = new Vector3(Math.cos(angle), 0, Math.sin(angle));
    const lateral = new Vector3(-Math.sin(angle), 0, Math.cos(angle));
    const curve = t => outward.clone().multiplyScalar(length * t)
      .add(new Vector3(0, height - 0.45 * remaining * Math.sin(t * Math.PI * 0.75) + 0.1 * t * t, 0))
      .addScaledVector(lateral, Math.sin(t * 3) * length * 0.025);
    branch(curve, 0.035 * remaining + 0.003, 5, 4);
    const secondaryCount = Math.round(7 + remaining * 9);
    for (let twig = 0; twig < secondaryCount; twig++) {
      const t = 0.17 + twig / secondaryCount * 0.8;
      const side = twig % 2 ? 1 : -1;
      const root = curve(t);
      const direction = outward.clone().multiplyScalar(0.45).addScaledVector(lateral, side).normalize();
      const twigLength = (0.25 + 0.68 * (1 - t)) * (0.3 + remaining * 0.7);
      const secondary = s => root.clone().addScaledVector(direction, twigLength * s)
        .add(new Vector3(0, -0.12 * Math.sin(s * Math.PI) + 0.04 * s, 0));
      branch(secondary, 0.007 * remaining + 0.001, 2, 3);
      for (let tip = 0; tip < 6; tip++) {
        const s = 0.12 + tip / 6 * 0.86;
        const origin = secondary(s);
        const heading = direction.clone().addScaledVector(outward, (random() - 0.3) * 0.8);
        heading.y = (random() - 0.5) * 0.7;
        spray(origin, heading, (0.36 + remaining * 0.25) * (0.8 + random() * 0.4));
      }
    }
  }
}

const document = new Document();
const buffer = document.createBuffer();
const scene = document.createScene('Mature fir');
document.getRoot().setDefaultScene(scene);
const checksums = {
  bark_diff: 'a5d25150ba1bee10008c039f98aa3c73b4477a404d6715c511ca9b5b0f4a9077',
  bark_nor_gl: '6a570ab53ab2249ecdfa93e7d3b9a8a2cb1a8ad391400e5a64c708914779b2c3',
  bark_arm: '95d4e9e62cd309fbc38a175e2306379c76c062425b09c0fb72c5b7356a719123',
  twig_diff: '8c0833a10e4fd44498d848cf9e659fe250a3813984cbd679f42430eb98c61fb8',
  twig_nor_gl: 'd470dc39b1d02bbeba06feb0ad818680ef3c24623b4db597270301a5fb8c9369',
  twig_arm: 'd66c81fc073ee7ea97a76b6da2399769f16944e50ef0e007f09c95619f597c79',
  twig_alpha: '3f399629337e7ac3af27a01b08ffb9c0d60224a9dd374a1427761a5c2eea9d6e',
};
const source = async name => {
  const image = await readFile(resolve(textures, `fir_tree_01_${name}_1k.${name.endsWith('alpha') ? 'png' : 'jpg'}`));
  if (createHash('sha256').update(image).digest('hex') !== checksums[name]) {
    throw new Error(`Unexpected Poly Haven source texture: ${name}`);
  }
  return image;
};
const crop = { left: 323, top: 404, width: 340, height: 390 };
const alpha = await sharp(await source('twig_alpha')).extract(crop).extractChannel(0).raw().toBuffer();
const color = await sharp(await source('twig_diff')).extract(crop).removeAlpha().raw().toBuffer({ resolveWithObject: true });

// Carry needle colors across transparent texels instead of the atlas background.
const queue = new Uint32Array(crop.width * crop.height);
const visited = new Uint8Array(queue.length);
let head = 0, tail = 0;
for (let i = 0; i < alpha.length; i++) if (alpha[i] >= 128) {
  queue[tail++] = i;
  visited[i] = 1;
}
if (!tail) throw new Error('The fir atlas crop contains no opaque needles');
while (head < tail) {
  const i = queue[head++];
  const x = i % crop.width;
  for (const next of [x > 0 ? i - 1 : -1, x + 1 < crop.width ? i + 1 : -1,
    i >= crop.width ? i - crop.width : -1, i + crop.width < alpha.length ? i + crop.width : -1]) {
    if (next < 0 || visited[next]) continue;
    visited[next] = 1;
    queue[tail++] = next;
    for (let channel = 0; channel < 3; channel++) color.data[next * 3 + channel] = color.data[i * 3 + channel];
  }
}
const image = await sharp(color.data, { raw: color.info }).joinChannel(alpha, {
  raw: { width: crop.width, height: crop.height, channels: 1 },
}).png().toBuffer();
const texture = (name, image, mime) => document.createTexture(name).setImage(image).setMimeType(mime);
const bark = document.createMaterial('fir_tree_01_bark').setMetallicFactor(0).setRoughnessFactor(1);
for (const [suffix, setter] of [['diff', 'setBaseColorTexture'], ['nor_gl', 'setNormalTexture'], ['arm', 'setMetallicRoughnessTexture']]) {
  bark[setter](texture(`bark-${suffix}`, await sharp(await source(`bark_${suffix}`)).resize(512, 512).jpeg({ quality: 90 }).toBuffer(), 'image/jpeg'));
}
const foliage = document.createMaterial('fir_tree_01_twig').setDoubleSided(true).setAlphaMode('MASK')
  .setAlphaCutoff(0.3).setMetallicFactor(0).setRoughnessFactor(1)
  .setBaseColorTexture(texture('fir-needle-sprig', image, 'image/png'))
  .setNormalTexture(texture('fir-needle-normal', await sharp(await source('twig_nor_gl')).extract(crop).jpeg({ quality: 95 }).toBuffer(), 'image/jpeg'))
  .setMetallicRoughnessTexture(texture('fir-needle-arm', await sharp(await source('twig_arm')).extract(crop).jpeg({ quality: 90 }).toBuffer(), 'image/jpeg'));
for (const [geometry, material] of [[wood, bark], [needles, foliage]]) {
  const primitive = document.createPrimitive().setMaterial(material);
  for (const [name, semantic, type] of [['positions', 'POSITION', 'VEC3'], ['normals', 'NORMAL', 'VEC3'], ['uvs', 'TEXCOORD_0', 'VEC2']]) {
    primitive.setAttribute(semantic, document.createAccessor(semantic).setType(type).setBuffer(buffer).setArray(new Float32Array(geometry[name])));
  }
  primitive.setIndices(document.createAccessor('indices').setType('SCALAR').setBuffer(buffer).setArray(new Uint32Array(geometry.indices)));
  if (geometry === wood) for (const info of [material.getBaseColorTextureInfo(), material.getNormalTextureInfo(), material.getMetallicRoughnessTextureInfo()]) {
    info.setWrapS(10497).setWrapT(10497);
  }
  scene.addChild(document.createNode(material.getName()).setMesh(document.createMesh(material.getName()).addPrimitive(primitive)));
}
await new NodeIO().write(output, document);
console.log(JSON.stringify({ output, barkTriangles: wood.indices.length / 3, foliageTriangles: needles.indices.length / 3 }));
