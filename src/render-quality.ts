import type { VegetationQuality } from './vegetation-lod';

export function renderPixelRatio(quality: VegetationQuality, coarsePointer: boolean, deviceRatio: number) {
  const maximum = coarsePointer
    ? { low: 1, medium: 1.25, high: 1.5 }[quality]
    : { low: 1.25, medium: 1.75, high: 1.75 }[quality];
  return Math.min(deviceRatio, maximum);
}
