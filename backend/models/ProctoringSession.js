const mongoose = require('mongoose');

const proctoringSessionSchema = new mongoose.Schema(
  {
    mockTestSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MockTestSession',
      required: true,
      unique: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'completed', 'expired', 'abandoned'],
      default: 'active',
      index: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    lastHeartbeatAt: {
      type: Date,
      default: Date.now,
    },
    // Observable environmental & capability states (no raw audio/video stored)
    cameraState: {
      type: String,
      enum: ['active', 'inactive', 'denied', 'unsupported'],
      default: 'inactive',
    },
    microphoneState: {
      type: String,
      enum: ['active', 'inactive', 'denied', 'unsupported'],
      default: 'inactive',
    },
    screenShareState: {
      type: String,
      enum: ['active', 'inactive', 'denied', 'unsupported'],
      default: 'inactive',
    },
    fullscreenState: {
      type: String,
      enum: ['active', 'inactive', 'unsupported'],
      default: 'inactive',
    },
    visibilityState: {
      type: String,
      enum: ['visible', 'hidden'],
      default: 'visible',
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

proctoringSessionSchema.index({ user: 1, status: 1 });
proctoringSessionSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('ProctoringSession', proctoringSessionSchema);
