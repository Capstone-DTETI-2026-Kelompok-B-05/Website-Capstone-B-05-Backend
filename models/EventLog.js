import mongoose from 'mongoose';

const eventLogSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      required: true,
      trim: true
    },
    camera: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Camera',
      default: null
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    description: {
      type: String,
      required: true,
      trim: true
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined
    }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export default mongoose.model('EventLog', eventLogSchema);
