import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { simplify } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: node scripts/optimize-vinish-palm.mjs input.glb output.glb');
const hash = createHash('sha256').update(await readFile(input)).digest('hex');
if (hash !== '519b2ccb2cdcc823d3531fd7e2a5556315b61a7dc05366794b3d454d15967371') {
  throw new Error(`Unexpected Vinish palm source SHA-256: ${hash}`);
}
const io = new NodeIO();
const document = await io.read(input);
await document.transform(simplify({ simplifier: MeshoptSimplifier, ratio: 0.25, error: 0.02 }));
await io.write(output, document);
