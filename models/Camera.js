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
    detectionZone: {
      type: [{
        x: { type: Number, min: 0, max: 1, required: true },
        y: { type: Number, min: 0, max: 1, required: true }
      }],
      default: null,
      validate: {
        validator: value => value === null || (value.length >= 3 && value.length <= 20),
        message: 'detectionZone must contain between 3 and 20 points'
      }
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
