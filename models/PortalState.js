import mongoose from 'mongoose';

const portalStateSchema = new mongoose.Schema(
  {
    camera: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Camera',
      required: true
    },
    status: {
      type: String,
      enum: ['OPEN', 'CLOSED'],
      default: 'CLOSED'
    },
    operationMode: {
      type: String,
      enum: ['AUTO', 'MANUAL'],
      default: 'AUTO'
    },
    triggeredBy: {
      type: String,
      enum: ['SYSTEM_AI', 'PETUGAS', 'NONE'],
      default: 'NONE'
    },
    lastCommand: {
      type: String,
      default: null
    }
  },
  { timestamps: true }
);

export default mongoose.model('PortalState', portalStateSchema);
