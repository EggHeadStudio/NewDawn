import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { simplify } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: node scripts/optimize-vinish-animal.mjs input.glb output.glb');
const hash = createHash('sha256').update(await readFile(input)).digest('hex');
const sources = new Set([
  '2e5b0ed56d93d700d17dc080693bd148d5019baac1d723a346a3fad2c0f8a99c',
  'cd9f5d6d49dd736cc4b4557321e2b529dfcd041068a70c63b22432b2c7127d14',
  '8dd80eabb177228760d63f8abf0f2b71064d0fa252e980f3dbeb37f339663538',
]);
if (!sources.has(hash)) {
  throw new Error(`Unexpected vinish.dev animal source SHA-256: ${hash}`);
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read(input);
await document.transform(simplify({ simplifier: MeshoptSimplifier, ratio: 0.18, error: 0.02 }));
for (const animation of document.getRoot().listAnimations()) animation.setName(animation.getName().toLowerCase());
await io.write(output, document);
