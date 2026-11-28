import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { dedup, prune, simplifyPrimitive, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: node scripts/optimize-backpack.mjs input.glb output.glb');
const source = await readFile(input);
const hash = createHash('sha256').update(source).digest('hex');
if (hash !== '3818afef88e666b6ab0bf147b05748dba91fe45bac7c69ac93213beead84c87e') {
  throw new Error(`Unexpected backpack source SHA-256: ${hash}`);
}

await MeshoptSimplifier.ready;
const io = new NodeIO();
const document = await io.read(input);
for (const texture of document.getRoot().listTextures()) {
  const image = texture.getImage();
  if (!image) throw new Error(`Missing backpack texture: ${texture.getName()}`);
  const resized = sharp(image).resize(512, 512);
  if (texture.getName() === 'diffuse') {
    const { data, info } = await resized.removeAlpha().raw().toBuffer({ resolveWithObject: true });
    if (info.channels !== 3) throw new Error('Expected an RGB backpack color map');
    for (let i = 0; i < data.length; i += 3) {
      const [red, green, blue] = [data[i], data[i + 1], data[i + 2]];
      const amount = Math.max(0, Math.min(1, (red - Math.max(green, blue) - 15) / 40))
        * Math.max(0, Math.min(1, (red - 40) / 40));
      const luminance = red * 0.3 + green * 0.59 + blue * 0.11;
      data[i] = red * (1 - amount) + luminance * 1.22 * amount;
      data[i + 1] = green * (1 - amount) + luminance * 1.08 * amount;
      data[i + 2] = blue * (1 - amount) + luminance * 0.83 * amount;
    }
    texture.setImage(await sharp(data, { raw: info }).jpeg({ quality: 88, chromaSubsampling: '4:4:4' }).toBuffer());
  } else {
    texture.setImage(await resized.jpeg({ quality: 88, chromaSubsampling: '4:4:4' }).toBuffer());
  }
  texture.setMimeType('image/jpeg');
}
await document.transform(weld());
for (const mesh of document.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
  const indices = primitive.getIndices();
  if (!indices) throw new Error('Backpack geometry has no indices');
  const triangles = indices.getCount() / 3;
  if (triangles > 7000) simplifyPrimitive(primitive, { simplifier: MeshoptSimplifier, ratio: 7000 / triangles, error: 0.02 });
}
await document.transform(prune(), dedup());
await io.write(output, document);
