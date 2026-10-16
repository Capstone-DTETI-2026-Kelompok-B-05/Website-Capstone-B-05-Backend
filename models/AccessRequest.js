import mongoose from 'mongoose';

const accessRequestSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'approved', 'rejected'],
      default: 'pending'
    },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 500
    },
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    username: {
      type: String,
      trim: true
    }
  },
  { timestamps: true }
);

accessRequestSchema.index({ email: 1, status: 1 });

export default mongoose.model('AccessRequest', accessRequestSchema);
