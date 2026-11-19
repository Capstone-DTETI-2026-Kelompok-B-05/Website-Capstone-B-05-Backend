import app from './src/app.js';
import { env } from './src/config/env.js';
import mongoose from 'mongoose';
import { createPortalAutomation } from './src/services/portalAutomation.js';
import { recordDetection } from './src/services/detectionAnalytics.js';
import { framePipeline, objectTracker, rtspPublisher } from './src/services/framePipelineInstance.js';
import { startOnnxWorker } from './src/services/onnxWorker.js';
import { detectFrame } from './src/services/cameraDetector.js';
import { setLiveDetections } from './src/services/liveDetectionState.js';

try {
  const connectMongo = () => mongoose.connect(env.mongoUri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000
  }).catch(error => {
    console.error('MongoDB connection unavailable; retrying analytics connection:', error.message);
    setTimeout(connectMongo, 5000);
  });
  void connectMongo();
  const portalAutomation = createPortalAutomation({
    onDetection: (payload, controller) =>
      recordDetection(payload, {
        portalOpen: controller.portalOpen,
        operationMode: controller.operationMode
      })
  });
  startOnnxWorker({
    pipeline: framePipeline,
    detectFrame,
    tracker: objectTracker,
    onTrackedDetections: setLiveDetections
  });
  rtspPublisher.on('publisher-error', (error, cameraId) => {
    console.error(`RTSP publisher error for camera ${cameraId}:`, error.message);
  });
  rtspPublisher.on('started', ({ cameraId, rtspUrl }) => {
    console.log(`RTSP publishing camera ${cameraId} at ${rtspUrl}`);
  });
  rtspPublisher.start();
  app.listen(env.port, () => {
    console.log(`Backend listening on http://localhost:${env.port}`);
  });
} catch (error) {
  console.error('Unable to connect to MongoDB:', error);
  process.exitCode = 1;
}
