const detectionsByCamera = new Map();

export function setLiveDetections(cameraId, detections) {
  detectionsByCamera.set(cameraId, detections);
}

export function getLiveDetections(cameraId) {
  return detectionsByCamera.get(cameraId) ?? [];
}

export function clearLiveDetections(cameraId) {
  if (cameraId === undefined) detectionsByCamera.clear();
  else detectionsByCamera.delete(cameraId);
}
