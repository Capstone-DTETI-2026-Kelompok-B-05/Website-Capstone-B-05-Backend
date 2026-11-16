import { publishDetection } from './mqttPublisher.js';
import { ByteTrack } from './byteTrack.js';

export function startOnnxWorker({
  pipeline,
  detectFrame,
  tracker = new ByteTrack(),
  logger = console,
  publish = publishDetection,
  onTrackedDetections = () => {}
} = {}) {
  if (!pipeline || typeof detectFrame !== 'function') {
    throw new Error('A frame pipeline and detectFrame function are required');
  }
  if (typeof publish !== 'function') {
    throw new Error('A detection publisher function is required');
  }

  let stopped = false;
  let running = false;

  const processNext = async () => {
    if (stopped || running) return;
    const item = pipeline.next();
    if (!item) return;

    running = true;
    try {
      const detections = await detectFrame(item.frame, {
        cameraId: item.cameraId,
        receivedAt: item.receivedAt
      });
      if (!Array.isArray(detections)) {
        throw new Error('ONNX detector must return an array of detection payloads');
      }
      const trackedDetections = tracker.update(item.cameraId, detections, item.receivedAt.getTime());
      onTrackedDetections(item.cameraId, trackedDetections.map(detection => ({
        ...detection,
        vehicleType: detection.jenis,
        confidence: detection.conf,
        timestamp: detection.timestamp ?? item.receivedAt.toISOString()
      })));
      const newEntries = trackedDetections.filter(detection => detection.isNewZoneEntry);
      logger.log?.('ONNX detections ready:', trackedDetections.length, 'new zone entries:', newEntries.length);

      await Promise.all(trackedDetections.map(async (detection) => {
        const { isNewZoneEntry, ...payload } = detection;
        Object.assign(payload, {
          isNewZoneEntry,
          timestamp: detection.timestamp ?? item.receivedAt.toISOString()
        });

        logger.log?.('Publishing detection:', JSON.stringify(payload));
        await publish(payload);
        logger.log?.('Detection published:', payload.id);
      }));
    } catch (error) {
      logger.error('Unable to process camera frame with ONNX worker:', error);
    } finally {
      running = false;
      queueMicrotask(processNext);
    }
  };

  const onQueued = () => void processNext();
  pipeline.on('queued', onQueued);
  void processNext();

  return {
    stop() {
      stopped = true;
      pipeline.off('queued', onQueued);
    }
  };
}
