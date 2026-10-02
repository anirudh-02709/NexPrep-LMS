const mongoose = require('mongoose');

const triggeredRuleSchema = new mongoose.Schema(
  {
    ruleId: {
      type: String,
      required: true,
      trim: true,
    },
    ruleName: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: ['ATTENTION', 'CAMERA', 'SCREEN', 'INTEGRITY'],
      required: true,
    },
    observedCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    threshold: {
      type: Number,
      default: 0,
      min: 0,
    },
    durationMs: {
      type: Number,
      default: 0,
      min: 0,
    },
    evidenceEventIds: {
      type: [String],
      default: [],
    },
    episodeIds: {
      type: [String],
      default: [],
    },
    answerCoincident: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false }
);

const adjudicationSchema = new mongoose.Schema(
  {
    adjudicationModelVersion: {
      type: String,
      default: 'phase-a-v1',
      trim: true,
    },
    decision: {
      type: String,
      enum: ['RELEASE', 'VOID', 'TECHNICAL'],
      required: true,
    },
    decisionSource: {
      type: String,
      enum: ['AUTOMATED', 'ADMINISTRATIVE_OVERRIDE'],
      default: 'AUTOMATED',
    },
    integrityRiskScore: {
      type: Number,
      min: 0,
      max: 100,
      required: true,
    },
    evidenceConfidence: {
      type: Number,
      min: 0.0,
      max: 1.0,
      required: true,
    },
    technicalHealth: {
      type: String,
      enum: ['SUFFICIENT', 'INSUFFICIENT'],
      required: true,
    },
    hardViolationTriggered: {
      type: Boolean,
      default: false,
    },
    advisoryClearance: {
      type: Boolean,
      default: false,
    },
    reasonCodes: [{
      type: String,
      trim: true,
    }],
    categoryRiskBreakdown: {
      attention: { type: Number, default: 0 },
      camera: { type: Number, default: 0 },
      screen: { type: Number, default: 0 },
      media: { type: Number, default: 0 },
    },
    metrics: {
      initSensors: Number,
      continuityStreams: Number,
      continuityCamera: Number,
      continuityScreen: Number,
      continuityHeartbeats: Number,
      qualityCv: Number,
      observabilityIncident: Number,
    },
    adjudicatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const proctoringAssessmentSchema = new mongoose.Schema(
  {
    mockTestSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MockTestSession',
      required: true,
      unique: true,
      index: true,
    },
    proctoringSession: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProctoringSession',
      default: null,
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
      enum: ['CLEAR', 'REVIEW_REQUIRED', 'INSUFFICIENT_DATA'],
      required: true,
      index: true,
    },
    ruleSetVersion: {
      type: String,
      required: true,
      default: 'proctoring-v1',
      trim: true,
    },
    triggeredRules: {
      type: [triggeredRuleSchema],
      default: [],
    },
    summary: {
      type: String,
      required: true,
      trim: true,
    },
    metrics: {
      type: mongoose.Schema.Types.Mixed,
      default: () => ({}),
    },
    adjudication: {
      type: adjudicationSchema,
      default: null,
    },
    evaluatedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

proctoringAssessmentSchema.index({ user: 1, status: 1 });
proctoringAssessmentSchema.index({ user: 1, evaluatedAt: -1 });
proctoringAssessmentSchema.index({ 'adjudication.decision': 1 });

module.exports = mongoose.model('ProctoringAssessment', proctoringAssessmentSchema);

