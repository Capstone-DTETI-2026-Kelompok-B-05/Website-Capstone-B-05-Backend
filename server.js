import app from './src/app.js';
import { env } from './src/config/env.js';
import mongoose from 'mongoose';
import { createPortalAutomation } from './src/services/portalAutomation.js';
import { recordDetection } from './src/services/detectionAnalytics.js';
import { framePipeline } from './src/services/framePipelineInstance.js';
import { startOnnxWorker } from './src/services/onnxWorker.js';
import { detectFrame } from './src/services/cameraDetector.js';

try {
  await mongoose.connect(env.mongoUri);
  createPortalAutomation({
    onDetection: (payload, controller) =>
      recordDetection(payload, {
        portalOpen: controller.portalOpen,
        operationMode: controller.operationMode
      })
  });
  startOnnxWorker({ pipeline: framePipeline, detectFrame });
  app.listen(env.port, () => {
    console.log(`Backend listening on http://localhost:${env.port}`);
  });
} catch (error) {
  console.error('Unable to connect to MongoDB:', error);
  process.exitCode = 1;
}
