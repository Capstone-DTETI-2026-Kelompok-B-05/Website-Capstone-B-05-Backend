import DetectionEvent from '../../models/DetectionEvent.js';
import { validateDetectionPayload } from './mqttPublisher.js';

export function detectionEventFromPayload(payload, portalState) {
  validateDetectionPayload(payload);
  return {
    vehicleType: payload.jenis,
    vehicleId: String(payload.id),
    confidence: payload.conf,
    inZone: payload.zona,
    strobo: payload.strobo,
    brightness: payload.kecerahan,
    latencyMs: payload.latensi,
    detectedAt: payload.timestamp ? new Date(payload.timestamp) : new Date(),
    portalOpen: portalState.portalOpen,
    portalMode: portalState.operationMode
  };
}

export function recordDetection(payload, portalState) {
  return DetectionEvent.create(detectionEventFromPayload(payload, portalState));
}
