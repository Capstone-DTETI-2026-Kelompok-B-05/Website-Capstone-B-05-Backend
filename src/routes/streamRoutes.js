import { Readable } from 'node:stream';
import { Router } from 'express';
import { env } from '../config/env.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';
import { framePipeline } from '../services/framePipelineInstance.js';

const router = Router();
router.use(authenticateToken);

router.get('/mjpeg', async (req, res, next) => {
  if (!env.esp32CamMjpegUrl) {
    return res.status(503).json({ success: false, message: 'ESP32-CAM MJPEG source is not configured' });
  }

  const controller = new AbortController();
  const abortStream = () => controller.abort();
  res.once('close', abortStream);

  try {
    const upstream = await fetch(env.esp32CamMjpegUrl, {
      signal: controller.signal,
      headers: { Accept: 'multipart/x-mixed-replace,image/jpeg' }
    });

    router.get('/mjpeg/:cameraId', (req, res) => {
      const boundary = 'frame';
      const latest = framePipeline.getLatest(req.params.cameraId);
      res.status(200).set({
        'Content-Type': `multipart/x-mixed-replace; boundary=${boundary}`,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        Pragma: 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
      });

      const writeFrame = ({ frame }) => {
        if (res.destroyed) return;
        res.write(`--${boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`);
        res.write(frame);
        res.write('\r\n');
      };
      const unsubscribe = framePipeline.subscribe(req.params.cameraId, writeFrame);
      if (latest) writeFrame(latest);
      req.on('close', () => {
        unsubscribe();
        if (!res.destroyed) res.end();
      });
    });
    if (!upstream.ok || !upstream.body) {
      const error = new Error(`ESP32-CAM returned HTTP ${upstream.status}`);
      error.statusCode = 502;
      throw error;
    }

    res.status(200);
    res.set({
      'Content-Type': upstream.headers.get('content-type') ?? 'multipart/x-mixed-replace',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      'X-Accel-Buffering': 'no'
    });
    Readable.fromWeb(upstream.body).on('error', (error) => {
      if (!res.destroyed) res.destroy(error);
    }).pipe(res);
  } catch (error) {
    res.removeListener('close', abortStream);
    if (error.name === 'AbortError' && res.destroyed) return;
    return next(error);
  }
});

export default router;
