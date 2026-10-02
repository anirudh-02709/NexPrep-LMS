const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const MockTestSession = require('../models/MockTestSession');
const ProctoringAssessment = require('../models/ProctoringAssessment');
const {
  PROCTORING_RULESET_VERSION,
  DEFAULT_CONFIG,
  sortEventsDeterministically,
  evaluateTelemetrySufficiency,
  evaluateProctoringAssessment,
} = require('../services/proctoringAssessmentService');

describe('Deterministic Proctoring Assessment & Schema Suite (Stage 1)', () => {
  const BASE_TIME = new Date('2026-09-23T10:00:00.000Z');

  function createTimestamp(offsetMs) {
    return new Date(BASE_TIME.getTime() + offsetMs);
  }

  function createSyntheticEvent(id, type, offsetMs, options = {}) {
    return {
      _id: id,
      id: id,
      type,
      source: options.source || 'browser',
      timestamp: createTimestamp(offsetMs),
      duration: options.duration || 0,
      metadata: options.metadata || {},
      proctoringSession: options.proctoringSession || 'proc_sess_1',
      mockTestSession: options.mockTestSession || 'mock_sess_1',
      user: options.user || 'user_1',
    };
  }

  function createCleanProcSession(options = {}) {
    return {
      _id: options._id || 'proc_sess_1',
      id: options._id || 'proc_sess_1',
      mockTestSession: options.mockTestSession || 'mock_sess_1',
      user: options.user || 'user_1',
      status: options.status || 'active',
      startedAt: createTimestamp(0),
      lastHeartbeatAt: createTimestamp(1800000),
      cameraState: options.cameraState || 'active',
      screenShareState: options.screenShareState || 'active',
      fullscreenState: options.fullscreenState || 'active',
      visibilityState: options.visibilityState || 'visible',
      metadata: options.metadata || { cvStatus: 'active', screenAiStatus: 'active' },
    };
  }

  function createCleanMockSession(options = {}) {
    return {
      _id: options._id || 'mock_sess_1',
      id: options._id || 'mock_sess_1',
      user: options.user || 'user_1',
      mockTest: options.mockTest || 'mock_test_jee_1',
      status: options.status || 'in_progress',
      evaluationStatus: options.evaluationStatus || 'PENDING',
      startedAt: createTimestamp(0),
      expiresAt: createTimestamp(3600000),
      submittedAt: options.submittedAt || createTimestamp(1800000),
      answers: options.answers || [],
      result: options.result || { score: 180, maxMarks: 300 },
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // PART A: Schema & Model Guarantees
  // ══════════════════════════════════════════════════════════════════════
  describe('Part A: Schema & Model Guarantees', () => {
    it('1. MockTestSession defines evaluationStatus enum and proctoringAssessment ref', () => {
      const paths = MockTestSession.schema.paths;
      assert.ok(paths.evaluationStatus, 'MockTestSession must have evaluationStatus');
      assert.deepStrictEqual(paths.evaluationStatus.enumValues, [
        'PENDING',
        'EVALUATED',
        'HELD_FOR_REVIEW',
        'HELD_TECHNICAL_REVIEW',
        'REJECTED',
      ]);
      assert.strictEqual(paths.evaluationStatus.defaultValue, 'PENDING');

      assert.ok(paths.proctoringAssessment, 'MockTestSession must have proctoringAssessment reference');
      assert.strictEqual(paths.proctoringAssessment.instance, 'ObjectId');
      assert.strictEqual(paths.proctoringAssessment.options.ref, 'ProctoringAssessment');
    });

    it('2. ProctoringAssessment schema declares required paths, indexes, and zero suspicion scores', () => {
      const paths = ProctoringAssessment.schema.paths;
      assert.ok(paths.mockTestSession, 'Must have mockTestSession');
      assert.ok(paths.proctoringSession, 'Must have proctoringSession');
      assert.ok(paths.user, 'Must have user');
      assert.ok(paths.status, 'Must have status');
      assert.deepStrictEqual(paths.status.enumValues, ['CLEAR', 'REVIEW_REQUIRED', 'INSUFFICIENT_DATA']);
      assert.ok(paths.ruleSetVersion, 'Must have ruleSetVersion');
      assert.ok(paths.triggeredRules, 'Must have triggeredRules');
      assert.ok(paths.metrics, 'Must have metrics');
      assert.ok(paths.summary, 'Must have summary');
      assert.ok(paths.evaluatedAt, 'Must have evaluatedAt');

      // Verify strict negative boundaries: NO suspicion/cheating scores
      assert.ok(!paths.cheatingScore, 'Must NOT contain cheatingScore');
      assert.ok(!paths.suspicionScore, 'Must NOT contain suspicionScore');
      assert.ok(!paths.riskScore, 'Must NOT contain riskScore');
      assert.ok(!paths.cheatingProbability, 'Must NOT contain cheatingProbability');

      const indexes = ProctoringAssessment.schema.indexes();
      const hasMockIndex = indexes.some(
        (idx) => idx[0] && idx[0].mockTestSession === 1
      );
      assert.ok(hasMockIndex, 'ProctoringAssessment must index mockTestSession');
    });
  });

  // ══════════════════════════════════════════════════════════════════════
  // PART B: Deterministic Flagging Rules (Scenarios 1–35)
  // ══════════════════════════════════════════════════════════════════════
  describe('Part B: Deterministic Flagging Engine Scenarios', () => {
    it('1. Clean session produces CLEAR assessment with no triggered rules', () => {
      const events = [
        createSyntheticEvent('ev_1', 'CAMERA_STARTED', 100),
        createSyntheticEvent('ev_2', 'SCREEN_SHARE_STARTED', 200),
        createSyntheticEvent('ev_3', 'FACE_PRESENT', 300),
        createSyntheticEvent('ev_4', 'SCREEN_VIEW_STABLE', 400),
      ];
      const procSession = createCleanProcSession();
      const mockSession = createCleanMockSession();

      const assessment = evaluateProctoringAssessment(events, [], mockSession, procSession);

      assert.strictEqual(assessment.status, 'CLEAR');
      assert.strictEqual(assessment.triggeredRules.length, 0);
      assert.ok(assessment.summary.includes('No configured proctoring review condition was triggered'));
      assert.strictEqual(assessment.metrics.totalDiscrepancies, 0);
    });

    it('2. One short focus loss (< 4 occurrences, < 30s) produces CLEAR', () => {
      const events = [
        createSyntheticEvent('ev_1', 'CAMERA_STARTED', 100),
        createSyntheticEvent('ev_2', 'SCREEN_SHARE_STARTED', 200),
        createSyntheticEvent('ev_3', 'FOCUS_LOST', 5000, { duration: 1500 }),
        createSyntheticEvent('ev_4', 'FOCUS_REGAINED', 6500),
      ];
      const assessment = evaluateProctoringAssessment(events, [], createCleanMockSession(), createCleanProcSession());

      assert.strictEqual(assessment.status, 'CLEAR');
      assert.strictEqual(assessment.triggeredRules.length, 0);
    });

    it('3. One tab switch / Rule A (FOCUS_LOST + PAGE_HIDDEN) alone produces CLEAR', () => {
      const events = [
        createSyntheticEvent('ev_1', 'CAMERA_STARTED', 100),
        createSyntheticEvent('ev_2', 'SCREEN_SHARE_STARTED', 200),
        createSyntheticEvent('ev_3', 'FOCUS_LOST', 5000),
        createSyntheticEvent('ev_4', 'PAGE_HIDDEN', 5100),
      ];
      const assessment = evaluateProctoringAssessment(events, [], createCleanMockSession(), createCleanProcSession());

      assert.strictEqual(assessment.status, 'CLEAR');
      assert.strictEqual(assessment.triggeredRules.length, 0);
    });

    it('4. One fullscreen exit produces CLEAR', () => {
      const events = [
        createSyntheticEvent('ev_1', 'CAMERA_STARTED', 100),
        createSyntheticEvent('ev_2', 'SCREEN_SHARE_STARTED', 200),
        createSyntheticEvent('ev_3', 'FULLSCREEN_EXITED', 10000),
        createSyntheticEvent('ev_4', 'FULLSCREEN_ENTERED', 12000),
      ];
      const assessment = evaluateProctoringAssessment(events, [], createCleanMockSession(), createCleanProcSession());

      assert.strictEqual(assessment.status, 'CLEAR');
      assert.strictEqual(assessment.triggeredRules.length, 0);
    });

    it('5. Four focus losses trigger RULE_5_BROWSER_FOCUS_VISIBILITY -> REVIEW_REQUIRED', () => {
      const events = [
        createSyntheticEvent('ev_1', 'CAMERA_STARTED', 100),
        createSyntheticEvent('ev_2', 'SCREEN_SHARE_STARTED', 200),
        createSyntheticEvent('ev_3', 'FOCUS_LOST', 5000, { duration: 1000 }),
        createSyntheticEvent('ev_4', 'FOCUS_LOST', 15000, { duration: 1000 }),
        createSyntheticEvent('ev_5', 'FOCUS_LOST', 25000, { duration: 1000 }),
        createSyntheticEvent('ev_6', 'FOCUS_LOST', 35000, { duration: 1000 }),
      ];
      const assessment = evaluateProctoringAssessment(events, [], createCleanMockSession(), createCleanProcSession());

      assert.strictEqual(assessment.status, 'REVIEW_REQUIRED');
      assert.strictEqual(assessment.triggeredRules.length, 1);
      assert.strictEqual(assessment.triggeredRules[0].ruleId, 'RULE_5_BROWSER_FOCUS_VISIBILITY');
      assert.strictEqual(assessment.triggeredRules[0].observedCount, 4);
    });

    it('6. 30s cumulative focus loss triggers RULE_5_BROWSER_FOCUS_VISIBILITY -> REVIEW_REQUIRED', () => {
      const events = [
        createSyntheticEvent('ev_1', 'CAMERA_STARTED', 100),
        createSyntheticEvent('ev_2', 'SCREEN_SHARE_STARTED', 200),
        createSyntheticEvent('ev_3', 'FOCUS_LOST', 5000, { duration: 32000 }),
      ];
      const assessment = evaluateProctoringAssessment(events, [], createCleanMockSession(), createCleanProcSession());

      assert.strictEqual(assessment.status, 'REVIEW_REQUIRED');
      assert.strictEqual(assessment.triggeredRules[0].ruleId, 'RULE_5_BROWSER_FOCUS_VISIBILITY');
      assert.strictEqual(assessment.triggeredRules[0].durationMs, 32000);
    });

    it('7. Three fullscreen exits trigger RULE_5_BROWSER_FOCUS_VISIBILITY -> REVIEW_REQUIRED', () => {
      const events = [
        createSyntheticEvent('ev_1', 'CAMERA_STARTED', 100),
        createSyntheticEvent('ev_2', 'SCREEN_SHARE_STARTED', 200),
        createSyntheticEvent('ev_3', 'FULLSCREEN_EXITED', 5000),
        createSyntheticEvent('ev_4', 'FULLSCREEN_EXITED', 15000),
        createSyntheticEvent('ev_5', 'FULLSCREEN_EXITED', 25000),
      ];
      const assessment = evaluateProctoringAssessment(events, [], createCleanMockSession(), createCleanProcSession());

      assert.strictEqual(assessment.status, 'REVIEW_REQUIRED');
      assert.strictEqual(assessment.triggeredRules[0].ruleId, 'RULE_5_BROWSER_FOCUS_VISIBILITY');
    });

    it('8. One 4s face absence produces CLEAR', () => {
      const events = [
        createSyntheticEvent('ev_1', 'CAMERA_STARTED', 100),
        createSyntheticEvent('ev_2', 'SCREEN_SHARE_STARTED', 200),
        createSyntheticEvent('ev_3', 'FACE_ABSENT', 5000, { duration: 4000 }),
      ];
      const assessment = evaluateProctoringAssessment(events, [], createCleanMockSession(), createCleanProcSession());

      assert.strictEqual(assessment.status, 'CLEAR');
      assert.strictEqual(assessment.triggeredRules.length, 0);
    });

    it('9. One 35s face absence triggers RULE_6_SUSTAINED_FACE_ABSENCE -> REVIEW_REQUIRED', () => {
      const events = [
        createSyntheticEvent('ev_1', 'CAMERA_STARTED', 100),
        createSyntheticEvent('ev_2', 'SCREEN_SHARE_STARTED', 200),
        createSyntheticEvent('ev_3', 'FACE_ABSENT', 5000, { duration: 35000 }),
      ];
      const assessment = evaluateProctoringAssessment(events, [], createCleanMockSession(), createCleanProcSession());

      assert.strictEqual(assessment.status, 'REVIEW_REQUIRED');
      assert.strictEqual(assessment.triggeredRules[0].ruleId, 'RULE_6_SUSTAINED_FACE_ABSENCE');
      assert.strictEqual(assessment.triggeredRules[0].durationMs, 35000);
    });

    it('10. Four face absence episodes trigger RULE_6_SUSTAINED_FACE_ABSENCE -> REVIEW_REQUIRED', () => {
      const events = [
        createSyntheticEvent('ev_1', 'CAMERA_STARTED', 100),
        createSyntheticEvent('ev_2', 'SCREEN_SHARE_STARTED', 200),
        createSyntheticEvent('ev_3', 'FACE_ABSENT', 10000, { duration: 5000 }),
        createSyntheticEvent('ev_4', 'FACE_ABSENT', 30000, { duration: 5000 }),
        createSyntheticEvent('ev_5', 'FACE_ABSENT', 50000, { duration: 5000 }),
        createSyntheticEvent('ev_6', 'FACE_ABSENT', 70000, { duration: 5000 }),
      ];
      const assessment = evaluateProctoringAssessment(events, [], createCleanMockSession(), createCleanProcSession());

      assert.strictEqual(assessment.status, 'REVIEW_REQUIRED');
      assert.strictEqual(assessment.triggeredRules[0].ruleId, 'RULE_6_SUSTAINED_FACE_ABSENCE');
      assert.strictEqual(assessment.triggeredRules[0].observedCount, 4);
    });

    it('11. One short head pose episode produces CLEAR', () => {
      const events = [
        createSyntheticEvent('ev_1', 'CAMERA_STARTED', 100),
        createSyntheticEvent('ev_2', 'SCREEN_SHARE_STARTED', 200),
        createSyntheticEvent('ev_3', 'HEAD_POSE_DEVIATION', 5000, { duration: 8000 }),
      ];
      const assessment = evaluateProctoringAssessment(events, [], createCleanMockSession(), createCleanProcSession());

      assert.strictEqual(assessment.status, 'CLEAR');
      assert.strictEqual(assessment.triggeredRules.length, 0);
    });

    it('12. 50s cumulative head pose deviation triggers RULE_4_HEAD_POSE_DEVIATION -> REVIEW_REQUIRED', () => {
      const events = [
        createSyntheticEvent('ev_1', 'CAMERA_STARTED', 100),
        createSyntheticEvent('ev_2', 'SCREEN_SHARE_STARTED', 200),
        createSyntheticEvent('ev_3', 'HEAD_POSE_DEVIATION', 5000, { duration: 50000 }),
      ];
      const assessment = evaluateProctoringAssessment(events, [], createCleanMockSession(), createCleanProcSession());

      assert.strictEqual(assessment.status, 'REVIEW_REQUIRED');
      assert.strictEqual(assessment.triggeredRules[0].ruleId, 'RULE_4_HEAD_POSE_DEVIATION');
      assert.strictEqual(assessment.triggeredRules[0].durationMs, 50000);
    });

    it('13. Five head pose episodes trigger RULE_4_HEAD_POSE_DEVIATION -> REVIEW_REQUIRED', () => {
      const events = [
        createSyntheticEvent('ev_1', 'CAMERA_STARTED', 100),
        createSyntheticEvent('ev_2', 'SCREEN_SHARE_STARTED', 200),
        createSyntheticEvent('ev_3', 'HEAD_POSE_DEVIATION', 10000, { duration: 2000 }),
        createSyntheticEvent('ev_4', 'HEAD_POSE_DEVIATION', 20000, { duration: 2000 }),
        createSyntheticEvent('ev_5', 'HEAD_POSE_DEVIATION', 30000, { duration: 2000 }),
        createSyntheticEvent('ev_6', 'HEAD_POSE_DEVIATION', 40000, { duration: 2000 }),
        createSyntheticEvent('ev_7', 'HEAD_POSE_DEVIATION', 50000, { duration: 2000 }),
      ];
      const assessment = evaluateProctoringAssessment(events, [], createCleanMockSession(), createCleanProcSession());

      assert.strictEqual(assessment.status, 'REVIEW_REQUIRED');
      assert.strictEqual(assessment.triggeredRules[0].ruleId, 'RULE_4_HEAD_POSE_DEVIATION');
      assert.strictEqual(assessment.triggeredRules[0].observedCount, 5);
    });

    it('14. Two Rule C face/attention correlations trigger RULE_1_FACE_ABSENT_ATTENTION -> REVIEW_REQUIRED', () => {
      const events = [
        createSyntheticEvent('ev_1', 'CAMERA_STARTED', 100),
        createSyntheticEvent('ev_2', 'SCREEN_SHARE_STARTED', 200),
        // Correlation 1
        createSyntheticEvent('ev_3', 'FACE_ABSENT', 10000, { duration: 2000 }),
        createSyntheticEvent('ev_4', 'FOCUS_LOST', 10500),
        // Correlation 2 (separated by > 3000ms window)
        createSyntheticEvent('ev_5', 'FACE_ABSENT', 30000, { duration: 2000 }),
        createSyntheticEvent('ev_6', 'PAGE_HIDDEN', 30800),
      ];
      const assessment = evaluateProctoringAssessment(events, [], createCleanMockSession(), createCleanProcSession());

      assert.strictEqual(assessment.status, 'REVIEW_REQUIRED');
      assert.strictEqual(assessment.triggeredRules[0].ruleId, 'RULE_1_FACE_ABSENT_ATTENTION');
      assert.strictEqual(assessment.triggeredRules[0].observedCount, 2);
    });

    it('15. One Rule C correlation produces CLEAR (under the 2-occurrence threshold)', () => {
      const events = [
        createSyntheticEvent('ev_1', 'CAMERA_STARTED', 100),
        createSyntheticEvent('ev_2', 'SCREEN_SHARE_STARTED', 200),
        createSyntheticEvent('ev_3', 'FACE_ABSENT', 10000, { duration: 3000 }),
        createSyntheticEvent('ev_4', 'FOCUS_LOST', 10500),
      ];
      const assessment = evaluateProctoringAssessment(events, [], createCleanMockSession(), createCleanProcSession());

      assert.strictEqual(assessment.status, 'CLEAR');
      assert.strictEqual(assessment.triggeredRules.length, 0);
    });

    it('16. Two Rule D screen/attention correlations trigger RULE_2_SCREEN_CHANGE_ATTENTION -> REVIEW_REQUIRED', () => {
      const events = [
        createSyntheticEvent('ev_1', 'CAMERA_STARTED', 100),
        createSyntheticEvent('ev_2', 'SCREEN_SHARE_STARTED', 200),
        // Cluster 1
        createSyntheticEvent('ev_3', 'SCREEN_VIEW_CHANGED', 10000, { duration: 2000 }),
        createSyntheticEvent('ev_4', 'FOCUS_LOST', 10400),
        // Cluster 2
        createSyntheticEvent('ev_5', 'SCREEN_VIEW_CHANGED', 30000, { duration: 2000 }),
        createSyntheticEvent('ev_6', 'PAGE_HIDDEN', 30400),
      ];
      const assessment = evaluateProctoringAssessment(events, [], createCleanMockSession(), createCleanProcSession());

      assert.strictEqual(assessment.status, 'REVIEW_REQUIRED');
      assert.strictEqual(assessment.triggeredRules[0].ruleId, 'RULE_2_SCREEN_CHANGE_ATTENTION');
      assert.strictEqual(assessment.triggeredRules[0].observedCount, 2);
    });

    it('17. One transient screen change produces CLEAR', () => {
      const events = [
        createSyntheticEvent('ev_1', 'CAMERA_STARTED', 100),
        createSyntheticEvent('ev_2', 'SCREEN_SHARE_STARTED', 200),
        createSyntheticEvent('ev_3', 'SCREEN_VIEW_CHANGED', 10000, { duration: 2000 }),
      ];
      const assessment = evaluateProctoringAssessment(events, [], createCleanMockSession(), createCleanProcSession());

      assert.strictEqual(assessment.status, 'CLEAR');
      assert.strictEqual(assessment.triggeredRules.length, 0);
    });

    it('18. One multiple-face episode < 10s produces CLEAR', () => {
      const events = [
        createSyntheticEvent('ev_1', 'CAMERA_STARTED', 100),
        createSyntheticEvent('ev_2', 'SCREEN_SHARE_STARTED', 200),
        createSyntheticEvent('ev_3', 'MULTIPLE_FACES', 10000, { duration: 6000 }),
      ];
      const assessment = evaluateProctoringAssessment(events, [], createCleanMockSession(), createCleanProcSession());

      assert.strictEqual(assessment.status, 'CLEAR');
      assert.strictEqual(assessment.triggeredRules.length, 0);
    });

    it('19. Sustained multiple-face > 10s triggers RULE_3_MULTIPLE_FACES -> REVIEW_REQUIRED', () => {
      const events = [
        createSyntheticEvent('ev_1', 'CAMERA_STARTED', 100),
        createSyntheticEvent('ev_2', 'SCREEN_SHARE_STARTED', 200),
        createSyntheticEvent('ev_3', 'MULTIPLE_FACES', 10000, { duration: 12000 }),
      ];
      const assessment = evaluateProctoringAssessment(events, [], createCleanMockSession(), createCleanProcSession());

      assert.strictEqual(assessment.status, 'REVIEW_REQUIRED');
      assert.strictEqual(assessment.triggeredRules[0].ruleId, 'RULE_3_MULTIPLE_FACES');
      assert.strictEqual(assessment.triggeredRules[0].durationMs, 12000);
    });

    it('20. Two multiple-face episodes totaling > 5s trigger RULE_3_MULTIPLE_FACES -> REVIEW_REQUIRED', () => {
      const events = [
        createSyntheticEvent('ev_1', 'CAMERA_STARTED', 100),
        createSyntheticEvent('ev_2', 'SCREEN_SHARE_STARTED', 200),
        createSyntheticEvent('ev_3', 'MULTIPLE_FACES', 10000, { duration: 3000 }),
        createSyntheticEvent('ev_4', 'MULTIPLE_FACES', 30000, { duration: 3500 }),
      ];
      const assessment = evaluateProctoringAssessment(events, [], createCleanMockSession(), createCleanProcSession());

      assert.strictEqual(assessment.status, 'REVIEW_REQUIRED');
      assert.strictEqual(assessment.triggeredRules[0].ruleId, 'RULE_3_MULTIPLE_FACES');
    });

    it('21. Answer-coincident observation without another threshold breached produces CLEAR', () => {
      // 1 focus loss near an answer
      const mockSession = createCleanMockSession({
        answers: [
          { questionId: 'q1', section: 'physics', selectedOption: 1, answeredAt: createTimestamp(5200) },
        ],
      });
      const events = [
        createSyntheticEvent('ev_1', 'CAMERA_STARTED', 100),
        createSyntheticEvent('ev_2', 'SCREEN_SHARE_STARTED', 200),
        createSyntheticEvent('ev_3', 'FOCUS_LOST', 5000, { duration: 1000 }),
      ];

      const assessment = evaluateProctoringAssessment(events, [], mockSession, createCleanProcSession());

      // Answer coincidence alone does NOT trigger review!
      assert.strictEqual(assessment.status, 'CLEAR');
      assert.strictEqual(assessment.triggeredRules.length, 0);
    });

    it('22. AnswerInteractionContext is correctly retained as supporting evidence when rule triggers', () => {
      const mockSession = createCleanMockSession({
        answers: [
          { questionId: 'q1', section: 'physics', selectedOption: 1, answeredAt: createTimestamp(10200) },
        ],
      });
      // 2 Rule C correlations, one of which coincides with the answer
      const events = [
        createSyntheticEvent('ev_1', 'CAMERA_STARTED', 100),
        createSyntheticEvent('ev_2', 'SCREEN_SHARE_STARTED', 200),
        createSyntheticEvent('ev_3', 'FACE_ABSENT', 10000, { duration: 2000 }),
        createSyntheticEvent('ev_4', 'FOCUS_LOST', 10500),
        createSyntheticEvent('ev_5', 'FACE_ABSENT', 30000, { duration: 2000 }),
        createSyntheticEvent('ev_6', 'PAGE_HIDDEN', 30500),
      ];

      const assessment = evaluateProctoringAssessment(events, [], mockSession, createCleanProcSession());

      assert.strictEqual(assessment.status, 'REVIEW_REQUIRED');
      assert.strictEqual(assessment.triggeredRules[0].ruleId, 'RULE_1_FACE_ABSENT_ATTENTION');
      assert.strictEqual(assessment.triggeredRules[0].answerCoincident, true);
    });

    it('23. Missing proctoring session produces INSUFFICIENT_DATA', () => {
      const events = [
        createSyntheticEvent('ev_1', 'FOCUS_LOST', 5000),
      ];
      // procSession is null
      const assessment = evaluateProctoringAssessment(events, [], createCleanMockSession(), null);

      assert.strictEqual(assessment.status, 'INSUFFICIENT_DATA');
      assert.ok(assessment.summary.includes('Proctoring session was never initiated'));
    });

    it('24. Missing webcam CV status produces INSUFFICIENT_DATA', () => {
      const procSession = createCleanProcSession({
        cameraState: 'inactive',
        metadata: { cvStatus: 'unavailable', screenAiStatus: 'active' },
      });
      const events = [
        createSyntheticEvent('ev_1', 'SCREEN_SHARE_STARTED', 200),
      ];

      const assessment = evaluateProctoringAssessment(events, [], createCleanMockSession(), procSession, {
        cvStatus: 'unavailable',
      });

      assert.strictEqual(assessment.status, 'INSUFFICIENT_DATA');
      assert.ok(assessment.summary.includes('Webcam computer-vision pipeline was unavailable'));
    });

    it('25. Missing screen monitoring status produces INSUFFICIENT_DATA', () => {
      const procSession = createCleanProcSession({
        screenShareState: 'denied',
        metadata: { cvStatus: 'active', screenAiStatus: 'unavailable' },
      });
      const events = [
        createSyntheticEvent('ev_1', 'CAMERA_STARTED', 200),
        createSyntheticEvent('ev_2', 'FACE_PRESENT', 300),
      ];

      const assessment = evaluateProctoringAssessment(events, [], createCleanMockSession(), procSession, {
        screenAiStatus: 'unavailable',
      });

      assert.strictEqual(assessment.status, 'INSUFFICIENT_DATA');
      assert.ok(assessment.summary.includes('Screen capture monitoring pipeline was unavailable'));
    });

    it('26. Normal exam teardown does not trigger media-interruption review', () => {
      const events = [
        createSyntheticEvent('ev_1', 'CAMERA_STARTED', 100),
        createSyntheticEvent('ev_2', 'SCREEN_SHARE_STARTED', 200),
        createSyntheticEvent('ev_3', 'FACE_PRESENT', 300),
        createSyntheticEvent('ev_4', 'CAMERA_STOPPED', 1800000, {
          metadata: { reason: 'exam_submitted' },
        }),
        createSyntheticEvent('ev_5', 'SCREEN_SHARE_STOPPED', 1800000, {
          metadata: { reason: 'exam_submitted' },
        }),
      ];

      const assessment = evaluateProctoringAssessment(events, [], createCleanMockSession(), createCleanProcSession());

      assert.strictEqual(assessment.status, 'CLEAR');
      assert.strictEqual(assessment.triggeredRules.length, 0);
    });

    it('27. Significant active-exam media interruption without recovery triggers RULE_7_MEDIA_INTERRUPTION -> REVIEW_REQUIRED', () => {
      const events = [
        createSyntheticEvent('ev_1', 'CAMERA_STARTED', 100),
        createSyntheticEvent('ev_2', 'SCREEN_SHARE_STARTED', 200),
        // Camera stopped mid-exam without reason === 'exam_submitted' and without recovery
        createSyntheticEvent('ev_3', 'CAMERA_STOPPED', 50000, {
          metadata: { reason: 'track_ended' },
        }),
      ];

      const assessment = evaluateProctoringAssessment(events, [], createCleanMockSession(), createCleanProcSession());

      assert.strictEqual(assessment.status, 'REVIEW_REQUIRED');
      assert.strictEqual(assessment.triggeredRules[0].ruleId, 'RULE_7_MEDIA_INTERRUPTION');
    });

    it('28. Conflicting review evidence + insufficient telemetry -> deterministic precedence (REVIEW_REQUIRED)', () => {
      // 5 focus losses (REVIEW_REQUIRED) + screen monitoring unavailable (INSUFFICIENT_DATA)
      const procSession = createCleanProcSession({
        screenShareState: 'denied',
        metadata: { cvStatus: 'active', screenAiStatus: 'unavailable' },
      });
      const events = [
        createSyntheticEvent('ev_1', 'CAMERA_STARTED', 100),
        createSyntheticEvent('ev_2', 'FACE_PRESENT', 200),
        createSyntheticEvent('ev_3', 'FOCUS_LOST', 5000, { duration: 1000 }),
        createSyntheticEvent('ev_4', 'FOCUS_LOST', 15000, { duration: 1000 }),
        createSyntheticEvent('ev_5', 'FOCUS_LOST', 25000, { duration: 1000 }),
        createSyntheticEvent('ev_6', 'FOCUS_LOST', 35000, { duration: 1000 }),
        createSyntheticEvent('ev_7', 'FOCUS_LOST', 45000, { duration: 1000 }),
      ];

      const assessment = evaluateProctoringAssessment(events, [], createCleanMockSession(), procSession, {
        screenAiStatus: 'unavailable',
      });

      // Deterministic precedence: REVIEW_REQUIRED takes precedence because positive evidence was observed
      assert.strictEqual(assessment.status, 'REVIEW_REQUIRED');
      assert.strictEqual(assessment.triggeredRules.length, 1);
      assert.strictEqual(assessment.triggeredRules[0].ruleId, 'RULE_5_BROWSER_FOCUS_VISIBILITY');
      // Insufficiency is recorded in metrics and summary
      assert.strictEqual(assessment.metrics.telemetrySufficiency, 'INSUFFICIENT');
      assert.ok(assessment.summary.includes('Screen capture monitoring pipeline was unavailable'));
    });

    it('29. Background heartbeats do not affect assessment outcome or trigger rules', () => {
      const events = [
        createSyntheticEvent('ev_1', 'CAMERA_STARTED', 100),
        createSyntheticEvent('ev_2', 'SCREEN_SHARE_STARTED', 200),
        createSyntheticEvent('ev_3', 'PROCTORING_HEARTBEAT', 30000),
        createSyntheticEvent('ev_4', 'PROCTORING_HEARTBEAT', 60000),
        createSyntheticEvent('ev_5', 'PROCTORING_HEARTBEAT', 90000),
        createSyntheticEvent('ev_6', 'PROCTORING_HEARTBEAT', 120000),
      ];

      const assessment = evaluateProctoringAssessment(events, [], createCleanMockSession(), createCleanProcSession());

      assert.strictEqual(assessment.status, 'CLEAR');
      assert.strictEqual(assessment.triggeredRules.length, 0);
    });

    it('30. Raw duplicate events remain usable without combinatorial explosion', () => {
      const events = [
        createSyntheticEvent('ev_1', 'CAMERA_STARTED', 100),
        createSyntheticEvent('ev_2', 'SCREEN_SHARE_STARTED', 200),
        createSyntheticEvent('ev_3', 'FOCUS_LOST', 5000),
        createSyntheticEvent('ev_3', 'FOCUS_LOST', 5000), // Duplicate ID and timestamp
      ];

      const assessment = evaluateProctoringAssessment(events, [], createCleanMockSession(), createCleanProcSession());

      assert.strictEqual(assessment.status, 'CLEAR');
    });

    it('31. Out-of-order events produce same result after deterministic sorting', () => {
      const eventA = createSyntheticEvent('ev_1', 'CAMERA_STARTED', 100);
      const eventB = createSyntheticEvent('ev_2', 'SCREEN_SHARE_STARTED', 200);
      const eventC = createSyntheticEvent('ev_3', 'FACE_ABSENT', 5000, { duration: 35000 });

      // Run with ordered events
      const resOrdered = evaluateProctoringAssessment([eventA, eventB, eventC], [], createCleanMockSession(), createCleanProcSession());

      // Run with reversed events
      const resReversed = evaluateProctoringAssessment([eventC, eventA, eventB], [], createCleanMockSession(), createCleanProcSession());

      assert.strictEqual(resOrdered.status, resReversed.status);
      assert.strictEqual(resOrdered.triggeredRules.length, resReversed.triggeredRules.length);
      assert.strictEqual(resOrdered.triggeredRules[0].ruleId, resReversed.triggeredRules[0].ruleId);
      assert.deepStrictEqual(resOrdered.metrics, resReversed.metrics);
    });

    it('32. Same input evaluated 5 times produces identical substantive output', () => {
      const events = [
        createSyntheticEvent('ev_1', 'CAMERA_STARTED', 100),
        createSyntheticEvent('ev_2', 'SCREEN_SHARE_STARTED', 200),
        createSyntheticEvent('ev_3', 'FACE_ABSENT', 5000, { duration: 35000 }),
        createSyntheticEvent('ev_4', 'FOCUS_LOST', 15000, { duration: 2000 }),
      ];

      const results = [];
      for (let i = 0; i < 5; i++) {
        results.push(evaluateProctoringAssessment(events, [], createCleanMockSession(), createCleanProcSession()));
      }

      for (let i = 1; i < 5; i++) {
        assert.strictEqual(results[i].status, results[0].status);
        assert.strictEqual(results[i].ruleSetVersion, results[0].ruleSetVersion);
        assert.strictEqual(results[i].summary, results[0].summary);
        assert.deepStrictEqual(results[i].triggeredRules, results[0].triggeredRules);
        assert.deepStrictEqual(results[i].metrics, results[0].metrics);
      }
    });

    it('33. Rule-set version is persisted as proctoring-v1', () => {
      const assessment = evaluateProctoringAssessment([], [], createCleanMockSession(), createCleanProcSession());
      assert.strictEqual(assessment.ruleSetVersion, PROCTORING_RULESET_VERSION);
      assert.strictEqual(assessment.ruleSetVersion, 'proctoring-v1');
    });

    it('34. Evidence IDs remain traceable on triggered rules', () => {
      const events = [
        createSyntheticEvent('ev_cam', 'CAMERA_STARTED', 100),
        createSyntheticEvent('ev_scr', 'SCREEN_SHARE_STARTED', 200),
        createSyntheticEvent('ev_focus_1', 'FOCUS_LOST', 5000, { duration: 1000 }),
        createSyntheticEvent('ev_focus_2', 'FOCUS_LOST', 15000, { duration: 1000 }),
        createSyntheticEvent('ev_focus_3', 'FOCUS_LOST', 25000, { duration: 1000 }),
        createSyntheticEvent('ev_focus_4', 'FOCUS_LOST', 35000, { duration: 1000 }),
      ];

      const assessment = evaluateProctoringAssessment(events, [], createCleanMockSession(), createCleanProcSession());

      assert.strictEqual(assessment.status, 'REVIEW_REQUIRED');
      const rule = assessment.triggeredRules[0];
      assert.ok(rule.evidenceEventIds.includes('ev_focus_1'));
      assert.ok(rule.evidenceEventIds.includes('ev_focus_2'));
      assert.ok(rule.evidenceEventIds.includes('ev_focus_3'));
      assert.ok(rule.evidenceEventIds.includes('ev_focus_4'));
    });

    it('35. Assessment engine has zero effect on academic scoring data', () => {
      const mockSession = createCleanMockSession({
        result: {
          score: 184,
          maxMarks: 300,
          percentage: 61,
          accuracy: 80,
          correctCount: 46,
          incorrectCount: 0,
        },
      });

      const events = [
        createSyntheticEvent('ev_1', 'CAMERA_STARTED', 100),
        createSyntheticEvent('ev_2', 'SCREEN_SHARE_STARTED', 200),
        createSyntheticEvent('ev_3', 'FACE_ABSENT', 5000, { duration: 35000 }),
      ];

      // Assessment runs
      const assessment = evaluateProctoringAssessment(events, [], mockSession, createCleanProcSession());
      assert.strictEqual(assessment.status, 'REVIEW_REQUIRED');

      // Academic result fields are completely untouched
      assert.strictEqual(mockSession.result.score, 184);
      assert.strictEqual(mockSession.result.maxMarks, 300);
      assert.strictEqual(mockSession.result.percentage, 61);
      assert.strictEqual(mockSession.result.correctCount, 46);
    });

    it('36. Negative boundaries: Assessment does NOT output cheating probabilities or suspicion scores', () => {
      const events = [
        createSyntheticEvent('ev_1', 'CAMERA_STARTED', 100),
        createSyntheticEvent('ev_2', 'SCREEN_SHARE_STARTED', 200),
        createSyntheticEvent('ev_3', 'FACE_ABSENT', 5000, { duration: 35000 }),
      ];

      const assessment = evaluateProctoringAssessment(events, [], createCleanMockSession(), createCleanProcSession());

      assert.strictEqual(assessment.cheatingScore, undefined);
      assert.strictEqual(assessment.cheatingProbability, undefined);
      assert.strictEqual(assessment.suspicionScore, undefined);
      assert.strictEqual(assessment.riskScore, undefined);
      assert.ok(!assessment.summary.toLowerCase().includes('cheated'));
      assert.ok(!assessment.summary.toLowerCase().includes('dishonest'));
      assert.ok(!assessment.summary.toLowerCase().includes('intent'));
    });

    it('37. Test A: FOCUS_REGAINED carries duration -> Rule 5 recognizes 42.347s interval', () => {
      const events = [
        createSyntheticEvent('ev_1', 'CAMERA_STARTED', 100),
        createSyntheticEvent('ev_2', 'SCREEN_SHARE_STARTED', 200),
        createSyntheticEvent('ev_3', 'FOCUS_LOST', 5000, { duration: 0 }),
        createSyntheticEvent('ev_4', 'FOCUS_REGAINED', 47347, { duration: 42347 }),
      ];

      const assessment = evaluateProctoringAssessment(events, [], createCleanMockSession(), createCleanProcSession());

      assert.strictEqual(assessment.status, 'REVIEW_REQUIRED');
      assert.strictEqual(assessment.triggeredRules.length, 1);
      assert.strictEqual(assessment.triggeredRules[0].ruleId, 'RULE_5_BROWSER_FOCUS_VISIBILITY');
      assert.strictEqual(assessment.triggeredRules[0].durationMs, 42347);
    });

    it('38. Test B: Multiple focus-loss intervals from FOCUS_REGAINED accumulate to 105837ms and trigger Rule 5', () => {
      const events = [
        createSyntheticEvent('ev_1', 'CAMERA_STARTED', 100),
        createSyntheticEvent('ev_2', 'SCREEN_SHARE_STARTED', 200),
        createSyntheticEvent('ev_3', 'FOCUS_LOST', 5000, { duration: 0 }),
        createSyntheticEvent('ev_4', 'FOCUS_REGAINED', 47347, { duration: 42347 }),
        createSyntheticEvent('ev_5', 'FOCUS_LOST', 60000, { duration: 0 }),
        createSyntheticEvent('ev_6', 'FOCUS_REGAINED', 95532, { duration: 35532 }),
        createSyntheticEvent('ev_7', 'FOCUS_LOST', 110000, { duration: 0 }),
        createSyntheticEvent('ev_8', 'FOCUS_REGAINED', 137958, { duration: 27958 }),
      ];

      const assessment = evaluateProctoringAssessment(events, [], createCleanMockSession(), createCleanProcSession());

      assert.strictEqual(assessment.status, 'REVIEW_REQUIRED');
      assert.strictEqual(assessment.triggeredRules.length, 1);
      assert.strictEqual(assessment.triggeredRules[0].ruleId, 'RULE_5_BROWSER_FOCUS_VISIBILITY');
      assert.strictEqual(assessment.triggeredRules[0].durationMs, 105837);
    });

    it('39. Test C: Below-threshold focus-loss duration (< 30s) produces CLEAR and does NOT trigger Rule 5', () => {
      const events = [
        createSyntheticEvent('ev_1', 'CAMERA_STARTED', 100),
        createSyntheticEvent('ev_2', 'SCREEN_SHARE_STARTED', 200),
        createSyntheticEvent('ev_3', 'FOCUS_LOST', 5000, { duration: 0 }),
        createSyntheticEvent('ev_4', 'FOCUS_REGAINED', 20000, { duration: 15000 }),
      ];

      const assessment = evaluateProctoringAssessment(events, [], createCleanMockSession(), createCleanProcSession());

      assert.strictEqual(assessment.status, 'CLEAR');
      assert.strictEqual(assessment.triggeredRules.length, 0);
    });

    it('40. Test D: Single focus-loss interval where both FOCUS_LOST and FOCUS_REGAINED carry duration is counted exactly once', () => {
      const events = [
        createSyntheticEvent('ev_1', 'CAMERA_STARTED', 100),
        createSyntheticEvent('ev_2', 'SCREEN_SHARE_STARTED', 200),
        createSyntheticEvent('ev_3', 'FOCUS_LOST', 5000, { duration: 20000 }),
        createSyntheticEvent('ev_4', 'FOCUS_REGAINED', 25000, { duration: 20000 }),
      ];

      const assessment = evaluateProctoringAssessment(events, [], createCleanMockSession(), createCleanProcSession());

      // 20000ms is < 30000ms threshold. If double-counted (40000ms), it would trigger Rule 5.
      assert.strictEqual(assessment.status, 'CLEAR');
      assert.strictEqual(assessment.triggeredRules.length, 0);
    });
  });
});
