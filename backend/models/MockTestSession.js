const mongoose = require('mongoose');

const mockTestAnswerSchema = new mongoose.Schema(
  {
    questionId: {
      type: String,
      required: true,
      trim: true,
    },
    section: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    selectedOption: {
      type: Number,
      default: -1, // -1 or null indicates unattempted
      validate: {
        validator: (val) => val === null || val === undefined || Number.isInteger(val),
        message: '{VALUE} is not a valid integer option.',
      },
    },
    isMarkedForReview: {
      type: Boolean,
      default: false,
    },
    answeredAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const mockTestSessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    mockTest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MockTest',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['in_progress', 'completed', 'expired', 'abandoned'],
      default: 'in_progress',
      index: true,
    },
    startedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    submittedAt: {
      type: Date,
      default: null,
    },
    lastHeartbeatAt: {
      type: Date,
      default: Date.now,
    },
    answers: {
      type: [mockTestAnswerSchema],
      default: [],
    },
    result: {
      score: {
        type: Number,
        default: 0,
      },
      maxMarks: {
        type: Number,
        default: 0,
      },
      totalQuestions: {
        type: Number,
        default: 0,
      },
      correctCount: {
        type: Number,
        default: 0,
      },
      incorrectCount: {
        type: Number,
        default: 0,
      },
      unattemptedCount: {
        type: Number,
        default: 0,
      },
      accuracy: {
        type: Number,
        default: 0,
      },
      percentage: {
        type: Number,
        default: 0,
      },
      sectionScores: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },
    },
    // Associated proctoring session
    proctoringSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProctoringSession',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

mockTestSessionSchema.index({ user: 1, mockTest: 1, status: 1 });
mockTestSessionSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('MockTestSession', mockTestSessionSchema);
