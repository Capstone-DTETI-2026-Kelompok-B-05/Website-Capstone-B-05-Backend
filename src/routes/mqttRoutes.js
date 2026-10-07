import { Router } from 'express';
import { authenticateToken } from '../middlewares/authMiddleware.js';
import {
  publishDetection,
  publishPortalCommand,
  publishPortalStatus
} from '../services/mqttPublisher.js';

const router = Router();
router.use(authenticateToken);

async function publish(res, publisher, payload) {
  try {
    await publisher(payload);
    return res.status(202).json({ success: true, message: 'Message published' });
  } catch (error) {
    if (/must be|supported|exactly one|Only bus/.test(error.message)) {
      return res.status(400).json({ success: false, message: error.message });
    }
    throw error;
  }
}

router.post('/detection', (req, res) => publish(res, publishDetection, req.body));
router.post('/portal/status', (req, res) => publish(res, publishPortalStatus, req.body));
router.post('/portal/command', (req, res) => publish(res, publishPortalCommand, req.body));

export default router;
