import sharp from 'sharp';
import { join } from 'node:path';

const directory = join('public', 'assets', 'environment', 'terrain');
const families = ['grass_ground', 'forrest_ground_01', 'coast_sand_01', 'rocky_terrain', 'park_dirt', 'snow_02'];
const size = 512;
const padding = 16;
const cell = size + padding * 2;
const width = cell * 3;
const height = cell * 2;
const color = Buffer.alloc(width * height * 3);
const surface = Buffer.alloc(width * height * 3);

async function pixels(family, channel) {
  return sharp(join(directory, `${family}_${channel}_1k.jpg`))
    .resize(size, size).removeAlpha().toColourspace('srgb').raw().toBuffer();
}

for (const [index, family] of families.entries()) {
  const [diffuse, normal, roughness] = await Promise.all([
    pixels(family, 'diff'), pixels(family, 'nor_gl'), pixels(family, 'rough'),
  ]);
  const material = Buffer.alloc(size * size * 3);
  for (let i = 0; i < material.length; i += 3) {
    material[i] = normal[i];
    material[i + 1] = normal[i + 1];
    material[i + 2] = roughness[i + 1];
  }
  for (const [atlas, source] of [[color, diffuse], [surface, material]]) {
    for (let y = 0; y < cell; y++) {
      const sourceY = (y + size - padding) % size;
      const sourceRow = sourceY * size * 3;
      const destination = ((Math.floor(index / 3) * cell + y) * width + (index % 3) * cell) * 3;
      source.copy(atlas, destination, sourceRow + (size - padding) * 3, sourceRow + size * 3);
      source.copy(atlas, destination + padding * 3, sourceRow, sourceRow + size * 3);
      source.copy(atlas, destination + (padding + size) * 3, sourceRow, sourceRow + padding * 3);
    }
  }
}

for (const [name, data] of [['color', color], ['surface', surface]]) {
  await sharp(data, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
    .toFile(join(directory, `terrain_${name}_atlas.jpg`));
}
