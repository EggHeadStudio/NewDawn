import { describe, expect, it } from 'vitest';
import { celestialState, lunarPhase, solarDirection } from './sky';

describe('celestial positions', () => {
  it('moves east to west through the local day and below the horizon at night', () => {
    expect(solarDirection(360, 80, 0).x).toBeGreaterThan(0.99);
    expect(solarDirection(720, 80, 0).y).toBeGreaterThan(0.99);
    expect(solarDirection(1080, 80, 0).x).toBeLessThan(-0.99);
    expect(solarDirection(0, 80, 0).y).toBeLessThan(-0.99);
  });

  it('reverses seasonal solar altitude between hemispheres', () => {
    expect(solarDirection(720, 172, 65).y).toBeGreaterThan(solarDirection(720, 172, -65).y);
    expect(solarDirection(720, 355, -65).y).toBeGreaterThan(solarDirection(720, 355, 65).y);
  });

  it('moves the moon from new to full and back instead of showing the same moon each night', () => {
    expect(lunarPhase(1).illumination).toBe(0);
    expect(lunarPhase(15.75).illumination).toBeCloseTo(1);
    const full = celestialState(0, 15.75, 0);
    expect(full.moon.y).toBeGreaterThan(0.9);
    expect(full.sun.y).toBeLessThan(-0.9);
    expect(lunarPhase(30.5).illumination).toBeCloseTo(0);
  });
});
