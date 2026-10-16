import { env } from '../config/env.js';

let detectorPromise;

async function loadDetector() {
  if (!env.onnxDetectorModule) {
    throw new Error('ONNX_DETECTOR_MODULE is not configured');
  }
  return import(env.onnxDetectorModule);
}

export async function detectFrame(frame, metadata) {
  detectorPromise ??= loadDetector();
  const detector = await detectorPromise;
  if (typeof detector.detectFrame !== 'function') {
    throw new Error('ONNX detector module must export detectFrame(frame, metadata)');
  }
  return detector.detectFrame(frame, metadata);
}
