import { describe, expect, it } from 'vitest';
import { getGraphicsPixelRatio } from '../src/render/WorldRenderer';

describe('3D drawing buffer quality', () => {
  it('reduces the drawing buffer on fast quality, including pixelated mode', () => {
    expect(getGraphicsPixelRatio(1, 1, 'low', 1280, 720)).toBe(0.75);
    expect(getGraphicsPixelRatio(2, 3, 'low', 1920, 1080)).toBe(0.75);
    expect(getGraphicsPixelRatio(0.5, 1, 'low', 1280, 720)).toBe(0.5);
  });

  it('bounds rendering work on large and ultrawide screens', () => {
    expect(getGraphicsPixelRatio(1, 1, 'low', 3840, 2160)).toBeCloseTo(1600 / 3840);
    expect(getGraphicsPixelRatio(1, 1, 'low', 3440, 1440)).toBeCloseTo(1600 / 3440);
  });

  it('preserves high and ultra pixel ratios', () => {
    expect(getGraphicsPixelRatio(2, 1, 'high', 1920, 1080)).toBe(1.5);
    expect(getGraphicsPixelRatio(3, 1, 'ultra', 1920, 1080)).toBe(2);
    expect(getGraphicsPixelRatio(2, 2, 'high', 1920, 1080)).toBe(1);
    expect(getGraphicsPixelRatio(1, 1, 'ultra', 1920, 1080)).toBe(1);
  });
});
