import { jest } from '@jest/globals';
import { FramePipeline } from '../src/services/framePipeline.js';
import { startOnnxWorker } from '../src/services/onnxWorker.js';

describe('camera frame pipeline', () => {
  it('keeps the latest frame and drops the oldest queued frame at capacity', () => {
    const pipeline = new FramePipeline({ maxQueueSize: 2 });
    pipeline.accept('camera-01', Buffer.from('one'));
    pipeline.accept('camera-01', Buffer.from('two'));
    pipeline.accept('camera-01', Buffer.from('three'));

    expect(pipeline.next().frame.toString()).toBe('two');
    expect(pipeline.next().frame.toString()).toBe('three');
    expect(pipeline.stats()).toMatchObject({ droppedFrames: 1, cameras: 1 });
  });

  it('publishes detector results asynchronously through the worker', async () => {
    const pipeline = new FramePipeline({ maxQueueSize: 2 });
    const detectFrame = jest.fn().mockResolvedValue([]);
    const worker = startOnnxWorker({ pipeline, detectFrame });

    pipeline.accept('camera-01', Buffer.from('jpeg'));
    await new Promise((resolve) => setImmediate(resolve));

    expect(detectFrame).toHaveBeenCalledWith(
      expect.any(Buffer),
      expect.objectContaining({ cameraId: 'camera-01' })
    );
    worker.stop();
  });

  it('keeps normalized bounding boxes in detector results', async () => {
    const pipeline = new FramePipeline({ maxQueueSize: 2 });
    const detection = {
      id: 'vehicle-1',
      jenis: 'bus',
      conf: 0.9,
      zona: true,
      box: { left: 0.1, top: 0.2, right: 0.6, bottom: 0.8 },
      strobo: false,
      kecerahan: 0.7,
      latensi: 10
    };
    const detectFrame = jest.fn().mockResolvedValue([detection]);
    const publish = jest.fn().mockResolvedValue(undefined);
    const worker = startOnnxWorker({ pipeline, detectFrame, publish });

    pipeline.accept('camera-01', Buffer.from('jpeg'));
    await new Promise((resolve) => setImmediate(resolve));

    expect(publish).toHaveBeenCalledWith(expect.objectContaining({
      box: { left: 0.1, top: 0.2, right: 0.6, bottom: 0.8 }
    }));
    worker.stop();
  });
});
