const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const MockTest = require('../models/MockTest');
const MockTestSession = require('../models/MockTestSession');
const ProctoringSession = require('../models/ProctoringSession');
const { ProctoringEvent } = require('../models/ProctoringEvent');
const ProctoringEpisode = require('../models/ProctoringEpisode');
const ProctoringAssessment = require('../models/ProctoringAssessment');

const {
  submitMockTestSession,
  getMockTestResult,
  finalizeMockTestSession,
} = require('../controllers/mockTestController');

describe('Server-Authoritative Evaluation Gate Integration Suite (Stage 2)', () => {
  const BASE_TIME = new Date('2026-09-23T10:00:00.000Z');

  function createTimestamp(offsetMs) {
    return new Date(BASE_TIME.getTime() + offsetMs);
  }

  function createMockTestDef() {
    return {
      _id: 'mock_test_gate_1',
      title: 'JEE Main Full Mock Test - Gate Test',
      slug: 'jee-main-gate-test',
      type: 'full_syllabus',
      duration: 180,
      totalQuestions: 4,
      totalMarks: 16,
      markingScheme: { correct: 4, incorrect: -1, unattempted: 0 },
      sections: {
        physics: { totalQuestions: 2, totalMarks: 8 },
        chemistry: { totalQuestions: 1, totalMarks: 4 },
        maths: { totalQuestions: 1, totalMarks: 4 },
      },
      questions: [
        { id: 'q-phy-1', section: 'physics', q: 'Phy Q1', options: ['A', 'B', 'C', 'D'], answer: 0 },
        { id: 'q-phy-2', section: 'physics', q: 'Phy Q2', options: ['A', 'B', 'C', 'D'], answer: 1 },
        { id: 'q-chem-1', section: 'chemistry', q: 'Chem Q1', options: ['A', 'B', 'C', 'D'], answer: 2 },
        { id: 'q-math-1', section: 'maths', q: 'Math Q1', options: ['A', 'B', 'C', 'D'], answer: 3 },
      ],
    };
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

  function createCleanMockSession(options = {}) {
    return {
      _id: options._id || 'mock_sess_gate_1',
      user: options.user || 'user_student_1',
      mockTest: options.mockTest || 'mock_test_gate_1',
      status: options.status || 'in_progress',
      evaluationStatus: options.evaluationStatus || 'PENDING',
      startedAt: options.startedAt || new Date(Date.now() - 30 * 60 * 1000),
      expiresAt: options.expiresAt || new Date(Date.now() + 150 * 60 * 1000), // unexpired
      submittedAt: options.submittedAt || null,
      answers: options.answers || [
        { questionId: 'q-phy-1', section: 'physics', selectedOption: 0 }, // correct (+4)
        { questionId: 'q-phy-2', section: 'physics', selectedOption: 1 }, // correct (+4)
        { questionId: 'q-chem-1', section: 'chemistry', selectedOption: 0 }, // wrong (-1)
        { questionId: 'q-math-1', section: 'maths', selectedOption: -1 }, // unattempted (0)
      ],
      result: options.result !== undefined ? options.result : undefined,
      proctoringSession: options.proctoringSession || 'proc_sess_gate_1',
      proctoringAssessment: options.proctoringAssessment || null,
      save: async function () {
        return this;
      },
      set: function (key, val) {
        this[key] = val;
      },
    };
  }

  function createCleanProcSession(options = {}) {
    return {
      _id: options._id || 'proc_sess_gate_1',
      mockTestSession: options.mockTestSession || 'mock_sess_gate_1',
      user: options.user || 'user_student_1',
      status: options.status || 'active',
      startedAt: createTimestamp(0),
      cameraState: options.cameraState || 'active',
      screenShareState: options.screenShareState || 'active',
      fullscreenState: options.fullscreenState || 'active',
      visibilityState: options.visibilityState || 'visible',
      metadata: options.metadata || { cvStatus: 'active', screenAiStatus: 'active' },
    };
  }

  function createNormalProctoringEvents(procSessionId = 'proc_sess_gate_1') {
    return [
      {
        _id: 'ev_start_cam',
        type: 'CAMERA_STARTED',
        source: 'browser',
        timestamp: createTimestamp(500),
        duration: 0,
        metadata: {},
        proctoringSession: procSessionId,
      },
      {
        _id: 'ev_start_scr',
        type: 'SCREEN_SHARE_STARTED',
        source: 'browser',
        timestamp: createTimestamp(1000),
        duration: 0,
        metadata: {},
        proctoringSession: procSessionId,
      },
      {
        _id: 'ev_face_pres',
        type: 'FACE_PRESENT',
        source: 'webcam_cv',
        timestamp: createTimestamp(2000),
        duration: 0,
        metadata: { confidence: 0.95 },
        proctoringSession: procSessionId,
      },
      {
        _id: 'ev_scr_stable',
        type: 'SCREEN_VIEW_STABLE',
        source: 'screen_monitor',
        timestamp: createTimestamp(3000),
        duration: 0,
        metadata: {},
        proctoringSession: procSessionId,
      },
    ];
  }

  function createRule1DiscrepancyEvents(procSessionId = 'proc_sess_gate_1') {
    return [
      ...createNormalProctoringEvents(procSessionId),
      // Occurrence 1: Face absent + Focus lost within 3s window
      {
        _id: 'ev_fa_1',
        type: 'FACE_ABSENT',
        source: 'webcam_cv',
        timestamp: createTimestamp(10000),
        duration: 2000,
        metadata: {},
        proctoringSession: procSessionId,
      },
      {
        _id: 'ev_fl_1',
        type: 'FOCUS_LOST',
        source: 'browser',
        timestamp: createTimestamp(10500),
        duration: 2000,
        metadata: {},
        proctoringSession: procSessionId,
      },
      // Occurrence 2: Face absent + Focus lost within 3s window
      {
        _id: 'ev_fa_2',
        type: 'FACE_ABSENT',
        source: 'webcam_cv',
        timestamp: createTimestamp(20000),
        duration: 2500,
        metadata: {},
        proctoringSession: procSessionId,
      },
      {
        _id: 'ev_fl_2',
        type: 'FOCUS_LOST',
        source: 'browser',
        timestamp: createTimestamp(20500),
        duration: 2500,
        metadata: {},
        proctoringSession: procSessionId,
      },
    ];
  }

  function createRule2DiscrepancyEvents(procSessionId = 'proc_sess_gate_1') {
    return [
      ...createNormalProctoringEvents(procSessionId),
      // Occurrence 1: Screen change + Focus lost within 3s window
      {
        _id: 'ev_sc_1',
        type: 'SCREEN_VIEW_CHANGED',
        source: 'screen_monitor',
        timestamp: createTimestamp(10000),
        duration: 2000,
        metadata: {},
        proctoringSession: procSessionId,
      },
      {
        _id: 'ev_fl_1',
        type: 'FOCUS_LOST',
        source: 'browser',
        timestamp: createTimestamp(10500),
        duration: 2000,
        metadata: {},
        proctoringSession: procSessionId,
      },
      // Occurrence 2: Screen change + Focus lost within 3s window
      {
        _id: 'ev_sc_2',
        type: 'SCREEN_VIEW_CHANGED',
        source: 'screen_monitor',
        timestamp: createTimestamp(20000),
        duration: 2500,
        metadata: {},
        proctoringSession: procSessionId,
      },
      {
        _id: 'ev_fl_2',
        type: 'FOCUS_LOST',
        source: 'browser',
        timestamp: createTimestamp(20500),
        duration: 2500,
        metadata: {},
        proctoringSession: procSessionId,
      },
    ];
  }

  function createRule3DiscrepancyEvents(procSessionId = 'proc_sess_gate_1') {
    return [
      ...createNormalProctoringEvents(procSessionId),
      {
        _id: 'ev_mf_1',
        type: 'MULTIPLE_FACES',
        source: 'webcam_cv',
        timestamp: createTimestamp(10000),
        duration: 12000, // > 10000ms threshold
        metadata: { faceCount: 2 },
        proctoringSession: procSessionId,
      },
    ];
  }

  // Helper to isolate Mongoose model stubs for a test
  function withMockDatabase(setup, testFn) {
    return async () => {
      const origMockFindById = MockTest.findById;
      const origSessionFindById = MockTestSession.findById;
      const origProcFindById = ProctoringSession.findById;
      const origProcFindOne = ProctoringSession.findOne;
      const origEventFind = ProctoringEvent.find;
      const origEpisodeFind = ProctoringEpisode.find;
      const origEpisodeDeleteMany = ProctoringEpisode.deleteMany;
      const origEpisodeInsertMany = ProctoringEpisode.insertMany;
      const origAssessmentFindOneAndUpdate = ProctoringAssessment.findOneAndUpdate;

      let savedAssessmentDoc = null;

      try {
        MockTest.findById = async (id) => setup.mockTest || createMockTestDef();
        MockTestSession.findById = async (id) => setup.mockSession;

        ProctoringSession.findById = async (id) => setup.procSession || createCleanProcSession();
        ProctoringSession.findOne = async (query) => setup.procSession || createCleanProcSession();

        ProctoringEvent.find = (query) => ({
          sort: () => ({
            lean: async () => setup.events || createNormalProctoringEvents(),
          }),
          lean: async () => setup.events || createNormalProctoringEvents(),
        });

        ProctoringEpisode.find = (query) => ({
          sort: () => ({
            lean: async () => setup.episodes || [],
          }),
          lean: async () => setup.episodes || [],
        });
        ProctoringEpisode.deleteMany = async () => ({ acknowledged: true, deletedCount: 0 });
        ProctoringEpisode.insertMany = async (docs) => docs;

        ProctoringAssessment.findOneAndUpdate = async (query, update, opts) => {
          savedAssessmentDoc = {
            _id: new mongoose.Types.ObjectId(),
            ...update,
          };
          return savedAssessmentDoc;
        };

        await testFn({
          getSavedAssessment: () => savedAssessmentDoc,
        });
      } finally {
        MockTest.findById = origMockFindById;
        MockTestSession.findById = origSessionFindById;
        ProctoringSession.findById = origProcFindById;
        ProctoringSession.findOne = origProcFindOne;
        ProctoringEvent.find = origEventFind;
        ProctoringEpisode.find = origEpisodeFind;
        ProctoringEpisode.deleteMany = origEpisodeDeleteMany;
        ProctoringEpisode.insertMany = origEpisodeInsertMany;
        ProctoringAssessment.findOneAndUpdate = origAssessmentFindOneAndUpdate;
      }
    };
  }

  // ─── 1. CLEAR Assessment on Submit ────────────────────────────
  it('1. submit: CLEAR proctoring assessment sets EVALUATED, scores test, and returns result', withMockDatabase(
    {
      mockSession: createCleanMockSession(),
      procSession: createCleanProcSession(),
      events: createNormalProctoringEvents(),
    },
    async ({ getSavedAssessment }) => {
      const req = {
        user: { id: 'user_student_1' },
        params: { sessionId: 'mock_sess_gate_1' },
        body: {},
      };
      const res = createMockRes();

      await submitMockTestSession(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.evaluationStatus, 'EVALUATED');
      assert.equal(res.body.status, 'completed');
      assert.ok(res.body.result, 'Response must contain result object');
      // Scoring: 2 correct (+8), 1 incorrect (-1), 1 unattempted (0) = 7
      assert.equal(res.body.result.score, 7);
      assert.equal(res.body.result.correctCount, 2);
      assert.equal(res.body.result.incorrectCount, 1);
      assert.equal(res.body.result.unattemptedCount, 1);

      // Verify assessment doc was persisted
      const savedAssessment = getSavedAssessment();
      assert.ok(savedAssessment);
      assert.equal(savedAssessment.status, 'CLEAR');
      assert.equal(savedAssessment.ruleSetVersion, 'proctoring-v1');
    }
  ));

  // ─── 2. CLEAR Assessment on GET /result ────────────────────────
  it('2. getResult: EVALUATED session returns 200 with result and detailed question review', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        status: 'completed',
        evaluationStatus: 'EVALUATED',
        result: { score: 7, maxMarks: 16, totalQuestions: 4, correctCount: 2, incorrectCount: 1, unattemptedCount: 1 },
      }),
    },
    async () => {
      const req = {
        user: { id: 'user_student_1' },
        params: { sessionId: 'mock_sess_gate_1' },
      };
      const res = createMockRes();

      await getMockTestResult(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.evaluationStatus, 'EVALUATED');
      assert.ok(res.body.result);
      assert.equal(res.body.result.score, 7);
      assert.ok(Array.isArray(res.body.review));
      assert.equal(res.body.review.length, 4);
    }
  ));

  // ─── 3. REVIEW_REQUIRED on Submit (Rule 1: Correlated Face Absent) ────
  it('3. submit: REVIEW_REQUIRED assessment sets HELD_FOR_REVIEW, withholds score, and omits result', withMockDatabase(
    {
      mockSession: createCleanMockSession(),
      procSession: createCleanProcSession(),
      events: createRule1DiscrepancyEvents(),
    },
    async ({ getSavedAssessment }) => {
      const req = {
        user: { id: 'user_student_1' },
        params: { sessionId: 'mock_sess_gate_1' },
        body: {},
      };
      const res = createMockRes();

      await submitMockTestSession(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.evaluationStatus, 'HELD_FOR_REVIEW');
      assert.equal(res.body.status, 'completed');
      assert.match(res.body.message, /pending standard review/i);

      // Strictly omits result and review
      assert.equal(res.body.result, undefined, 'Must NOT return result object');
      assert.equal(res.body.review, undefined, 'Must NOT return review object');

      // Verify assessment doc was persisted as REVIEW_REQUIRED
      const savedAssessment = getSavedAssessment();
      assert.ok(savedAssessment);
      assert.equal(savedAssessment.status, 'REVIEW_REQUIRED');
      assert.ok(savedAssessment.triggeredRules.some((r) => r.ruleId === 'RULE_1_FACE_ABSENT_ATTENTION'));
    }
  ));

  // ─── 4. REVIEW_REQUIRED on GET /result ─────────────────────────
  it('4. getResult: HELD_FOR_REVIEW session returns neutral message, omitting result and review', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        status: 'completed',
        evaluationStatus: 'HELD_FOR_REVIEW',
        result: undefined,
      }),
    },
    async () => {
      const req = {
        user: { id: 'user_student_1' },
        params: { sessionId: 'mock_sess_gate_1' },
      };
      const res = createMockRes();

      await getMockTestResult(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.evaluationStatus, 'HELD_FOR_REVIEW');
      assert.match(res.body.message, /pending standard review/i);
      assert.equal(res.body.result, undefined, 'Result MUST be omitted for held attempts');
      assert.equal(res.body.review, undefined, 'Review MUST be omitted for held attempts');
    }
  ));

  // ─── 5. REVIEW_REQUIRED on Submit (Rule 3: Multiple Faces) ─────
  it('5. submit: Multiple faces exceeding threshold triggers REVIEW_REQUIRED and withholds score', withMockDatabase(
    {
      mockSession: createCleanMockSession(),
      procSession: createCleanProcSession(),
      events: createRule3DiscrepancyEvents(),
    },
    async ({ getSavedAssessment }) => {
      const req = {
        user: { id: 'user_student_1' },
        params: { sessionId: 'mock_sess_gate_1' },
        body: {},
      };
      const res = createMockRes();

      await submitMockTestSession(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.evaluationStatus, 'HELD_FOR_REVIEW');
      assert.equal(res.body.result, undefined);

      const savedAssessment = getSavedAssessment();
      assert.equal(savedAssessment.status, 'REVIEW_REQUIRED');
      assert.ok(savedAssessment.triggeredRules.some((r) => r.ruleId === 'RULE_3_MULTIPLE_FACES'));
    }
  ));

  // ─── 6. INSUFFICIENT_DATA on Submit (CV Pipeline Unavailable) ──
  it('6. submit: INSUFFICIENT_DATA triggers HELD_TECHNICAL_REVIEW and withholds score', withMockDatabase(
    {
      mockSession: createCleanMockSession(),
      procSession: createCleanProcSession({
        metadata: { cvStatus: 'unavailable', screenAiStatus: 'active' },
      }),
      events: [
        {
          _id: 'ev_scr_start',
          type: 'SCREEN_SHARE_STARTED',
          source: 'browser',
          timestamp: createTimestamp(1000),
          proctoringSession: 'proc_sess_gate_1',
        },
      ],
    },
    async ({ getSavedAssessment }) => {
      const req = {
        user: { id: 'user_student_1' },
        params: { sessionId: 'mock_sess_gate_1' },
        body: {},
      };
      const res = createMockRes();

      await submitMockTestSession(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.evaluationStatus, 'HELD_TECHNICAL_REVIEW');
      assert.match(res.body.message, /technical verification/i);
      assert.equal(res.body.result, undefined);

      const savedAssessment = getSavedAssessment();
      assert.equal(savedAssessment.status, 'INSUFFICIENT_DATA');
      assert.match(savedAssessment.summary, /insufficient or materially degraded/i);
    }
  ));

  // ─── 7. HELD_TECHNICAL_REVIEW on GET /result ──────────────────
  it('7. getResult: HELD_TECHNICAL_REVIEW held attempt returns neutral technical-verification response', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        status: 'completed',
        evaluationStatus: 'HELD_TECHNICAL_REVIEW',
        result: undefined,
      }),
    },
    async () => {
      const req = {
        user: { id: 'user_student_1' },
        params: { sessionId: 'mock_sess_gate_1' },
      };
      const res = createMockRes();

      await getMockTestResult(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.evaluationStatus, 'HELD_TECHNICAL_REVIEW');
      assert.match(res.body.message, /technical verification/i);
      assert.equal(res.body.result, undefined);
      assert.equal(res.body.review, undefined);
    }
  ));

  // ─── 8. Stale Result Leakage Prevention (REVIEW_REQUIRED) ──────
  it('8. security: stale result on session is unseated and cleared when REVIEW_REQUIRED triggers', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        result: { score: 999, correctCount: 999 },
      }),
      procSession: createCleanProcSession(),
      events: createRule2DiscrepancyEvents(),
    },
    async () => {
      const session = createCleanMockSession({
        result: { score: 999, correctCount: 999 },
      });
      const mockTest = createMockTestDef();

      // Finalize session directly
      await finalizeMockTestSession(session, mockTest);

      assert.equal(session.evaluationStatus, 'HELD_FOR_REVIEW');
      assert.equal(session.result, undefined, 'Stale score MUST be completely wiped out');
    }
  ));

  // ─── 9. Stale Result Leakage Prevention (INSUFFICIENT_DATA) ────
  it('9. security: stale result is unseated and cleared when INSUFFICIENT_DATA triggers', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        result: { score: 100 },
      }),
      procSession: createCleanProcSession({
        cameraState: 'denied',
      }),
      events: [],
    },
    async () => {
      const session = createCleanMockSession({
        result: { score: 100 },
      });
      const mockTest = createMockTestDef();

      await finalizeMockTestSession(session, mockTest);

      assert.equal(session.evaluationStatus, 'HELD_TECHNICAL_REVIEW');
      assert.equal(session.result, undefined, 'Stale score MUST be cleared on INSUFFICIENT_DATA');
    }
  ));

  // ─── 10. Expired Session with CLEAR Proctoring (GET /result) ───
  it('10. expired: GET /result finalizes CLEAR expired session as EVALUATED and releases score', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        status: 'expired',
        evaluationStatus: 'PENDING',
        expiresAt: new Date(Date.now() - 60000), // Expired 1 min ago
        result: undefined,
      }),
      procSession: createCleanProcSession(),
      events: createNormalProctoringEvents(),
    },
    async ({ getSavedAssessment }) => {
      const req = {
        user: { id: 'user_student_1' },
        params: { sessionId: 'mock_sess_gate_1' },
      };
      const res = createMockRes();

      await getMockTestResult(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.evaluationStatus, 'EVALUATED');
      assert.equal(res.body.status, 'expired');
      assert.ok(res.body.result);
      assert.equal(res.body.result.score, 7);
      assert.ok(res.body.review);

      const savedAssessment = getSavedAssessment();
      assert.equal(savedAssessment.status, 'CLEAR');
    }
  ));

  // ─── 11. Expired Session with REVIEW_REQUIRED (GET /result) ────
  it('11. expired: GET /result finalizes REVIEW_REQUIRED expired session as HELD_FOR_REVIEW with score withheld', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        status: 'expired',
        evaluationStatus: 'PENDING',
        expiresAt: new Date(Date.now() - 60000), // Expired 1 min ago
        result: undefined,
      }),
      procSession: createCleanProcSession(),
      events: createRule1DiscrepancyEvents(),
    },
    async () => {
      const req = {
        user: { id: 'user_student_1' },
        params: { sessionId: 'mock_sess_gate_1' },
      };
      const res = createMockRes();

      await getMockTestResult(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.evaluationStatus, 'HELD_FOR_REVIEW');
      assert.equal(res.body.result, undefined);
      assert.equal(res.body.review, undefined);
      assert.match(res.body.message, /pending standard review/i);
    }
  ));

  // ─── 12. Expired Session with INSUFFICIENT_DATA (GET /result) ──
  it('12. expired: GET /result finalizes INSUFFICIENT_DATA expired session as HELD_TECHNICAL_REVIEW with score withheld', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        status: 'expired',
        evaluationStatus: 'PENDING',
        expiresAt: new Date(Date.now() - 60000), // Expired 1 min ago
        result: undefined,
      }),
      procSession: createCleanProcSession({
        metadata: { cvStatus: 'unavailable', screenAiStatus: 'unavailable' },
      }),
      events: [],
    },
    async () => {
      const req = {
        user: { id: 'user_student_1' },
        params: { sessionId: 'mock_sess_gate_1' },
      };
      const res = createMockRes();

      await getMockTestResult(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.evaluationStatus, 'HELD_TECHNICAL_REVIEW');
      assert.match(res.body.message, /technical verification/i);
      assert.equal(res.body.result, undefined);
      assert.equal(res.body.review, undefined);
    }
  ));

  // ─── 13. Duplicate Submit Idempotency ──────────────────────────
  it('13. idempotency: submitMockTestSession rejects duplicate submission of already completed session with 400', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        status: 'completed',
        evaluationStatus: 'EVALUATED',
        result: { score: 7 },
      }),
    },
    async () => {
      const req = {
        user: { id: 'user_student_1' },
        params: { sessionId: 'mock_sess_gate_1' },
        body: {},
      };
      const res = createMockRes();
      let errorThrown = null;

      await submitMockTestSession(req, res, (err) => {
        errorThrown = err;
      });

      assert.equal(res.statusCode, 400);
      assert.match(errorThrown.message, /already been submitted/i);
    }
  ));

  // ─── 14. Repeated GET /result Idempotency for EVALUATED ────────
  it('14. idempotency: repeated GET /result calls on EVALUATED attempt return identical result without re-evaluating', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        status: 'completed',
        evaluationStatus: 'EVALUATED',
        result: { score: 7, maxMarks: 16, totalQuestions: 4, correctCount: 2, incorrectCount: 1, unattemptedCount: 1 },
      }),
    },
    async () => {
      const req = {
        user: { id: 'user_student_1' },
        params: { sessionId: 'mock_sess_gate_1' },
      };

      const res1 = createMockRes();
      await getMockTestResult(req, res1, () => {});

      const res2 = createMockRes();
      await getMockTestResult(req, res2, () => {});

      assert.equal(res1.statusCode, 200);
      assert.equal(res2.statusCode, 200);
      assert.deepEqual(res1.body.result, res2.body.result);
      assert.equal(res1.body.evaluationStatus, res2.body.evaluationStatus);
    }
  ));

  // ─── 15. Repeated GET /result Idempotency for HELD_FOR_REVIEW ──
  it('15. idempotency: repeated GET /result calls on HELD_FOR_REVIEW return identical neutral message', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        status: 'completed',
        evaluationStatus: 'HELD_FOR_REVIEW',
        result: undefined,
      }),
    },
    async () => {
      const req = {
        user: { id: 'user_student_1' },
        params: { sessionId: 'mock_sess_gate_1' },
      };

      const res1 = createMockRes();
      await getMockTestResult(req, res1, () => {});

      const res2 = createMockRes();
      await getMockTestResult(req, res2, () => {});

      assert.equal(res1.statusCode, 200);
      assert.equal(res2.statusCode, 200);
      assert.equal(res1.body.evaluationStatus, 'HELD_FOR_REVIEW');
      assert.equal(res2.body.evaluationStatus, 'HELD_FOR_REVIEW');
      assert.equal(res1.body.result, undefined);
      assert.equal(res2.body.result, undefined);
    }
  ));

  // ─── 16. Assessment Record Structure and DB Persistence ────────
  it('16. persistence: ProctoringAssessment is persisted with schema fidelity and linked in session', withMockDatabase(
    {
      mockSession: createCleanMockSession(),
      procSession: createCleanProcSession(),
      events: createNormalProctoringEvents(),
    },
    async ({ getSavedAssessment }) => {
      const session = createCleanMockSession();
      const mockTest = createMockTestDef();

      const { session: finalized, assessment } = await finalizeMockTestSession(session, mockTest);

      assert.equal(finalized.evaluationStatus, 'EVALUATED');
      assert.ok(finalized.proctoringAssessment, 'Session must link to proctoringAssessment');

      const saved = getSavedAssessment();
      assert.ok(saved);
      assert.equal(saved.status, 'CLEAR');
      assert.equal(saved.ruleSetVersion, 'proctoring-v1');
      assert.ok(Array.isArray(saved.triggeredRules));
      assert.equal(saved.triggeredRules.length, 0);
      assert.ok(saved.metrics);
      assert.ok(saved.evaluatedAt);
    }
  ));

  // ─── 17. Information Disclosure Verification on Held Attempts ──
  it('17. privacy: candidate response on hold strictly excludes proctoring internals and rule IDs', withMockDatabase(
    {
      mockSession: createCleanMockSession(),
      procSession: createCleanProcSession(),
      events: createRule1DiscrepancyEvents(),
    },
    async () => {
      const req = {
        user: { id: 'user_student_1' },
        params: { sessionId: 'mock_sess_gate_1' },
        body: {},
      };
      const res = createMockRes();

      await submitMockTestSession(req, res, () => {});

      const responseJson = JSON.stringify(res.body);

      // Verify forbidden leak terms
      const forbiddenTerms = [
        'RULE_1',
        'RULE_2',
        'RULE_3',
        'FACE_ABSENT',
        'MULTIPLE_FACES',
        'HEAD_POSE',
        'cheating',
        'suspicious',
        'flagged',
        'threshold',
        'metrics',
        'triggeredRules',
      ];

      forbiddenTerms.forEach((term) => {
        assert.equal(
          responseJson.toLowerCase().includes(term.toLowerCase()),
          false,
          `Candidate response must NOT leak '${term}'`
        );
      });
    }
  ));

  // ─── 18. Tamper Resistance: Client Injected Evaluation Status ───
  it('18. security: client supplying evaluationStatus EVALUATED in payload cannot bypass proctoring hold', withMockDatabase(
    {
      mockSession: createCleanMockSession(),
      procSession: createCleanProcSession(),
      events: createRule1DiscrepancyEvents(),
    },
    async () => {
      const req = {
        user: { id: 'user_student_1' },
        params: { sessionId: 'mock_sess_gate_1' },
        body: {
          // Attacker attempts to forge evaluationStatus and inject score
          evaluationStatus: 'EVALUATED',
          status: 'completed',
          result: { score: 999 },
          score: 999,
        },
      };
      const res = createMockRes();

      await submitMockTestSession(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.evaluationStatus, 'HELD_FOR_REVIEW', 'Server must enforce HELD_FOR_REVIEW');
      assert.equal(res.body.result, undefined, 'Result MUST be withheld');
    }
  ));

  // ─── 19. Answer Merging on Submit with Evaluation Gate ─────────
  it('19. submit: valid submitted answers are merged and scored when assessment is CLEAR', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        answers: [], // Initially empty
      }),
      procSession: createCleanProcSession(),
      events: createNormalProctoringEvents(),
    },
    async () => {
      const req = {
        user: { id: 'user_student_1' },
        params: { sessionId: 'mock_sess_gate_1' },
        body: {
          answers: [
            { questionId: 'q-phy-1', selectedOption: 0 }, // correct (+4)
            { questionId: 'q-chem-1', selectedOption: 2 }, // correct (+4)
          ],
        },
      };
      const res = createMockRes();

      await submitMockTestSession(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.evaluationStatus, 'EVALUATED');
      assert.ok(res.body.result);
      // 2 correct (+8), 0 incorrect, 2 unattempted (0) = 8
      assert.equal(res.body.result.score, 8);
      assert.equal(res.body.result.correctCount, 2);
    }
  ));

  // ─── 20. Authorization Enforcement on Submit ──────────────────
  it('20. security: submit rejects unauthorized user with HTTP 403', withMockDatabase(
    {
      mockSession: createCleanMockSession({ user: 'user_owner' }),
    },
    async () => {
      const req = {
        user: { id: 'user_attacker' },
        params: { sessionId: 'mock_sess_gate_1' },
        body: {},
      };
      const res = createMockRes();
      let errorThrown = null;

      await submitMockTestSession(req, res, (err) => {
        errorThrown = err;
      });

      assert.equal(res.statusCode, 403);
      assert.match(errorThrown.message, /not authorized/i);
    }
  ));

  // ─── 21. Authorization Enforcement on GET /result ─────────────
  it('21. security: getResult rejects unauthorized user with HTTP 403', withMockDatabase(
    {
      mockSession: createCleanMockSession({ user: 'user_owner', status: 'completed' }),
    },
    async () => {
      const req = {
        user: { id: 'user_attacker' },
        params: { sessionId: 'mock_sess_gate_1' },
      };
      const res = createMockRes();
      let errorThrown = null;

      await getMockTestResult(req, res, (err) => {
        errorThrown = err;
      });

      assert.equal(res.statusCode, 403);
      assert.match(errorThrown.message, /not authorized/i);
    }
  ));

  // ─── 22. In-Progress Session Result Rejection ──────────────────
  it('22. lifecycle: getResult rejects active in-progress session with HTTP 400', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        status: 'in_progress',
        expiresAt: new Date(Date.now() + 3600000), // Not expired
      }),
    },
    async () => {
      const req = {
        user: { id: 'user_student_1' },
        params: { sessionId: 'mock_sess_gate_1' },
      };
      const res = createMockRes();
      let errorThrown = null;

      await getMockTestResult(req, res, (err) => {
        errorThrown = err;
      });

      assert.equal(res.statusCode, 400);
      assert.match(errorThrown.message, /still in progress/i);
    }
  ));

  // ─── 23. Non-Existent Session Handling ────────────────────────
  it('23. error handling: submit and getResult return 404 for non-existent session', withMockDatabase(
    {
      mockSession: null, // Session not found
    },
    async () => {
      const req = {
        user: { id: 'user_student_1' },
        params: { sessionId: 'non_existent_id' },
        body: {},
      };

      const resSubmit = createMockRes();
      let errSubmit = null;
      await submitMockTestSession(req, resSubmit, (err) => {
        errSubmit = err;
      });
      assert.equal(resSubmit.statusCode, 404);
      assert.match(errSubmit.message, /not found/i);

      const resResult = createMockRes();
      let errResult = null;
      await getMockTestResult(req, resResult, (err) => {
        errResult = err;
      });
      assert.equal(resResult.statusCode, 404);
      assert.match(errResult.message, /not found/i);
    }
  ));

  // ─── 24. Expired Session Submission Rejection ─────────────────
  it('24. lifecycle: submit rejects submission of already expired session with HTTP 400', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        status: 'expired',
      }),
    },
    async () => {
      const req = {
        user: { id: 'user_student_1' },
        params: { sessionId: 'mock_sess_gate_1' },
        body: {},
      };
      const res = createMockRes();
      let errorThrown = null;

      await submitMockTestSession(req, res, (err) => {
        errorThrown = err;
      });

      assert.equal(res.statusCode, 400);
      assert.match(errorThrown.message, /expired/i);
    }
  ));

  // ─── 25. finalizeMockTestSession Direct Invocation & Idempotency
  it('25. gate service: finalizeMockTestSession returns structured result and handles repeat calls idempotently', withMockDatabase(
    {
      procSession: createCleanProcSession(),
      events: createNormalProctoringEvents(),
    },
    async () => {
      const session = createCleanMockSession();
      const mockTest = createMockTestDef();

      // First call
      const res1 = await finalizeMockTestSession(session, mockTest);
      assert.equal(res1.session.evaluationStatus, 'EVALUATED');
      assert.ok(res1.session.result);
      assert.equal(res1.session.result.score, 7);
      assert.equal(res1.alreadyFinalized, undefined);

      // Second call on already finalized session
      const res2 = await finalizeMockTestSession(session, mockTest);
      assert.equal(res2.session.evaluationStatus, 'EVALUATED');
      assert.equal(res2.alreadyFinalized, true);
    }
  ));
});
