import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';

function streamPath(cameraId) {
  return encodeURIComponent(cameraId).replace(/%2F/gi, '/');
}

export class RtspPublisher extends EventEmitter {
  constructor({ pipeline, ffmpegPath = 'ffmpeg', outputBaseUrl, fps = 10, enabled = true }) {
    super();
    this.pipeline = pipeline;
    this.ffmpegPath = ffmpegPath;
    this.outputBaseUrl = outputBaseUrl.replace(/\/$/, '');
    this.fps = fps;
    this.enabled = enabled;
    this.publishers = new Map();
    this.publisherStatuses = new Map();
    this.onFrame = this.onFrame.bind(this);
  }

  start() {
    if (!this.enabled) return;
    this.pipeline.on('frame', this.onFrame);
  }

  stop() {
    this.pipeline.off('frame', this.onFrame);
    for (const cameraId of this.publishers.keys()) this.stopPublisher(cameraId);
  }

  getUrl(cameraId) {
    return `${this.outputBaseUrl}/${streamPath(cameraId)}`;
  }

  status(cameraId) {
    const publisher = this.publishers.get(cameraId);
    const previous = this.publisherStatuses.get(cameraId);
    return {
      enabled: this.enabled,
      cameraId,
      rtspUrl: this.getUrl(cameraId),
      running: Boolean(publisher?.running),
      error: publisher?.error ?? previous?.error ?? null
    };
  }

  onFrame(item) {
    let publisher = this.publishers.get(item.cameraId);
    if (!publisher) {
      publisher = this.startPublisher(item.cameraId);
      this.publishers.set(item.cameraId, publisher);
    }

    if (!publisher.running || publisher.backpressure || !publisher.stdin.writable) return;
    if (!publisher.stdin.write(item.frame)) publisher.backpressure = true;
  }

  startPublisher(cameraId) {
    const outputUrl = this.getUrl(cameraId);
    const process = spawn(this.ffmpegPath, [
      '-hide_banner',
      '-loglevel', 'warning',
      '-f', 'mjpeg',
      '-framerate', String(this.fps),
      '-i', 'pipe:0',
      '-an',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-pix_fmt', 'yuv420p',
      '-f', 'rtsp',
      '-rtsp_transport', 'tcp',
      outputUrl
    ], { stdio: ['pipe', 'ignore', 'pipe'] });

    const publisher = {
      process,
      stdin: process.stdin,
      running: true,
      error: null,
      backpressure: false
    };
    this.publisherStatuses.set(cameraId, { error: null });

    process.stderr.on('data', (chunk) => {
      const message = chunk.toString().trim();
      if (message) publisher.error = message;
    });
    process.once('error', (error) => {
      publisher.running = false;
      publisher.error = error.message;
      this.publisherStatuses.set(cameraId, { error: publisher.error });
      this.emit('publisher-error', error, cameraId);
    });
    process.once('close', (code, signal) => {
      publisher.running = false;
      if (code !== 0 && !publisher.error) {
        publisher.error = `FFmpeg exited with code ${code ?? 'unknown'}${signal ? ` (${signal})` : ''}`;
      }
      this.publisherStatuses.set(cameraId, { error: publisher.error });
      if (this.publishers.get(cameraId) === publisher) this.publishers.delete(cameraId);
      this.emit('stopped', { cameraId, code, signal, error: publisher.error });
    });
    process.stdin.on('drain', () => { publisher.backpressure = false; });

    this.emit('started', { cameraId, rtspUrl: outputUrl });
    return publisher;
  }

  stopPublisher(cameraId) {
    const publisher = this.publishers.get(cameraId);
    if (!publisher) return;
    publisher.stdin.destroy();
    if (publisher.running) publisher.process.kill('SIGTERM');
    this.publishers.delete(cameraId);
  }
}
