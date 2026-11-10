import { describe, expect, test } from 'bun:test';
import { detectSlots } from './screenshot-slots';

function frameRaster(columns: number, rows: number, clipped = false) {
  const width = 300, height = clipped ? 133 : 210;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = data[i + 1] = data[i + 2] = 28;
    data[i + 3] = 255;
  }
  // Actual raster frame edges, including the two-pixel dark inset found in game slots.
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    const left = 30 + col * 48, top = 25 + row * 48;
    for (let y = top; y < Math.min(top + 45, height); y++) for (let x = left; x < left + 45; x++) {
      const edge = x < left + 2 || x >= left + 43 || y < top + 2 || y >= top + 43;
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = edge ? 10 : 85;
    }
  }
  return { width, height, data };
}

describe('image-local slot detection', () => {
  test('rejects malformed or oversized RGBA rasters', () => {
    for (const image of [
      { width: 0, height: 1, data: new Uint8ClampedArray() },
      { width: 1.5, height: 1, data: new Uint8ClampedArray(6) },
      { width: 2001, height: 1, data: new Uint8ClampedArray(8004) },
      { width: 2, height: 2, data: new Uint8ClampedArray(4) },
    ]) expect(() => detectSlots(image)).toThrow('Invalid screenshot detection raster');
  });
  test('does not invent slots in a blank raster', () => {
    expect(detectSlots({ width: 100, height: 100, data: new Uint8ClampedArray(40000) }).panels).toEqual([]);
  });
  test('finds repeated frames without screen coordinates', () => {
    const result = detectSlots(frameRaster(4, 3));
    expect(result.panels).toHaveLength(1);
    expect(result.panels[0].columns).toBe(4);
    expect(result.panels[0].slots).toHaveLength(12);
    for (const slot of result.panels[0].slots) {
      expect(slot.x).toBeGreaterThanOrEqual(0);
      expect(slot.y).toBeGreaterThanOrEqual(0);
      expect(slot.x + slot.size).toBeLessThanOrEqual(300);
      expect(slot.y + slot.size).toBeLessThanOrEqual(210);
    }
  });
  test('excludes a clipped bottom row', () => {
    const result = detectSlots(frameRaster(4, 3, true));
    expect(result.panels).toHaveLength(1);
    expect(result.panels[0].slots).toHaveLength(8);
    expect(result.panels[0].slots.every(slot => slot.y + slot.size <= 133)).toBe(true);
  });
  test('rejects isolated small frame cohorts', () => {
    expect(detectSlots(frameRaster(2, 2)).panels).toEqual([]);
  });
});
