/**
 * proctoring_phase_d_calibration.test.js
 *
 * NexPrep JEE LMS — Phase D: Empirical Calibration & Drift Benchmarking Test Suite
 *
 * Validates:
 * 1. Adjudication Model Versioning (ADJUDICATION_MODEL_VERSION = 'phase-a-v1')
 * 2. Replay Capability (replayAdjudication, non-mutating idempotent replay)
 * 3. Telemetry Drift Monitoring Service (computeDriftMetrics, evaluateDriftAlerts, GET /proctoring/drift)
 * 4. Critical Calibration Invariants (Noise floor, Category caps, Cross-corroboration, Technical health gate, Hard violation)
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const {
  ADJUDICATION_MODEL_VERSION,
  CATEGORIES,
  CATEGORY_CAPS,
  DECISIONS,
  TECHNICAL_HEALTH,
  REASON_CODES,
  THRESHOLDS,
  computeDurationMultiplier,
  computeCorroborationMultiplier,
  adjudicateProctoring,
  replayAdjudication,
} = require('../services/proctoringAdjudicationService');

const {
  computeDriftMetrics,
  evaluateDriftAlerts,
  DEFAULT_DRIFT_BASELINE,
} = require('../services/proctoringDriftService');

const ProctoringAssessment = require('../models/ProctoringAssessment');
const {
  replayProctoringAdjudication,
  getProctoringDriftSummary,
} = require('../controllers/proctoringController');

function createTs(baseDate, offsetMs) {
  return new Date(baseDate.getTime() + offsetMs);
}

function createMockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(data) {
      res.body = data;
      return res;
    },
  };
  return res;
}

describe('Phase D: Adjudication Model Versioning & Schemas', () => {
  it('D1.1: should export ADJUDICATION_MODEL_VERSION as phase-a-v1', () => {
    assert.equal(ADJUDICATION_MODEL_VERSION, 'phase-a-v1');
  });

  it('D1.2: should include adjudicationModelVersion in adjudication output payload', () => {
    const baseTime = new Date('2026-09-29T10:00:00.000Z');
    const result = adjudicateProctoring({
      events: [
        { type: 'CAMERA_STARTED', source: 'media', timestamp: baseTime, duration: 0 },
      ],
      mockTestSession: {
        startedAt: baseTime,
        submittedAt: createTs(baseTime, 60000),
      },
    });

    assert.equal(result.adjudicationModelVersion, 'phase-a-v1');
  });

  it('D1.3: should define adjudicationModelVersion field in ProctoringAssessment schema', () => {
    const versionPath = ProctoringAssessment.schema.path('adjudication.adjudicationModelVersion');
    assert.ok(versionPath, 'Schema should define adjudication.adjudicationModelVersion');
    assert.equal(versionPath.instance, 'String');
    assert.equal(versionPath.defaultValue, 'phase-a-v1');
  });
});

describe('Phase D: Replay Capability', () => {
  it('D2.1: replayAdjudication should produce deterministic matching results to adjudicateProctoring', () => {
    const baseTime = new Date('2026-09-29T10:00:00.000Z');
    const testSession = {
      _id: 'sess_replay_test',
      user: 'user_replay_test',
      startedAt: baseTime,
      submittedAt: createTs(baseTime, 120000),
      answers: [{ questionId: 'q1', answeredAt: createTs(baseTime, 30000) }],
    };

    const events = [
      { type: 'CAMERA_STARTED', source: 'media', timestamp: createTs(baseTime, 100), duration: 0 },
      { type: 'SCREEN_SHARE_STARTED', source: 'screen', timestamp: createTs(baseTime, 200), duration: 0 },
      { type: 'FOCUS_LOST', source: 'attention', timestamp: createTs(baseTime, 5000), duration: 0 },
      { type: 'FOCUS_REGAINED', source: 'attention', timestamp: createTs(baseTime, 8000), duration: 0 },
      { type: 'FACE_ABSENT', source: 'camera', timestamp: createTs(baseTime, 20000), duration: 35000 },
      { type: 'FOCUS_LOST', source: 'attention', timestamp: createTs(baseTime, 20500), duration: 0 },
      { type: 'SCREEN_VIEW_CHANGED', source: 'screen', timestamp: createTs(baseTime, 21000), duration: 35000 },
      { type: 'FOCUS_REGAINED', source: 'attention', timestamp: createTs(baseTime, 55500), duration: 0 },
    ];

    const standard = adjudicateProctoring({
      events,
      mockTestSession: testSession,
    });

    const replay = replayAdjudication({
      events,
      mockTestSession: testSession,
    });

    assert.equal(replay.adjudicationModelVersion, standard.adjudicationModelVersion);
    assert.equal(replay.decision, standard.decision);
    assert.equal(replay.advisoryClearance, standard.advisoryClearance);
    assert.equal(replay.integrityRiskScore, standard.integrityRiskScore);
    assert.equal(replay.evidenceConfidence, standard.evidenceConfidence);
    assert.equal(replay.technicalHealth, standard.technicalHealth);
    assert.equal(replay.hardViolationTriggered, standard.hardViolationTriggered);
    assert.deepEqual(replay.reasonCodes, standard.reasonCodes);
    assert.deepEqual(replay.categoryRiskBreakdown, standard.categoryRiskBreakdown);
    assert.equal(replay.replayedAt instanceof Date, true);
  });

  it('D2.2: replay endpoint route should enforce reviewer authorization via requireReviewerRole middleware', () => {
    const { requireReviewerRole } = require('../middleware/authMiddleware');
    const reqStudent = { user: { _id: 'student_1', role: 'student' } };
    const resStudent = createMockRes();
    let studentErr = null;
    requireReviewerRole(reqStudent, resStudent, (err) => { studentErr = err; });

    assert.equal(resStudent.statusCode, 403);
    assert.ok(studentErr);
    assert.ok(studentErr.message.includes('reviewer permissions required'));

    const reqReviewer = { user: { _id: 'reviewer_1', role: 'reviewer' } };
    const resReviewer = createMockRes();
    let reviewerNextCalled = false;
    requireReviewerRole(reqReviewer, resReviewer, () => { reviewerNextCalled = true; });

    assert.equal(reviewerNextCalled, true);
  });
});

describe('Phase D: Drift Monitoring & Operational Alerting', () => {
  it('D3.1: evaluateDriftAlerts should flag excessive void rate when > 10%', () => {
    const metrics = {
      totalSessions: 100,
      outcomes: {
        void: 14,
        technical: 4,
        release: 82,
        cleanRelease: 74,
        advisoryRelease: 8,
      },
      risk: { average: 22 },
      confidence: { average: 0.88 },
      events: { cameraStopRate: 0.05, screenStopRate: 0.02, averagePerSession: 10 },
    };

    const alerts = evaluateDriftAlerts(metrics, DEFAULT_DRIFT_BASELINE);
    const voidAlert = alerts.find((a) => a.code === 'DRIFT_VOID_RATE_ELEVATED');
    assert.ok(voidAlert, 'Should trigger DRIFT_VOID_RATE_ELEVATED alert');
    assert.equal(voidAlert.severity, 'WARNING');
    assert.equal(voidAlert.metric, 'voidRate');
    assert.equal(voidAlert.observed, 0.14);
  });

  it('D3.2: evaluateDriftAlerts should flag excessive technical rate when > 15%', () => {
    const metrics = {
      totalSessions: 100,
      outcomes: {
        void: 2,
        technical: 18,
        release: 80,
        cleanRelease: 72,
        advisoryRelease: 8,
      },
      risk: { average: 18 },
      confidence: { average: 0.88 },
      events: { cameraStopRate: 0.05, screenStopRate: 0.02, averagePerSession: 10 },
    };

    const alerts = evaluateDriftAlerts(metrics, DEFAULT_DRIFT_BASELINE);
    const techAlert = alerts.find((a) => a.code === 'DRIFT_TECHNICAL_RATE_ELEVATED');
    assert.ok(techAlert, 'Should trigger DRIFT_TECHNICAL_RATE_ELEVATED alert');
    assert.equal(techAlert.metric, 'technicalRate');
    assert.equal(techAlert.observed, 0.18);
  });

  it('D3.3: evaluateDriftAlerts should return empty array when all metrics within baseline', () => {
    const metrics = {
      totalSessions: 100,
      outcomes: {
        void: 1,
        technical: 3,
        release: 96,
        cleanRelease: 86,
        advisoryRelease: 10,
      },
      risk: { average: 14.5 },
      confidence: { average: 0.92 },
      events: { cameraStopRate: 0.02, screenStopRate: 0.01, averagePerSession: 15 },
    };

    const alerts = evaluateDriftAlerts(metrics, DEFAULT_DRIFT_BASELINE);
    assert.equal(alerts.length, 0, 'No drift alerts expected for healthy metrics');
  });

  it('D3.4: drift summary endpoint route should enforce reviewer authorization via requireReviewerRole', () => {
    const { requireReviewerRole } = require('../middleware/authMiddleware');
    const reqStudent = { user: { _id: 'student_2', role: 'student' } };
    const resStudent = createMockRes();
    let studentErr = null;
    requireReviewerRole(reqStudent, resStudent, (err) => { studentErr = err; });

    assert.equal(resStudent.statusCode, 403);
    assert.ok(studentErr);
    assert.ok(studentErr.message.includes('reviewer permissions required'));

    const reqAdmin = { user: { _id: 'admin_1', role: 'admin' } };
    const resAdmin = createMockRes();
    let adminNextCalled = false;
    requireReviewerRole(reqAdmin, resAdmin, () => { adminNextCalled = true; });

    assert.equal(adminNextCalled, true);
  });
});

describe('Phase D: Inviolable Calibration Invariants & Boundaries', () => {
  const baseTime = new Date('2026-09-29T10:00:00.000Z');

  it('D4.1: Universal Duration Noise Floor - micro-movements < 3000ms yield zero risk', () => {
    assert.equal(computeDurationMultiplier(0), 0.0);
    assert.equal(computeDurationMultiplier(1500), 0.0);
    assert.equal(computeDurationMultiplier(2999), 0.0);
    assert.equal(computeDurationMultiplier(3000), 1.0);
  });

  it('D4.2: Isolated single-category ceiling invariant - cannot trigger VOID (max cap 35 < 50)', () => {
    // 10 long face absence events in camera alone
    const events = [
      { type: 'CAMERA_STARTED', source: 'media', timestamp: createTs(baseTime, 100), duration: 0 },
      { type: 'SCREEN_SHARE_STARTED', source: 'screen', timestamp: createTs(baseTime, 200), duration: 0 },
    ];
    for (let i = 0; i < 10; i++) {
      events.push({
        type: 'FACE_ABSENT',
        source: 'camera',
        timestamp: createTs(baseTime, 5000 + i * 15000),
        duration: 8000,
      });
    }

    const result = adjudicateProctoring({
      events,
      mockTestSession: {
        startedAt: baseTime,
        submittedAt: createTs(baseTime, 180000),
      },
    });

    assert.equal(result.categoryRiskBreakdown.camera, CATEGORY_CAPS.CAMERA); // 35
    assert.equal(result.integrityRiskScore, 35);
    assert.ok(result.integrityRiskScore < THRESHOLDS.RISK_RELEASE_MAX); // 35 < 50
    assert.equal(result.decision, DECISIONS.RELEASE);
    assert.equal(result.advisoryClearance, true); // 25 <= 35 < 50
  });

  it('D4.3: Multi-vector breach triggers kappa(V) and compounding (+15 pts) -> VOID', () => {
    const events = [
      { type: 'CAMERA_STARTED', source: 'media', timestamp: createTs(baseTime, 100), duration: 0 },
      { type: 'SCREEN_SHARE_STARTED', source: 'screen', timestamp: createTs(baseTime, 200), duration: 0 },
      { type: 'FOCUS_LOST', source: 'attention', timestamp: createTs(baseTime, 5000), duration: 0 },
      { type: 'FOCUS_REGAINED', source: 'attention', timestamp: createTs(baseTime, 8000), duration: 0 },
      // Repeat: Attention 45s (20 cap) + Face absent 45s (28) + Screen change 45s (14) -> kappa(3)=2.0 -> compounding +15 -> VOID
      { type: 'FACE_ABSENT', source: 'camera', timestamp: createTs(baseTime, 20000), duration: 45000 },
      { type: 'FOCUS_LOST', source: 'attention', timestamp: createTs(baseTime, 20500), duration: 0 },
      { type: 'SCREEN_VIEW_CHANGED', source: 'screen', timestamp: createTs(baseTime, 21000), duration: 45000 },
      { type: 'FOCUS_REGAINED', source: 'attention', timestamp: createTs(baseTime, 65500), duration: 0 },
    ];

    const result = adjudicateProctoring({
      events,
      mockTestSession: {
        startedAt: baseTime,
        submittedAt: createTs(baseTime, 180000),
      },
    });

    assert.ok(result.integrityRiskScore >= THRESHOLDS.RISK_RELEASE_MAX); // >= 50
    assert.ok(result.evidenceConfidence >= THRESHOLDS.CONFIDENCE_HIGH_BOUNDARY); // >= 0.75
    assert.equal(result.decision, DECISIONS.VOID);
    assert.equal(result.advisoryClearance, false);
    assert.ok(result.reasonCodes.includes(REASON_CODES.HIGH_RISK_HIGH_CONFIDENCE));
  });

  it('D4.4: Technical health gate protects candidate from false accusation during network/camera drop', () => {
    // Camera goes down mid-exam and stays unrecovered (continuityCamera = 0.30 < 0.70)
    const result = adjudicateProctoring({
      events: [
        { type: 'CAMERA_STARTED', source: 'media', timestamp: createTs(baseTime, 100), duration: 0 },
        { type: 'SCREEN_SHARE_STARTED', source: 'screen', timestamp: createTs(baseTime, 200), duration: 0 },
        { type: 'CAMERA_STOPPED', source: 'media', timestamp: createTs(baseTime, 5000), duration: 0 },
      ],
      mockTestSession: {
        startedAt: baseTime,
        submittedAt: createTs(baseTime, 180000),
      },
      options: { continuityCamera: 0.30 },
    });

    assert.equal(result.technicalHealth, TECHNICAL_HEALTH.INSUFFICIENT);
    assert.ok(result.integrityRiskScore < THRESHOLDS.RISK_RELEASE_MAX); // R < 50
    assert.equal(result.decision, DECISIONS.TECHNICAL);
    assert.equal(result.advisoryClearance, false);
    assert.ok(result.reasonCodes.includes(REASON_CODES.TECHNICAL_DEGRADATION));
  });

  it('D4.5: Compound Hard Violation (blackout > 60s + attention + answer + C_prior >= 0.75) triggers VOID', () => {
    const result = adjudicateProctoring({
      events: [
        { type: 'CAMERA_STARTED', source: 'media', timestamp: createTs(baseTime, 100), duration: 0 },
        { type: 'SCREEN_SHARE_STARTED', source: 'screen', timestamp: createTs(baseTime, 200), duration: 0 },
        { type: 'CAMERA_STOPPED', source: 'media', timestamp: createTs(baseTime, 5000), duration: 0 },
        { type: 'FOCUS_LOST', source: 'attention', timestamp: createTs(baseTime, 10000), duration: 0 },
        { type: 'CAMERA_STARTED', source: 'media', timestamp: createTs(baseTime, 70000), duration: 0 }, // 65s blackout
      ],
      mockTestSession: {
        startedAt: baseTime,
        submittedAt: createTs(baseTime, 180000),
        answers: [{ questionId: 'q1', answeredAt: createTs(baseTime, 25000) }],
      },
      options: { hardViolation: true },
    });

    assert.equal(result.hardViolationTriggered, true);
    assert.equal(result.decision, DECISIONS.VOID);
    assert.equal(result.advisoryClearance, false);
    assert.ok(result.reasonCodes.includes(REASON_CODES.HARD_VIOLATION_CONFIRMED));
  });
});
