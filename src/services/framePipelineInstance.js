import { env } from '../config/env.js';
import { FramePipeline } from './framePipeline.js';

export const framePipeline = new FramePipeline({
  maxQueueSize: env.frameQueueSize,
  maxFrameBytes: env.maxFrameBytes
});
