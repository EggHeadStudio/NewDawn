import { describe, expect, it } from 'vitest';
import { renderPixelRatio } from './render-quality';

describe('render resolution', () => {
  it('limits high-density touch devices by quality rather than orientation', () => {
    expect(renderPixelRatio('low', true, 3)).toBe(1);
    expect(renderPixelRatio('medium', true, 3)).toBe(1.25);
    expect(renderPixelRatio('high', true, 3)).toBe(1.5);
  });

  it('preserves lower native ratios and bounds desktop rendering', () => {
    expect(renderPixelRatio('high', true, 1)).toBe(1);
    expect(renderPixelRatio('low', false, 2)).toBe(1.25);
    expect(renderPixelRatio('medium', false, 2)).toBe(1.75);
  });
});
