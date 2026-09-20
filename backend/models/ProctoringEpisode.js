const mongoose = require('mongoose');

const episodeRelationshipSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      trim: true,
    },
    eventIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ProctoringEvent',
        required: true,
      },
    ],
    startTime: {
      type: Date,
      required: true,
    },
    endTime: {
      type: Date,
      required: true,
    },
    deltaMs: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const answerInteractionContextSchema = new mongoose.Schema(
  {
    questionId: {
      type: String,
      required: true,
      trim: true,
    },
    questionNumber: {
      type: Number,
      required: true,
      min: 1,
    },
    section: {
      type: String,
      required: true,
      trim: true,
    },
    answeredAt: {
      type: Date,
      required: true,
    },
  },
  { _id: false }
);

const episodeSummarySchema = new mongoose.Schema(
  {
    eventCount: {
      type: Number,
      required: true,
      default: 0,
    },
    categories: {
      type: [String],
      default: [],
    },
    relationshipTypes: {
      type: [String],
      default: [],
    },
  },
  { _id: false }
);

const proctoringEpisodeSchema = new mongoose.Schema(
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
    startedAt: {
      type: Date,
      required: true,
      index: true,
    },
    endedAt: {
      type: Date,
      required: true,
    },
    durationMs: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    eventIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ProctoringEvent',
        required: true,
      },
    ],
    signalTypes: {
      type: [String],
      default: [],
    },
    relationships: {
      type: [episodeRelationshipSchema],
      default: [],
    },
    answerInteractionContext: {
      type: answerInteractionContextSchema,
      default: null,
    },
    summary: {
      type: episodeSummarySchema,
      default: () => ({ eventCount: 0, categories: [], relationshipTypes: [] }),
    },
  },
  {
    timestamps: true,
  }
);

proctoringEpisodeSchema.index({ proctoringSession: 1, startedAt: 1 });
proctoringEpisodeSchema.index({ mockTestSession: 1, startedAt: 1 });
proctoringEpisodeSchema.index({ user: 1, startedAt: -1 });

module.exports = mongoose.model('ProctoringEpisode', proctoringEpisodeSchema);
