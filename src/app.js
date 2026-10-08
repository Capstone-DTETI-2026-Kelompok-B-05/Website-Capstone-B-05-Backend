import cors from 'cors';
import express from 'express';
import morgan from 'morgan';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middlewares/errorMiddleware.js';
import apiRoutes from './routes/index.js';
import { createCameraIngestRoutes } from './routes/cameraIngestRoutes.js';
import { framePipeline } from './services/framePipelineInstance.js';

const app = express();

app.disable('x-powered-by');
app.use(cors({ origin: env.clientOrigin }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

app.use(
  '/api/v1/camera-ingest',
  express.raw({ type: 'image/jpeg', limit: `${env.maxFrameBytes}b` }),
  createCameraIngestRoutes({ pipeline: framePipeline })
);
app.use('/api/v1', apiRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
