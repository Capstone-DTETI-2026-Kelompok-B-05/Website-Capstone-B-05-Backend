import { publishDetection } from './mqttPublisher.js';

export function startOnnxWorker({ pipeline, detectFrame, logger = console } = {}) {
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
      await Promise.all(detections.map((detection) => publishDetection({
        ...detection,
        timestamp: detection.timestamp ?? item.receivedAt.toISOString()
      })));
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
