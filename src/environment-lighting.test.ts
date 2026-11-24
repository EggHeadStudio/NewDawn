import { describe, expect, it } from 'vitest';
import { environmentLighting } from './environment-lighting';

describe('environment lighting', () => {
  it('makes midnight much darker than noon without eliminating moonlight', () => {
    const noon = environmentLighting(720, 'Clear');
    const night = environmentLighting(0, 'Clear');
    expect(night.hemisphere).toBeLessThan(noon.hemisphere / 6);
    expect(night.moonlight).toBeGreaterThan(0);
    expect(night.sunlight).toBe(0);
    expect(night.skyBrightness).toBeLessThan(noon.skyBrightness / 10);
  });

  it('reduces moonlight in cloud and storm and reflects more from snow', () => {
    const clear = environmentLighting(0, 'Clear');
    expect(environmentLighting(0, 'Cloudy').moonlight).toBeLessThan(clear.moonlight);
    expect(environmentLighting(0, 'Storm').hemisphere).toBeLessThan(environmentLighting(0, 'Cloudy').hemisphere);
    expect(environmentLighting(0, 'Storm').hemisphere).toBeGreaterThan(0.09);
    expect(environmentLighting(0, 'Snow').hemisphere).toBeGreaterThan(clear.hemisphere);
  });

  it('transitions continuously through dawn, sunset and midnight', () => {
    for (const boundary of [0, 360, 720, 1080, 1440]) {
      const before = environmentLighting(boundary - 0.01, 'Clear');
      const after = environmentLighting(boundary + 0.01, 'Clear');
      for (const key of ['daylight', 'twilight', 'sunlight', 'hemisphere', 'moonlight', 'skyBrightness'] as const) {
        expect(Math.abs(after[key] - before[key])).toBeLessThan(0.001);
      }
    }
  });
});
