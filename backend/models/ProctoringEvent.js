const mongoose = require('mongoose');

const ALLOWED_EVENT_TYPES = Object.freeze([
  // Browser telemetry
  'FOCUS_LOST',
  'FOCUS_REGAINED',
  'PAGE_HIDDEN',
  'PAGE_VISIBLE',
  'FULLSCREEN_ENTERED',
  'FULLSCREEN_EXITED',
  'BEFORE_UNLOAD',

  // Media state
  'CAMERA_STARTED',
  'CAMERA_STOPPED',
  'MICROPHONE_STARTED',
  'MICROPHONE_STOPPED',

  // Screen share state & intelligence (Phase 2 & Phase 4)
  'SCREEN_SHARE_STARTED',
  'SCREEN_SHARE_STOPPED',
  'SCREEN_SURFACE_IDENTIFIED',
  'SCREEN_VIEW_STABLE',
  'SCREEN_VIEW_CHANGED',
  'SCREEN_VIEW_UNAVAILABLE',

  // Computer vision observations (Phase 3)
  'FACE_PRESENT',
  'FACE_ABSENT',
  'MULTIPLE_FACES',
  'HEAD_POSE_DEVIATION',

  // Session lifecycle
  'PROCTORING_STARTED',
  'PROCTORING_STOPPED',
  'PROCTORING_HEARTBEAT',
  'PROCTORING_ERROR',
]);

const EVENT_SOURCES = Object.freeze(['browser', 'media', 'webcam', 'screen', 'session', 'system']);

const proctoringEventSchema = new mongoose.Schema(
  {
    proctoringSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProctoringSession',
      required: true,
      index: true,
    },
    mockTestSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MockTestSession',
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: ALLOWED_EVENT_TYPES,
      index: true,
    },
    source: {
      type: String,
      required: true,
      enum: EVENT_SOURCES,
      default: 'browser',
    },
    timestamp: {
      type: Date,
      default: Date.now,
      required: true,
      immutable: true, // Append-only; server-assigned
      index: true,
    },
    duration: {
      type: Number,
      default: 0,
      min: [0, 'Duration cannot be negative.'],
      validate: {
        validator: Number.isFinite,
        message: '{VALUE} is not a valid number.',
      },
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Immutable: no updatedAt
  }
);

proctoringEventSchema.index({ proctoringSession: 1, timestamp: 1 });
proctoringEventSchema.index({ mockTestSession: 1, timestamp: 1 });
proctoringEventSchema.index({ user: 1, timestamp: -1 });

const ProctoringEvent = mongoose.model('ProctoringEvent', proctoringEventSchema);

module.exports = {
  ProctoringEvent,
  ALLOWED_EVENT_TYPES,
  EVENT_SOURCES,
};
