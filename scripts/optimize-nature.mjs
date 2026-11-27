import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, simplifyPrimitive, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const [input, output, targetText, errorText, nodeName, alphaPath, alphaMaterialName] = process.argv.slice(2);
const target = Number(targetText);
const error = Number(errorText);
if (!input || !output || !Number.isInteger(target) || target <= 0
  || !Number.isFinite(error) || error < 0) {
  throw new Error('Usage: node scripts/optimize-nature.mjs input.gltf output.glb target-triangles-per-material error [node-name|-] [alpha-image] [alpha-material]');
}

await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read(input);
if (nodeName && nodeName !== '-') {
  const scene = document.getRoot().getDefaultScene();
  if (!scene) throw new Error('Model has no default scene');
  const node = scene.listChildren().find(child => child.getName() === nodeName);
  if (!node) throw new Error(`Missing model node: ${nodeName}`);
  for (const child of scene.listChildren()) if (child !== node) scene.removeChild(child);
  node.setTranslation([0, 0, 0]);
}
if (alphaPath) {
  const materials = document.getRoot().listMaterials();
  const masked = materials.filter(item => item.getAlphaMode() !== 'OPAQUE');
  const material = alphaMaterialName ? materials.find(item => item.getName() === alphaMaterialName)
    : materials.length === 1 ? materials[0] : masked.length === 1 ? masked[0] : undefined;
  if (!material) throw new Error('Expected one foliage material for the alpha-masked asset');
  const texture = material.getBaseColorTexture();
  const image = texture?.getImage();
  if (!texture || !image) throw new Error('Missing base color texture');
  const alpha = await sharp(alphaPath).greyscale().raw().toBuffer({ resolveWithObject: true });
  const color = await sharp(image).removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
  if (color.info.width !== alpha.info.width || color.info.height !== alpha.info.height || color.info.channels !== 3) {
    throw new Error('Color and alpha textures must have matching RGB dimensions');
  }
  // Extend blade colors into transparent pixels to prevent black mipmap fringes.
  const count = alpha.info.width * alpha.info.height;
  const visited = new Uint8Array(count);
  const queue = new Uint32Array(count);
  let head = 0, tail = 0;
  for (let i = 0; i < count; i++) {
    if (alpha.data[i] >= 128) { visited[i] = 1; queue[tail++] = i; }
  }
  if (!tail) throw new Error('Alpha texture contains no opaque pixels');
  while (head < tail) {
    const index = queue[head++];
    const x = index % alpha.info.width;
    for (const neighbor of [x > 0 ? index - 1 : -1, x + 1 < alpha.info.width ? index + 1 : -1,
      index >= alpha.info.width ? index - alpha.info.width : -1,
      index + alpha.info.width < count ? index + alpha.info.width : -1]) {
      if (neighbor < 0 || visited[neighbor]) continue;
      visited[neighbor] = 1;
      for (let channel = 0; channel < 3; channel++) color.data[neighbor * 3 + channel] = color.data[index * 3 + channel];
      queue[tail++] = neighbor;
    }
  }
  const rgba = await sharp(color.data, { raw: color.info }).joinChannel(alpha.data, {
    raw: { width: alpha.info.width, height: alpha.info.height, channels: 1 },
  }).png().toBuffer();
  texture.setImage(rgba).setMimeType('image/png');
  material.setAlphaMode('MASK').setAlphaCutoff(0.15);
}
await document.transform(prune(), dedup(), weld());
for (const mesh of document.getRoot().listMeshes()) {
  for (const primitive of mesh.listPrimitives()) {
    const material = primitive.getMaterial()?.getName();
    if (material === 'tree_small_02_leaves' || material === 'fir_sapling_twigs' || material === 'pine_sapling_small_twig' || material === 'pine_tree_01_twig'
      || material === 'grass_medium_02' || material === 'fern_02' || material === 'shrub_03') {
      if (material === 'tree_small_02_leaves') primitive.getMaterial().setAlphaMode('MASK').setAlphaCutoff(0.35);
      reduceLeafClusters(primitive, material === 'fir_sapling_twigs' || material === 'pine_sapling_small_twig' || material === 'pine_tree_01_twig',
        material === 'grass_medium_02' || material === 'fern_02' || material === 'shrub_03', material === 'pine_tree_01_twig');
      continue;
    }
    const triangles = Math.floor((primitive.getIndices()?.getCount() ?? 0) / 3);
    if (triangles > target) {
      simplifyPrimitive(primitive, { simplifier: MeshoptSimplifier, ratio: target / triangles, error });
    }
  }

  function reduceLeafClusters(primitive, conifer, plant, adultConifer = false) {
    const index = primitive.getIndices()?.getArray();
    const position = primitive.getAttribute('POSITION')?.getArray();
    if (!(index instanceof Uint32Array || index instanceof Uint16Array) || !(position instanceof Float32Array)) {
      throw new Error('Expected indexed foliage geometry with float positions');
    }
    const parent = new Int32Array(position.length / 3);
    for (let i = 0; i < parent.length; i++) parent[i] = i;
    const find = value => {
      while (parent[value] !== value) {
        parent[value] = parent[parent[value]];
        value = parent[value];
      }
      return value;
    };
    for (let i = 0; i < index.length; i += 3) {
      const root = find(index[i]);
      parent[find(index[i + 1])] = root;
      parent[find(index[i + 2])] = root;
    }
    const clusters = new Map();
    for (let i = 0; i < index.length; i += 3) {
      const root = find(index[i]);
      let triangles = clusters.get(root);
      if (!triangles) { triangles = []; clusters.set(root, triangles); }
      triangles.push(index[i], index[i + 1], index[i + 2]);
    }
    const semantics = primitive.listSemantics();
    const attributes = semantics.map(name => primitive.getAttribute(name));
    const positionAttribute = semantics.indexOf('POSITION');
    const output = semantics.map(() => []);
    const outputIndex = [];
    let selected = 0;
    for (const [root, triangles] of clusters) {
      const hash = Math.imul(root ^ (root >>> 16), 0x45d9f3b) >>> 0;
      const structural = conifer && triangles.length / 3 >= 30;
      const keepModulo = adultConifer ? 16 : 4;
      if (!plant && hash % keepModulo !== 0) continue;
      selected++;
      const local = new Map();
      const vertices = [];
      const localIndex = new Uint32Array(triangles.length);
      for (let i = 0; i < triangles.length; i++) {
        const original = triangles[i];
        let n = local.get(original);
        if (n === undefined) { n = vertices.length; vertices.push(original); local.set(original, n); }
        localIndex[i] = n;
      }
      const localPosition = new Float32Array(vertices.length * 3);
      const center = [0, 0, 0];
      vertices.forEach((original, i) => {
        for (let axis = 0; axis < 3; axis++) {
          const value = position[original * 3 + axis];
          localPosition[i * 3 + axis] = value;
          center[axis] += value / vertices.length;
        }
      });
      const desired = plant ? Math.max(3, Math.floor(triangles.length * target / index.length / 3) * 3)
        : adultConifer ? structural ? 24 : 12 : structural ? 90 : 12;
      const [reduced] = MeshoptSimplifier.simplify(localIndex, localPosition, 3,
        Math.min(desired, localIndex.length), 0.5);
      const remap = new Map();
      for (const localVertex of reduced) {
        let mapped = remap.get(localVertex);
        if (mapped === undefined) {
          mapped = output[positionAttribute].length / 3;
          remap.set(localVertex, mapped);
          const original = vertices[localVertex];
          attributes.forEach((attribute, n) => {
            const array = attribute.getArray();
            const size = attribute.getElementSize();
            for (let axis = 0; axis < size; axis++) {
              const value = array[original * size + axis];
              output[n].push(semantics[n] === 'POSITION' && !structural && !plant
                ? center[axis] + (value - center[axis]) * (conifer ? 1.8 : 2.2) : value);
            }
          });
        }
        outputIndex.push(mapped);
      }
    }
    if (!outputIndex.length) throw new Error('Broadleaf foliage conversion produced no triangles');
    const buffer = document.getRoot().listBuffers()[0];
    attributes.forEach((attribute, i) => {
      const ArrayType = attribute.getArray().constructor;
      const result = document.createAccessor(semantics[i]).setType(attribute.getType())
        .setBuffer(buffer).setArray(new ArrayType(output[i])).setNormalized(attribute.getNormalized());
      primitive.setAttribute(semantics[i], result);
    });
    primitive.setIndices(document.createAccessor('leaf-indices').setType('SCALAR')
      .setBuffer(buffer).setArray(new Uint32Array(outputIndex)));
    console.log(`Preserved ${selected} of ${clusters.size} leaf clusters`);
  }
}
await document.transform(prune());
await io.write(output, document);
for (const mesh of document.getRoot().listMeshes()) {
  for (const primitive of mesh.listPrimitives()) {
    console.log(`${mesh.getName()}: ${Math.floor((primitive.getIndices()?.getCount() ?? 0) / 3)} triangles`);
  }
}
