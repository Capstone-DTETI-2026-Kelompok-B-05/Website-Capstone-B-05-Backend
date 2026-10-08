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
});
