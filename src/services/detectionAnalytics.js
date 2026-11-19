import mongoose from 'mongoose';
import DetectionEvent from '../../models/DetectionEvent.js';
import { validateDetectionPayload } from './mqttPublisher.js';

const MAX_PENDING_DETECTION_EVENTS = 500;
const pendingDetectionEvents = [];

async function writePendingDetectionEvents() {
  if (mongoose.connection.readyState !== 1) return;
  while (pendingDetectionEvents.length > 0) {
    const event = pendingDetectionEvents[0];
    try {
      await DetectionEvent.create(event);
      pendingDetectionEvents.shift();
    } catch (error) {
      console.error('Unable to store queued detection analytics:', error.message);
      return;
    }
  }
}

mongoose.connection.on('connected', () => {
  void writePendingDetectionEvents();
});

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
    box: payload.box,
    detectedAt: payload.timestamp ? new Date(payload.timestamp) : new Date(),
    portalOpen: portalState.portalOpen,
    portalMode: portalState.operationMode
  };
}

export function recordDetection(payload, portalState) {
  const event = detectionEventFromPayload(payload, portalState);
  if (mongoose.connection.readyState === 1) {
    return DetectionEvent.create(event).catch(error => {
      console.error('Unable to store detection analytics:', error.message);
      if (pendingDetectionEvents.length < MAX_PENDING_DETECTION_EVENTS) pendingDetectionEvents.push(event);
      return null;
    });
  }
  if (pendingDetectionEvents.length < MAX_PENDING_DETECTION_EVENTS) pendingDetectionEvents.push(event);
  return Promise.resolve(null);
}
