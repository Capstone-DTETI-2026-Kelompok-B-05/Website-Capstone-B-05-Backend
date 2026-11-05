import { outputDetections } from '../src/services/onnxDetector.js';

function tensor(values, channels, candidates = 1) {
  return {
    dims: [1, channels, candidates],
    data: Float32Array.from(values)
  };
}

function endToEndTensor(rows) {
  return {
    dims: [1, rows.length, 6],
    data: Float32Array.from(rows.flat())
  };
}

describe('ONNX vehicle class parsing', () => {
  it.each([
    [0, 'bus'],
    [1, 'ambulans'],
    [2, 'damkar']
  ])('maps class %s to %s', (classId, jenis) => {
    const output = tensor([
      320, 320, 100, 100,
      ...[0.1, 0.2, 0.3].map((score, index) => index === classId ? 0.9 : score)
    ], 7);

    const detections = outputDetections(output, 0.25, ['bus', 'ambulans', 'damkar']);

    expect(detections).toEqual([
      expect.objectContaining({ classId, jenis })
    ]);
    expect(detections[0].conf).toBeCloseTo(0.9);
  });

  it('rejects a single-class model when multiple vehicle classes are configured', () => {
    const output = tensor([320, 320, 100, 100, 0.9], 5);

    expect(() => outputDetections(output, 0.25, ['bus', 'ambulans', 'damkar']))
      .toThrow('ONNX model output has one class');
  });

  it('parses end-to-end output rows as xyxy, confidence, and class ID', () => {
    const output = endToEndTensor([
      [10, 20, 110, 220, 0.91, 0],
      [200, 40, 300, 240, 0.88, 1],
      [400, 60, 500, 260, 0.87, 2]
    ]);

    expect(outputDetections(output, 0.25, ['bus', 'ambulans', 'damkar'])).toEqual([
      expect.objectContaining({ classId: 0, jenis: 'bus', conf: expect.closeTo(0.91) }),
      expect.objectContaining({ classId: 1, jenis: 'ambulans', conf: expect.closeTo(0.88) }),
      expect.objectContaining({ classId: 2, jenis: 'damkar', conf: expect.closeTo(0.87) })
    ]);
  });
});
