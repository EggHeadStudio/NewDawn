import sharp from 'sharp';
import { expect, it } from 'vitest';

it('packs each terrain family and periodic borders into the correct atlas tile', async () => {
  const directory = 'public/assets/environment/terrain';
  const families = ['grass_ground', 'forrest_ground_01', 'coast_sand_01', 'rocky_terrain', 'park_dirt', 'snow_02'];
  const [color, surface] = await Promise.all(['color', 'surface'].map(name =>
    sharp(`${directory}/terrain_${name}_atlas.jpg`).raw().toBuffer()));
  const pixel = (buffer: Uint8Array, width: number, x: number, y: number) => {
    const index = (y * width + x) * 3;
    return [...buffer.subarray(index, index + 3)];
  };
  const close = (actual: number[], expected: number[]) =>
    actual.forEach((value, channel) => expect(Math.abs(value - expected[channel])).toBeLessThan(30));
  for (const [index, family] of families.entries()) {
    const maps = await Promise.all(['diff', 'nor_gl', 'rough'].map(channel =>
      sharp(`${directory}/${family}_${channel}_1k.jpg`).resize(512, 512).removeAlpha().toColourspace('srgb').raw().toBuffer()));
    const x = 173, y = 287;
    const ox = index % 3 * 544 + 16, oy = Math.floor(index / 3) * 544 + 16;
    close(pixel(color, 1632, ox + x, oy + y), pixel(maps[0], 512, x, y));
    const normal = pixel(maps[1], 512, x, y);
    const rough = pixel(maps[2], 512, x, y);
    close(pixel(surface, 1632, ox + x, oy + y), [normal[0], normal[1], rough[1]]);
    close(pixel(color, 1632, ox - 8, oy + y), pixel(color, 1632, ox + 504, oy + y));
    close(pixel(surface, 1632, ox + x, oy - 8), pixel(surface, 1632, ox + x, oy + 504));
  }
});
