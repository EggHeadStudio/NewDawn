import { describe, expect, it } from 'vitest';
import { atmosphericFogRange, environmentLighting, moonlitSceneLighting } from './environment-lighting';

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
    expect(clear.moonlight).toBeGreaterThan(clear.hemisphere);
    expect(clear.moonlight).toBeLessThan(environmentLighting(720, 'Clear').sunlight);
    expect(environmentLighting(720, 'Clear').moonlight).toBe(0);
    expect(environmentLighting(0, 'Cloudy').moonlight).toBeLessThan(clear.moonlight);
    expect(environmentLighting(0, 'Storm').hemisphere).toBeLessThan(environmentLighting(0, 'Cloudy').hemisphere);
    expect(environmentLighting(0, 'Storm').hemisphere).toBeGreaterThan(0.09);
    expect(environmentLighting(0, 'Snow').hemisphere).toBeGreaterThan(clear.hemisphere);
  });

  it('transitions continuously through dawn, sunset and midnight', () => {
    for (const boundary of [0, 360, 720, 1080, 1440]) {
      const before = environmentLighting(boundary - 0.01, 'Clear');
      const after = environmentLighting(boundary + 0.01, 'Clear');
      for (const key of ['daylight', 'twilight', 'sunlight', 'hemisphere', 'moonlight', 'starlight', 'skyBrightness'] as const) {
        expect(Math.abs(after[key] - before[key])).toBeLessThan(0.001);
      }
    }
  });

  it('adds moonlit fill only when the moon is illuminated and above the horizon', () => {
    const clear = environmentLighting(0, 'Clear');
    const dark = moonlitSceneLighting(clear, 0, 1);
    const below = moonlitSceneLighting(clear, 1, -0.1);
    const full = moonlitSceneLighting(clear, 1, 1);
    expect(dark).toEqual({ moonlight: 0, hemisphere: clear.hemisphere + clear.starlight });
    expect(below).toEqual(dark);
    expect(full.hemisphere).toBeGreaterThan(dark.hemisphere);
    expect(moonlitSceneLighting(clear, 0.5, 1).hemisphere).toBeGreaterThan(dark.hemisphere);
    expect(moonlitSceneLighting(clear, 0.5, 1).hemisphere).toBeLessThan(full.hemisphere);
    expect(moonlitSceneLighting(clear, 1, 0.04).hemisphere).toBeGreaterThan(dark.hemisphere);
    expect(moonlitSceneLighting(clear, 1, 0.04).hemisphere).toBeLessThan(full.hemisphere);
    const storm = environmentLighting(0, 'Storm');
    expect(moonlitSceneLighting(storm, 1, 1).hemisphere - storm.hemisphere)
      .toBeLessThan(full.hemisphere - clear.hemisphere);
    const noon = environmentLighting(720, 'Clear');
    expect(moonlitSceneLighting(noon, 1, 1).hemisphere).toBe(noon.hemisphere);
  });

  it('keeps moonless nights navigable without brightening moonlit nights or daytime', () => {
    const clear = environmentLighting(0, 'Clear');
    const moonless = moonlitSceneLighting(clear, 0, 1).hemisphere;
    expect(moonless).toBeGreaterThan(clear.hemisphere * 2);
    expect(moonlitSceneLighting(clear, 1, 1).hemisphere).toBe(clear.hemisphere + 2 * clear.moonlight);
    expect(moonless).toBeLessThan(moonlitSceneLighting(clear, 1, 1).hemisphere / 2);
    expect(environmentLighting(0, 'Storm').starlight).toBeLessThan(environmentLighting(0, 'Cloudy').starlight);
    expect(environmentLighting(0, 'Cloudy').starlight).toBeLessThan(clear.starlight);
    expect(environmentLighting(720, 'Clear').starlight).toBe(0);
  });

  it('keeps a weather-dimmed visibility floor in moonless storms without changing full-moon light', () => {
    const storm = environmentLighting(0, 'Storm');
    const clear = environmentLighting(0, 'Clear');
    const stormNight = moonlitSceneLighting(storm, 0, 1).hemisphere;
    expect(stormNight).toBeGreaterThan(storm.hemisphere * 3);
    expect(stormNight).toBeLessThan(moonlitSceneLighting(clear, 0, 1).hemisphere);
    expect(moonlitSceneLighting(storm, 1, 1).hemisphere).toBe(storm.hemisphere + 2 * storm.moonlight);
    expect(environmentLighting(720, 'Storm').starlight).toBe(0);
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
