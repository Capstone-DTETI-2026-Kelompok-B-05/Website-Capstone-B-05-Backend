import 'dotenv/config';
import mongoose from 'mongoose';
mongoose.set('bufferCommands', false);
try {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
    family: 4,
  });
  console.log('Terhubung');
  await mongoose.disconnect();
} catch (e) {
  console.log(e.name, e.message);
  console.log(e.reason?.servers);
}