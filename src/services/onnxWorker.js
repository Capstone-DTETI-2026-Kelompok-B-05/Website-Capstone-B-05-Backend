import { publishDetection } from './mqttPublisher.js';
import { ObjectTracker } from './objectTracker.js';

export function startOnnxWorker({ pipeline, detectFrame, tracker = new ObjectTracker(), logger = console } = {}) {
  if (!pipeline || typeof detectFrame !== 'function') {
    throw new Error('A frame pipeline and detectFrame function are required');
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
      const newEntries = trackedDetections.filter(detection => detection.isNewZoneEntry);
      logger.log?.('ONNX detections ready for MQTT:', trackedDetections.length, 'new zone entries:', newEntries.length);

      await Promise.all(trackedDetections.map(async (detection) => {
        const { box, isNewZoneEntry, ...payload } = detection;
        Object.assign(payload, {
          isNewZoneEntry,
          timestamp: detection.timestamp ?? item.receivedAt.toISOString()
        });

        logger.log?.('Publishing detection:', JSON.stringify(payload));
        await publishDetection(payload);
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
