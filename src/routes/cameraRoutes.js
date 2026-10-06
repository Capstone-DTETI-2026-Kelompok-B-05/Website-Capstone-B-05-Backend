import { Router } from 'express';
import mongoose from 'mongoose';
import Camera from '../../models/Camera.js';
import User from '../../models/User.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';
import { checkCameraConnection } from '../utils/cameraConnection.js';

const router = Router();

function publicCamera(camera) {
  return {
    id: camera._id,
    name: camera.name,
    rtspUrl: camera.rtspUrl,
    isActive: camera.isActive,
    assignedPetugas: camera.assignedPetugas,
    createdAt: camera.createdAt,
    updatedAt: camera.updatedAt
  };
}

function isRtspUrl(value) {
  try {
    return ['rtsp:', 'rtsps:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

async function validateAssignment(assignedPetugas) {
  if (assignedPetugas === null || assignedPetugas === undefined) return null;
  if (!mongoose.isValidObjectId(assignedPetugas)) return 'assignedPetugas must be a valid account ID';

  const user = await User.findById(assignedPetugas).select('role');
  if (!user) return 'Assigned account not found';
  if (user.role !== 'petugas') return 'A camera can only be assigned to a petugas account';
  return null;
}

router.use(authenticateToken);

router.get('/', async (req, res) => {
  const cameras = await Camera.find().sort({ createdAt: -1 });
  return res.json({ success: true, cameras: cameras.map(publicCamera) });
});

router.get('/:cameraId', async (req, res) => {
  const camera = await Camera.findById(req.params.cameraId);
  if (!camera) return res.status(404).json({ success: false, message: 'Camera not found' });
  return res.json({ success: true, camera: publicCamera(camera) });
});

router.post('/', async (req, res) => {
  const { name, rtspUrl, isActive = true, assignedPetugas = null } = req.body ?? {};
  if (typeof name !== 'string' || !name.trim() || !isRtspUrl(rtspUrl) || typeof isActive !== 'boolean') {
    return res.status(400).json({ success: false, message: 'Name, a valid RTSP URL, and a boolean isActive are required' });
  }
  const assignmentError = await validateAssignment(assignedPetugas);
  if (assignmentError) return res.status(400).json({ success: false, message: assignmentError });

  try {
    const camera = await Camera.create({ name: name.trim(), rtspUrl: rtspUrl.trim(), isActive, assignedPetugas });
    return res.status(201).json({ success: true, camera: publicCamera(camera) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'That staff member is already assigned to another camera' });
    }
    throw error;
  }
});

router.patch('/:cameraId', async (req, res) => {
  const { name, rtspUrl, isActive, assignedPetugas } = req.body ?? {};
  const updates = {};
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) return res.status(400).json({ success: false, message: 'Name must be a non-empty string' });
    updates.name = name.trim();
  }
  if (rtspUrl !== undefined) {
    if (!isRtspUrl(rtspUrl)) return res.status(400).json({ success: false, message: 'rtspUrl must be a valid RTSP URL' });
    updates.rtspUrl = rtspUrl.trim();
  }
  if (isActive !== undefined) {
    if (typeof isActive !== 'boolean') return res.status(400).json({ success: false, message: 'isActive must be a boolean' });
    updates.isActive = isActive;
  }
  if (assignedPetugas !== undefined) {
    const assignmentError = await validateAssignment(assignedPetugas);
    if (assignmentError) return res.status(400).json({ success: false, message: assignmentError });
    updates.assignedPetugas = assignedPetugas;
  }
  if (Object.keys(updates).length === 0) return res.status(400).json({ success: false, message: 'At least one camera field is required' });

  try {
    const camera = await Camera.findByIdAndUpdate(req.params.cameraId, updates, {
      new: true,
      runValidators: true
    });
    if (!camera) return res.status(404).json({ success: false, message: 'Camera not found' });
    return res.json({ success: true, camera: publicCamera(camera) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'That staff member is already assigned to another camera' });
    }
    throw error;
  }
});

router.delete('/:cameraId', async (req, res) => {
  const camera = await Camera.findByIdAndDelete(req.params.cameraId);
  if (!camera) return res.status(404).json({ success: false, message: 'Camera not found' });
  return res.json({ success: true, message: 'Camera deleted successfully' });
});

router.get('/:cameraId/connection-status', async (req, res) => {
  const camera = await Camera.findById(req.params.cameraId).select('rtspUrl');
  if (!camera) return res.status(404).json({ success: false, message: 'Camera not found' });

  const checkedAt = new Date().toISOString();
  try {
    const result = await checkCameraConnection(camera.rtspUrl);
    return res.json({ success: true, cameraId: camera._id, ...result, checkedAt });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message, checkedAt });
  }
});

export default router;
