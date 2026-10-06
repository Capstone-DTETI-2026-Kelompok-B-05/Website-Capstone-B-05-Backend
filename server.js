import app from './src/app.js';
import { env } from './src/config/env.js';
import mongoose from 'mongoose';

try {
  await mongoose.connect(env.mongoUri);
  app.listen(env.port, () => {
    console.log(`Backend listening on http://localhost:${env.port}`);
  });
} catch (error) {
  console.error('Unable to connect to MongoDB:', error);
  process.exitCode = 1;
}
