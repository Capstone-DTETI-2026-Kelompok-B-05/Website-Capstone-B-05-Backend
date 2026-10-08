import { EventEmitter } from 'node:events';

export class FramePipeline extends EventEmitter {
  constructor({ maxQueueSize = 3, maxFrameBytes = 1024 * 1024 } = {}) {
    super();
    this.maxQueueSize = maxQueueSize;
    this.maxFrameBytes = maxFrameBytes;
    this.latestFrames = new Map();
    this.queue = [];
    this.processing = false;
    this.droppedFrames = 0;
  }

  accept(cameraId, frame) {
    if (!Buffer.isBuffer(frame) || frame.length === 0) {
      throw new Error('A non-empty JPEG frame is required');
    }
    if (frame.length > this.maxFrameBytes) {
      const error = new Error(`Frame exceeds the ${this.maxFrameBytes}-byte limit`);
      error.statusCode = 413;
      throw error;
    }

    const item = { cameraId, frame, receivedAt: new Date() };
    this.latestFrames.set(cameraId, item);
    this.emit(`frame:${cameraId}`, item);

    if (this.queue.length >= this.maxQueueSize) {
      this.queue.shift();
      this.droppedFrames += 1;
    }
    this.queue.push(item);
    this.emit('queued');
    return item;
  }

  next() {
    return this.queue.shift() ?? null;
  }

  subscribe(cameraId, listener) {
    const event = `frame:${cameraId}`;
    this.on(event, listener);
    return () => this.off(event, listener);
  }

  getLatest(cameraId) {
    return this.latestFrames.get(cameraId) ?? null;
  }

  stats() {
    return {
      queuedFrames: this.queue.length,
      droppedFrames: this.droppedFrames,
      cameras: this.latestFrames.size
    };
  }
}
