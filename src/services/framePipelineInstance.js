import { env } from '../config/env.js';
import { FramePipeline } from './framePipeline.js';
import { RtspPublisher } from './rtspPublisher.js';
import { ObjectTracker } from './objectTracker.js';

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

export const objectTracker = new ObjectTracker({
  iouThreshold: env.trackerIouThreshold,
  maxMissedFrames: env.trackerMaxMissedFrames,
  maxInactiveMs: env.trackerMaxInactiveMs
});
