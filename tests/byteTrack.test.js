import { ByteTrack } from '../src/services/byteTrack.js';

const detection = (left, top, right, bottom, conf = 0.9, zona = true, jenis = 'bus') => ({
  jenis,
  conf,
  box: { left, top, right, bottom },
  zona
});

describe('ByteTrack', () => {
  it('matches high-confidence detections to the same track', () => {
    const tracker = new ByteTrack();
    const first = tracker.update('camera-01', [detection(0, 0, 0.4, 0.8)])[0];
    const second = tracker.update('camera-01', [detection(0.02, 0.02, 0.42, 0.82)])[0];

    expect(second.id).toBe(first.id);
    expect(first.isNewZoneEntry).toBe(true);
    expect(second.isNewZoneEntry).toBe(false);
  });

  it('uses a low-confidence detection to continue a high-confidence track', () => {
    const tracker = new ByteTrack({ highConfidenceThreshold: 0.7 });
    const first = tracker.update('camera-01', [detection(0, 0, 0.4, 0.8, 0.9)])[0];
    const second = tracker.update('camera-01', [detection(0.02, 0.02, 0.42, 0.82, 0.3)])[0];

    expect(second.id).toBe(first.id);
  });

  it('does not create a track from a low-confidence detection', () => {
    const tracker = new ByteTrack({ lowConfidenceThreshold: 0.2 });

    expect(tracker.update('camera-01', [detection(0, 0, 0.4, 0.8, 0.15)])).toEqual([]);
  });
});
