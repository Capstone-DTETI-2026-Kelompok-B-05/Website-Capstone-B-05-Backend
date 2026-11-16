import { intersectionOverUnion } from './objectTracker.js';

function detectionConfidence(detection) {
  return Number.isFinite(detection.conf) ? detection.conf : 0;
}

function matchingPairs(tracks, detections, iouThreshold) {
  const pairs = [];
  for (const track of tracks) {
    for (const detection of detections) {
      if (track.vehicleType !== detection.jenis) continue;
      const iou = intersectionOverUnion(track.box, detection.box);
      if (iou >= iouThreshold) pairs.push({ track, detection, iou });
    }
  }

  pairs.sort((first, second) => second.iou - first.iou);
  const matchedTracks = new Set();
  const matchedDetections = new Set();
  return pairs.filter(({ track, detection }) => {
    if (matchedTracks.has(track) || matchedDetections.has(detection)) return false;
    matchedTracks.add(track);
    matchedDetections.add(detection);
    return true;
  });
}

export class ByteTrack {
  constructor({
    highConfidenceThreshold = 0.5,
    lowConfidenceThreshold = 0.1,
    iouThreshold = 0.3,
    maxMissedFrames = 30,
    maxInactiveMs = 3000
  } = {}) {
    if (lowConfidenceThreshold > highConfidenceThreshold) {
      throw new Error('ByteTrack low confidence threshold must not exceed the high threshold');
    }
    this.highConfidenceThreshold = highConfidenceThreshold;
    this.lowConfidenceThreshold = lowConfidenceThreshold;
    this.iouThreshold = iouThreshold;
    this.maxMissedFrames = maxMissedFrames;
    this.maxInactiveMs = maxInactiveMs;
    this.nextTrackId = 1;
    this.cameras = new Map();
  }

  update(cameraId, detections, timestamp = Date.now()) {
    if (!Array.isArray(detections)) throw new Error('Detections must be an array');
    const tracks = this.cameras.get(cameraId) ?? [];
    const highConfidence = detections.filter(detection =>
      detectionConfidence(detection) >= this.highConfidenceThreshold
    );
    const lowConfidence = detections.filter(detection => {
      const confidence = detectionConfidence(detection);
      return confidence >= this.lowConfidenceThreshold && confidence < this.highConfidenceThreshold;
    });
    const matched = new Map();
    const unmatchedTracks = new Set(tracks);

    for (const { track, detection } of matchingPairs(tracks, highConfidence, this.iouThreshold)) {
      matched.set(detection, track);
      unmatchedTracks.delete(track);
    }

    for (const { track, detection } of matchingPairs(
      [...unmatchedTracks],
      lowConfidence,
      this.iouThreshold
    )) {
      matched.set(detection, track);
      unmatchedTracks.delete(track);
    }

    for (const detection of highConfidence) {
      if (matched.has(detection)) continue;
      const track = {
        trackId: `${cameraId}-track-${this.nextTrackId++}`,
        vehicleType: detection.jenis,
        box: detection.box,
        missedFrames: 0,
        wasInZone: false,
        lastSeenAt: timestamp
      };
      tracks.push(track);
      matched.set(detection, track);
    }

    for (const track of tracks) {
      if (unmatchedTracks.has(track)) track.missedFrames += 1;
    }

    const results = [];
    for (const detection of detections) {
      const track = matched.get(detection);
      if (!track) continue;
      const enteredZone = detection.zona === true && track.wasInZone !== true;
      track.box = detection.box;
      track.missedFrames = 0;
      track.wasInZone = detection.zona === true;
      track.lastSeenAt = timestamp;
      results.push({
        ...detection,
        id: track.trackId,
        isNewZoneEntry: enteredZone
      });
    }

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
