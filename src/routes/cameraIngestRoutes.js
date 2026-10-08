import { Router } from 'express';
import { env } from '../config/env.js';

export function cameraUploadAuth(req, res, next) {
  const expected = env.cameraFrameToken;
  const provided = req.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!expected || provided !== expected) {
    return res.status(401).json({ success: false, message: 'Camera upload token is invalid' });
  }
  return next();
}

export function createCameraIngestRoutes({ pipeline }) {
  const router = Router();
  router.post('/:cameraId/frame', cameraUploadAuth, (req, res) => {
    if (req.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'image/jpeg') {
      return res.status(415).json({ success: false, message: 'Content-Type must be image/jpeg' });
    }

    try {
      pipeline.accept(req.params.cameraId, req.body);
      return res.status(202).json({ success: true, message: 'Frame accepted' });
    } catch (error) {
      return res.status(error.statusCode ?? 400).json({ success: false, message: error.message });
    }
  });

  return router;
}
