import { Router } from 'express';
import authRoutes from './authRoutes.js';
import accountRoutes from './accountRoutes.js';
import cameraRoutes from './cameraRoutes.js';
import mqttRoutes from './mqttRoutes.js';
import analyticsRoutes from './analyticsRoutes.js';
import streamRoutes from './streamRoutes.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/accounts', accountRoutes);
router.use('/users', accountRoutes);
router.use('/cameras', cameraRoutes);
router.use('/mqtt', mqttRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/stream', streamRoutes);

router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Backend is running',
    environment: process.env.NODE_ENV ?? 'development',
    timestamp: new Date().toISOString()
  });
});

export default router;
