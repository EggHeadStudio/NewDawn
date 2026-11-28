import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, readFile, rmdir, unlink } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const sources = {
  sheep: '66176a23355581ed0e18366d6ccf53f33d1aa30c2362bb841cbac0ff295305a4',
  hare: 'acf4fda3777b4b7a7eb95c36e74f2d6e3e8ca5b38d30e549a6fc1fd06fff87bb',
  cow: '4dd5e3d6770f7c262fbe775a8c0a9e83112d9978d2349f82938fba1de58dc8db',
  crow: '8f7d6213f923e5a3e6328c2ee5d2b3c367b9a60dc694d97162dd2ac31feb7a36',
  deer: '2761025c7be21b96af5b21493c3f8765c8219938c5ba50a7cff7cf65daecdce4',
  fox: '901920897cc62ba153ffd0ba705d26f0ee0d6bca1d6f50ad7888ac8196ce5ccb',
  moose: '42540823dc064c98fc58f7d7a7166aa494d175b892b3716bfb06f24fa05a449d',
  reindeer: '81530c28c8328400d00a6a9a870eee2645c040b603d99c10610841af93e37f8c',
  birch: 'ba9ccd03ba2d0ad21f82eb6fd9934712822946b6c869069a17f3d5580b7ddedc',
};
const [kind, input, output] = process.argv.slice(2);
if (!Object.hasOwn(sources, kind) || !input || !output) {
  throw new Error('Usage: node scripts/convert-wildlife.mjs sheep|hare|cow|crow|deer|fox|moose|reindeer|birch input.glb output.glb');
}
const hash = createHash('sha256').update(await readFile(input)).digest('hex');
if (hash !== sources[kind]) throw new Error(`Unexpected ${kind} source SHA-256: ${hash}`);

const basisDir = resolve('node_modules/three/examples/jsm/libs/basis');
const temp = await mkdtemp(join(tmpdir(), 'newdawn-basis-'));
const modulePath = join(temp, 'basis-transcoder.cjs');
let basis;
let copied = false;
try {
  await copyFile(join(basisDir, 'basis_transcoder.js'), modulePath);
  copied = true;
  const loadBasis = createRequire(import.meta.url)(modulePath);
  basis = await loadBasis({ wasmBinary: await readFile(join(basisDir, 'basis_transcoder.wasm')) });
  basis.initializeBasis();
} finally {
  if (copied) await unlink(modulePath);
  await rmdir(temp);
}

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const document = await io.read(input);
for (const texture of document.getRoot().listTextures()) {
  const image = texture.getImage();
  if (!image || texture.getMimeType() !== 'image/ktx2') throw new Error(`Unexpected ${kind} texture ${texture.getName()}`);
  const file = new basis.KTX2File(image);
  try {
    const width = file.getWidth();
    const height = file.getHeight();
    if (!width || !height || !file.startTranscoding()) throw new Error(`Invalid KTX2 texture: ${texture.getName()}`);
    const pixels = new Uint8Array(file.getImageTranscodedSizeInBytes(0, 0, 0, 13));
    if (!file.transcodeImage(pixels, 0, 0, 0, 13, 0, -1, -1)) {
      throw new Error(`Could not decode texture: ${texture.getName()}`);
    }
    const converted = sharp(pixels, { raw: { width, height, channels: 4 } })
      .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true });
    if (file.getHasAlpha()) {
      texture.setImage(await converted.png().toBuffer());
      texture.setMimeType('image/png');
    } else {
      texture.setImage(await converted.removeAlpha().jpeg({ quality: 90, chromaSubsampling: '4:4:4' }).toBuffer());
      texture.setMimeType('image/jpeg');
    }
  } finally {
    file.close();
    file.delete();
  }
}
for (const extension of document.getRoot().listExtensionsUsed()) {
  if (extension.extensionName === 'KHR_texture_basisu' || extension.extensionName === 'EXT_meshopt_compression') {
    extension.dispose();
  }
}
if (kind === 'birch') {
  const branches = document.getRoot().listMaterials().find(material => material.getName() === 'birch_twig_lod1');
  if (!branches) throw new Error('Missing birch branch material');
  branches.setName('birch_branches_lod1');
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) primitive.setAttribute('_WIND', null);
  }
  await document.transform(prune());
}
await io.write(output, document);
