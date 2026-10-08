import mongoose from 'mongoose';

const detectionEventSchema = new mongoose.Schema(
  {
    vehicleType: {
      type: String,
      required: true,
      enum: ['bus', 'ambulans', 'damkar', 'mobil', 'motor', 'truk'],
      index: true
    },
    vehicleId: {
      type: String,
      required: true,
      trim: true
    },
    confidence: {
      type: Number,
      required: true,
      min: 0,
      max: 1
    },
    inZone: {
      type: Boolean,
      required: true
    },
    strobo: {
      type: Boolean,
      required: true
    },
    brightness: {
      type: Number,
      required: true,
      min: 0,
      max: 1
    },
    latencyMs: {
      type: Number,
      required: true,
      min: 0
    },
    detectedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true
    },
    portalOpen: {
      type: Boolean,
      required: true
    },
    portalMode: {
      type: String,
      enum: ['manual', 'otomatis'],
      required: true
    }
  },
  { timestamps: true }
);

detectionEventSchema.index({ detectedAt: -1, vehicleType: 1 });

export default mongoose.model('DetectionEvent', detectionEventSchema);
