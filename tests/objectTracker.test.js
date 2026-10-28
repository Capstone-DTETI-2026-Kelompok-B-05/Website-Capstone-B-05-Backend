import { ObjectTracker, intersectionOverUnion } from '../src/services/objectTracker.js';

const detection = (left, top, right, bottom, zona = true, jenis = 'bus') => ({
  jenis,
  conf: 0.9,
  box: { left, top, right, bottom },
  zona
});

describe('object tracker', () => {
  it('keeps the same ID for a matching object and only marks the first zone entry', () => {
    const tracker = new ObjectTracker({ iouThreshold: 0.4 });
    const first = tracker.update('camera-01', [detection(100, 100, 200, 300)])[0];
    const second = tracker.update('camera-01', [detection(105, 105, 205, 305)])[0];

    expect(second.id).toBe(first.id);
    expect(first.isNewZoneEntry).toBe(true);
    expect(second.isNewZoneEntry).toBe(false);
  });

  it('counts a tracked object when it enters the zone', () => {
    const tracker = new ObjectTracker({ iouThreshold: 0.4 });
    const outside = tracker.update('camera-01', [detection(100, 100, 200, 300, false)])[0];
    const inside = tracker.update('camera-01', [detection(105, 105, 205, 305, true)])[0];

    expect(inside.id).toBe(outside.id);
    expect(outside.isNewZoneEntry).toBe(false);
    expect(inside.isNewZoneEntry).toBe(true);
  });

  it('creates a new ID after a track expires', () => {
    const tracker = new ObjectTracker({ iouThreshold: 0.4, maxMissedFrames: 1 });
    const first = tracker.update('camera-01', [detection(100, 100, 200, 300)])[0];
    tracker.update('camera-01', [], 1000);
    tracker.update('camera-01', [], 2000);
    const next = tracker.update('camera-01', [detection(100, 100, 200, 300)], 4001)[0];

    expect(next.id).not.toBe(first.id);
    expect(next.isNewZoneEntry).toBe(true);
  });

  it('calculates overlap correctly', () => {
    expect(intersectionOverUnion(
      { left: 0, top: 0, right: 10, bottom: 10 },
      { left: 5, top: 5, right: 15, bottom: 15 }
    )).toBeCloseTo(1 / 7);
  });
});
