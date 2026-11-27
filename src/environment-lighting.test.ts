import { describe, expect, it } from 'vitest';
import { atmosphericFogRange, environmentLighting } from './environment-lighting';

describe('environment lighting', () => {
  it('makes midnight much darker than noon without eliminating moonlight', () => {
    const noon = environmentLighting(720, 'Clear');
    const night = environmentLighting(0, 'Clear');
    expect(night.hemisphere).toBeLessThan(noon.hemisphere / 3);
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

  it('gradually blends the streamed horizon and respects weather and user limits', () => {
    const clear = atmosphericFogRange(42, 92, 1, 'medium', 'Clear', 1, 0);
    expect(clear.far).toBe(36);
    expect(clear.near).toBeLessThan(clear.far * 0.7);
    expect(atmosphericFogRange(42, 92, 1, 'medium', 'Rain', 1, 0).far).toBeLessThan(clear.far);
    expect(atmosphericFogRange(12, 60, 3, 'medium', 'Clear', 1, 0).near).toBe(12);
    const rain = atmosphericFogRange(42, 50, 3, 'medium', 'Rain', 1, 0);
    const storm = atmosphericFogRange(42, 50, 3, 'medium', 'Storm', 1, 0);
    expect(storm.far).toBeLessThan(rain.far);
    expect(storm.near).toBeLessThan(storm.far);
    expect(atmosphericFogRange(42, 50, 3, 'medium', 'Clear', 1, 1200).far)
      .toBeGreaterThan(atmosphericFogRange(42, 50, 3, 'medium', 'Clear', 1, 0).far);
    expect(atmosphericFogRange(42, 50, 3, 'medium', 'Clear', 0, 0).far)
      .toBeLessThan(atmosphericFogRange(42, 50, 3, 'medium', 'Clear', 1, 0).far);
  });
});
