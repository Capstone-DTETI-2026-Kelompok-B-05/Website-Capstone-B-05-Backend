function intersectionOverUnion(first, second) {
  const left = Math.max(first.left, second.left);
  const top = Math.max(first.top, second.top);
  const right = Math.min(first.right, second.right);
  const bottom = Math.min(first.bottom, second.bottom);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const firstArea = Math.max(0, first.right - first.left) * Math.max(0, first.bottom - first.top);
  const secondArea = Math.max(0, second.right - second.left) * Math.max(0, second.bottom - second.top);
  return intersection / (firstArea + secondArea - intersection || 1);
}

export class ObjectTracker {
  constructor({ iouThreshold = 0.4, maxMissedFrames = 5, maxInactiveMs = 3000 } = {}) {
    this.iouThreshold = iouThreshold;
    this.maxMissedFrames = maxMissedFrames;
    this.maxInactiveMs = maxInactiveMs;
    this.nextTrackId = 1;
    this.cameras = new Map();
  }

  update(cameraId, detections, timestamp = Date.now()) {
    if (!Array.isArray(detections)) throw new Error('Detections must be an array');
    const tracks = this.cameras.get(cameraId) ?? [];
    const available = new Set(tracks);
    const results = [];

    for (const detection of detections) {
      let bestTrack = null;
      let bestIou = this.iouThreshold;
      for (const track of available) {
        if (track.vehicleType !== detection.jenis) continue;
        const iou = intersectionOverUnion(track.box, detection.box);
        if (iou >= bestIou) {
          bestTrack = track;
          bestIou = iou;
        }
      }

      const track = bestTrack ?? {
        trackId: `${cameraId}-track-${this.nextTrackId++}`,
        vehicleType: detection.jenis,
        box: detection.box,
        missedFrames: 0,
        wasInZone: false,
        lastSeenAt: timestamp
      };
      if (bestTrack) available.delete(bestTrack);

      const enteredZone = detection.zona === true && track.wasInZone !== true;
      track.box = detection.box;
      track.missedFrames = 0;
      track.wasInZone = detection.zona === true;
      track.lastSeenAt = timestamp;
      if (!bestTrack) tracks.push(track);

      results.push({
        ...detection,
        id: track.trackId,
        isNewZoneEntry: enteredZone
      });
    }

    for (const track of available) track.missedFrames += 1;
    this.cameras.set(cameraId, tracks.filter(track =>
      track.missedFrames <= this.maxMissedFrames && timestamp - track.lastSeenAt <= this.maxInactiveMs
    ));
    return results;
  }

  clear(cameraId) {
    if (cameraId === undefined) this.cameras.clear();
    else this.cameras.delete(cameraId);
  }
}

export { intersectionOverUnion };
