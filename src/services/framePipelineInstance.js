import { env } from '../config/env.js';
import { FramePipeline } from './framePipeline.js';
import { RtspPublisher } from './rtspPublisher.js';

export const framePipeline = new FramePipeline({
  maxQueueSize: env.frameQueueSize,
  maxFrameBytes: env.maxFrameBytes
});

export const rtspPublisher = new RtspPublisher({
  pipeline: framePipeline,
  enabled: env.rtspPublishEnabled,
  ffmpegPath: env.rtspFfmpegPath,
  outputBaseUrl: env.rtspOutputBaseUrl,
  fps: env.rtspFps
});
