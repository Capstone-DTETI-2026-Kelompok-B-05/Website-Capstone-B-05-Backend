import mongoose from 'mongoose';

const cameraSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    rtspUrl: {
      type: String,
      required: true,
      trim: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    assignedPetugas: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      unique: true,
      sparse: true
    }
  },
  { timestamps: true }
);

export default mongoose.model('Camera', cameraSchema);
