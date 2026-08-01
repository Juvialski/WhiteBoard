import { describe, it, expect } from 'vitest';
import { parseLegacyElement } from '../../../scripts/migrate-board';

describe('Legacy Migration Parsing & Normalization Suite', () => {
  it('parses raw object with stroke array and downsamples points', () => {
    const raw = {
      id: 'stroke-1',
      stroke: Array.from({ length: 100 }, (_, i) => ({ x: i * 0.1, y: i * 0.1 })),
      color: '#000000',
    };

    const parsed: any = parseLegacyElement(raw, 'fallback-1');
    expect(parsed).not.toBeNull();
    expect(parsed?.id).toBe('stroke-1');
    expect(parsed?.type).toBe('drawing');
    expect(parsed?.points).toBeDefined();
    expect(parsed?.points?.length).toBeLessThan(100);
  });

  it('parses elements_blob style nested element', () => {
    const raw = {
      type: 'sticky',
      left: '120',
      top: '250',
      content: 'Legacy note text',
      backgroundColor: '#fef08a',
    };

    const parsed: any = parseLegacyElement(raw, 'blob-el-1');
    expect(parsed).not.toBeNull();
    expect(parsed?.id).toBe('blob-el-1');
    expect(parsed?.type).toBe('sticky');
    expect(parsed?.x).toBe(120);
    expect(parsed?.y).toBe(250);
    expect(parsed?.text).toBe('Legacy note text');
  });

  it('handles stringified coordinates and missing fields gracefully', () => {
    const raw = {
      id: 12345, // numeric id
      x: '300.5',
      y: 'invalid',
      width: '200',
      type: 'shape',
      shapeType: 'rect',
    };

    const parsed: any = parseLegacyElement(raw, 'fallback-2');
    expect(parsed).not.toBeNull();
    expect(parsed?.id).toBe('12345');
    expect(parsed?.x).toBe(300.5);
    expect(parsed?.y).toBe(0); // coerced fallback
    expect(parsed?.width).toBe(200);
    expect(parsed?.shapeType).toBe('rect');
  });
});
