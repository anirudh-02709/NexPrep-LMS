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

const {
  getProctoringReport,
} = require('../controllers/proctoringController');

describe('Backend Evaluation-State Correction & Precedence Suite (Phase 4B)', () => {
  const BASE_TIME = new Date('2026-09-24T10:00:00.000Z');

  function createTimestamp(offsetMs) {
    return new Date(BASE_TIME.getTime() + offsetMs);
  }

  function createMockTestDef() {
    return {
      _id: 'mock_test_4b_1',
      title: 'JEE Main Practice Mock Test - 4B',
      slug: 'jee-main-4b',
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
      _id: options._id || 'mock_sess_4b_1',
      user: options.user || 'user_student_4b',
      mockTest: options.mockTest || 'mock_test_4b_1',
      status: options.status || 'in_progress',
      evaluationStatus: options.evaluationStatus || 'PENDING',
      startedAt: options.startedAt || new Date(Date.now() - 30 * 60 * 1000),
      expiresAt: options.expiresAt || new Date(Date.now() + 150 * 60 * 1000),
      submittedAt: options.submittedAt || null,
      answers: options.answers || [
        { questionId: 'q-phy-1', section: 'physics', selectedOption: 0 }, // +4
        { questionId: 'q-phy-2', section: 'physics', selectedOption: 1 }, // +4
        { questionId: 'q-chem-1', section: 'chemistry', selectedOption: 0 }, // -1
        { questionId: 'q-math-1', section: 'maths', selectedOption: -1 }, // 0
      ],
      result: options.result !== undefined ? options.result : undefined,
      proctoringSession: options.proctoringSession !== undefined ? options.proctoringSession : 'proc_sess_4b_1',
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
      _id: options._id || 'proc_sess_4b_1',
      mockTestSession: options.mockTestSession || 'mock_sess_4b_1',
      user: options.user || 'user_student_4b',
      status: options.status || 'active',
      startedAt: createTimestamp(0),
      cameraState: options.cameraState || 'active',
      screenShareState: options.screenShareState || 'active',
      fullscreenState: options.fullscreenState || 'active',
      visibilityState: options.visibilityState || 'visible',
      metadata: options.metadata || { cvStatus: 'active', screenAiStatus: 'active' },
    };
  }

  function createNormalProctoringEvents(procSessionId = 'proc_sess_4b_1') {
    return [
      {
        _id: 'ev_start_cam',
        type: 'CAMERA_STARTED',
        source: 'browser',
        timestamp: createTimestamp(500),
        duration: 0,
        metadata: { width: 640, height: 480 },
        proctoringSession: procSessionId,
      },
      {
        _id: 'ev_start_screen',
        type: 'SCREEN_SHARE_STARTED',
        source: 'browser',
        timestamp: createTimestamp(600),
        duration: 0,
        metadata: { displaySurface: 'monitor' },
        proctoringSession: procSessionId,
      },
      {
        _id: 'ev_face_pres',
        type: 'FACE_PRESENT',
        source: 'webcam_cv',
        timestamp: createTimestamp(2000),
        duration: 0,
        metadata: { faceCount: 1 },
        proctoringSession: procSessionId,
      },
      {
        _id: 'ev_screen_stable',
        type: 'SCREEN_VIEW_STABLE',
        source: 'screen_monitor',
        timestamp: createTimestamp(2500),
        duration: 0,
        metadata: {},
        proctoringSession: procSessionId,
      },
    ];
  }

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

        ProctoringSession.findById = async (id) => setup.procSession;
        ProctoringSession.findOne = async (query) => setup.procSession;

        ProctoringEvent.find = (query) => ({
          sort: () => ({
            lean: async () => setup.events || [],
          }),
          lean: async () => setup.events || [],
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

  // ─── TEST 1: CLEAR → EVALUATED + Result Calculated ─────────────
  it('TEST 1: CLEAR assessment sets EVALUATED, calculates score and returns result', withMockDatabase(
    {
      mockSession: createCleanMockSession(),
      procSession: createCleanProcSession(),
      events: createNormalProctoringEvents(),
    },
    async ({ getSavedAssessment }) => {
      const session = createCleanMockSession();
      const mockTest = createMockTestDef();

      const finalization = await finalizeMockTestSession(session, mockTest);

      assert.equal(session.evaluationStatus, 'EVALUATED');
      assert.ok(session.result, 'Result must be calculated');
      assert.equal(session.result.score, 7, '2 correct (+8), 1 incorrect (-1) = 7');
      assert.equal(session.result.correctCount, 2);
      assert.equal(session.result.incorrectCount, 1);
      assert.equal(session.result.unattemptedCount, 1);
      assert.equal(finalization.assessment.status, 'CLEAR');
    }
  ));

  // ─── TEST 2: REVIEW_REQUIRED → HELD_FOR_REVIEW + No Result ─────
  it('TEST 2: REVIEW_REQUIRED sets HELD_FOR_REVIEW and strictly withholds result', withMockDatabase(
    {
      mockSession: createCleanMockSession(),
      procSession: createCleanProcSession(),
      // 4 focus loss events trigger RULE_5_BROWSER_FOCUS_VISIBILITY
      events: [
        ...createNormalProctoringEvents(),
        { _id: 'f1', type: 'FOCUS_LOST', source: 'browser', timestamp: createTimestamp(3000), duration: 1000 },
        { _id: 'f2', type: 'FOCUS_LOST', source: 'browser', timestamp: createTimestamp(5000), duration: 1000 },
        { _id: 'f3', type: 'FOCUS_LOST', source: 'browser', timestamp: createTimestamp(7000), duration: 1000 },
        { _id: 'f4', type: 'FOCUS_LOST', source: 'browser', timestamp: createTimestamp(9000), duration: 1000 },
      ],
    },
    async ({ getSavedAssessment }) => {
      const session = createCleanMockSession();
      const mockTest = createMockTestDef();

      const finalization = await finalizeMockTestSession(session, mockTest);

      assert.equal(session.evaluationStatus, 'HELD_FOR_REVIEW');
      assert.equal(session.result, undefined, 'Result MUST NOT be calculated');
      assert.equal(finalization.assessment.status, 'REVIEW_REQUIRED');
      assert.ok(finalization.assessment.triggeredRules.some((r) => r.ruleId === 'RULE_5_BROWSER_FOCUS_VISIBILITY'));
    }
  ));

  // ─── TEST 3: INSUFFICIENT_DATA + No Violations → HELD_TECHNICAL_REVIEW ─
  it('TEST 3: INSUFFICIENT_DATA with zero behavioral violations sets HELD_TECHNICAL_REVIEW and withholds result', withMockDatabase(
    {
      mockSession: createCleanMockSession(),
      procSession: createCleanProcSession({
        cameraState: 'denied', // Camera permission was denied, no camera events
      }),
      events: [
        {
          _id: 'ev_scr',
          type: 'SCREEN_SHARE_STARTED',
          source: 'browser',
          timestamp: createTimestamp(600),
          metadata: { displaySurface: 'monitor' },
        },
      ],
    },
    async ({ getSavedAssessment }) => {
      const session = createCleanMockSession();
      const mockTest = createMockTestDef();

      const finalization = await finalizeMockTestSession(session, mockTest);

      assert.equal(session.evaluationStatus, 'HELD_TECHNICAL_REVIEW');
      assert.equal(session.result, undefined, 'Result MUST NOT be calculated');
      assert.equal(finalization.assessment.status, 'INSUFFICIENT_DATA');
      assert.equal(finalization.assessment.triggeredRules.length, 0, 'Zero behavioral rules triggered');
    }
  ));

  // ─── TEST 4: INSUFFICIENT_DATA + Behavioral Violation → HELD_FOR_REVIEW ──
  it('TEST 4: Precedence rule: INSUFFICIENT_DATA + behavioral violations takes precedence as HELD_FOR_REVIEW', withMockDatabase(
    {
      mockSession: createCleanMockSession(),
      procSession: createCleanProcSession({
        cameraState: 'denied', // Telemetry is degraded/insufficient
      }),
      // Candidate also committed 4 focus losses (behavioral violation)
      events: [
        { _id: 'f1', type: 'FOCUS_LOST', source: 'browser', timestamp: createTimestamp(3000), duration: 1000 },
        { _id: 'f2', type: 'FOCUS_LOST', source: 'browser', timestamp: createTimestamp(5000), duration: 1000 },
        { _id: 'f3', type: 'FOCUS_LOST', source: 'browser', timestamp: createTimestamp(7000), duration: 1000 },
        { _id: 'f4', type: 'FOCUS_LOST', source: 'browser', timestamp: createTimestamp(9000), duration: 1000 },
      ],
    },
    async ({ getSavedAssessment }) => {
      const session = createCleanMockSession();
      const mockTest = createMockTestDef();

      const finalization = await finalizeMockTestSession(session, mockTest);

      // Precedence: Behavioral review strictly takes precedence over technical review
      assert.equal(session.evaluationStatus, 'HELD_FOR_REVIEW');
      assert.notEqual(session.evaluationStatus, 'HELD_TECHNICAL_REVIEW');
      assert.equal(session.result, undefined);
      assert.equal(finalization.assessment.status, 'REVIEW_REQUIRED');
      assert.ok(finalization.assessment.triggeredRules.some((r) => r.ruleId === 'RULE_5_BROWSER_FOCUS_VISIBILITY'));
      assert.equal(finalization.assessment.metrics.telemetrySufficiency, 'INSUFFICIENT');
    }
  ));

  // ─── TEST 5: Attempt-1-Style Focus Violations → HELD_FOR_REVIEW ─
  it('TEST 5: Attempt-1 regression: repeated focus losses produce HELD_FOR_REVIEW', withMockDatabase(
    {
      mockSession: createCleanMockSession(),
      procSession: createCleanProcSession(),
      // 8 focus lost events mirroring Attempt 1 (6ab532397652d7da29f9e6ce)
      events: [
        ...createNormalProctoringEvents(),
        { _id: 'fl1', type: 'FOCUS_LOST', source: 'browser', timestamp: createTimestamp(10000) },
        { _id: 'fl2', type: 'FOCUS_LOST', source: 'browser', timestamp: createTimestamp(20000) },
        { _id: 'fl3', type: 'FOCUS_LOST', source: 'browser', timestamp: createTimestamp(30000) },
        { _id: 'fl4', type: 'FOCUS_LOST', source: 'browser', timestamp: createTimestamp(40000) },
        { _id: 'fl5', type: 'FOCUS_LOST', source: 'browser', timestamp: createTimestamp(50000) },
        { _id: 'fl6', type: 'FOCUS_LOST', source: 'browser', timestamp: createTimestamp(60000) },
        { _id: 'fl7', type: 'FOCUS_LOST', source: 'browser', timestamp: createTimestamp(70000) },
        { _id: 'fl8', type: 'FOCUS_LOST', source: 'browser', timestamp: createTimestamp(80000) },
      ],
    },
    async () => {
      const session = createCleanMockSession();
      const mockTest = createMockTestDef();

      await finalizeMockTestSession(session, mockTest);

      assert.equal(session.evaluationStatus, 'HELD_FOR_REVIEW');
      assert.equal(session.result, undefined);
    }
  ));

  // ─── TEST 6: Attempt-2-Style Clean Telemetry Absence → HELD_TECHNICAL_REVIEW ─
  it('TEST 6: Attempt-2 regression: clean exam with missing camera telemetry maps to HELD_TECHNICAL_REVIEW', withMockDatabase(
    {
      mockSession: createCleanMockSession(),
      // Mirroring Attempt 2 (6ab533887652d7da29f9e6fb): camera inactive, no CV events, 0 focus lost, 0 face absent
      procSession: createCleanProcSession({
        cameraState: 'inactive',
      }),
      events: [
        {
          _id: 'ev_scr_only',
          type: 'SCREEN_SHARE_STARTED',
          source: 'screen',
          timestamp: createTimestamp(500),
          metadata: { displaySurface: 'monitor' },
        },
      ],
    },
    async ({ getSavedAssessment }) => {
      const session = createCleanMockSession();
      const mockTest = createMockTestDef();

      const finalization = await finalizeMockTestSession(session, mockTest);

      assert.equal(session.evaluationStatus, 'HELD_TECHNICAL_REVIEW');
      assert.notEqual(session.evaluationStatus, 'HELD_FOR_REVIEW');
      assert.equal(session.result, undefined);
      assert.equal(finalization.assessment.status, 'INSUFFICIENT_DATA');
      assert.equal(finalization.assessment.triggeredRules.length, 0);
    }
  ));

  // ─── TEST 7: Phase-4A-Style Clean Sufficient Telemetry → EVALUATED ─
  it('TEST 7: Phase-4A baseline: clean attempt with sufficient telemetry evaluates to EVALUATED with score', withMockDatabase(
    {
      mockSession: createCleanMockSession(),
      procSession: createCleanProcSession(),
      events: [
        { _id: 'e1', type: 'PROCTORING_STARTED', source: 'session', timestamp: createTimestamp(100), metadata: {} },
        { _id: 'e2', type: 'CAMERA_STARTED', source: 'media', timestamp: createTimestamp(200), metadata: { width: 640, height: 480 } },
        { _id: 'e3', type: 'SCREEN_SHARE_STARTED', source: 'screen', timestamp: createTimestamp(300), metadata: { displaySurface: 'monitor' } },
        { _id: 'e4', type: 'SCREEN_SURFACE_IDENTIFIED', source: 'screen', timestamp: createTimestamp(500), metadata: {} },
        { _id: 'e5', type: 'SCREEN_VIEW_STABLE', source: 'screen', timestamp: createTimestamp(2000), metadata: {} },
        { _id: 'e6', type: 'PROCTORING_STOPPED', source: 'session', timestamp: createTimestamp(10000), metadata: { reason: 'exam_submitted' } },
      ],
    },
    async () => {
      const session = createCleanMockSession();
      const mockTest = createMockTestDef();

      const finalization = await finalizeMockTestSession(session, mockTest);

      assert.equal(session.evaluationStatus, 'EVALUATED');
      assert.ok(session.result);
      assert.equal(session.result.score, 7);
      assert.equal(finalization.assessment.status, 'CLEAR');
    }
  ));

  // ─── TEST 8: GET /result Endpoint Distinguishes All States ─────
  it('TEST 8: GET /result endpoint correctly distinguishes EVALUATED, HELD_FOR_REVIEW, and HELD_TECHNICAL_REVIEW', withMockDatabase(
    {},
    async () => {
      const mockTest = createMockTestDef();

      // Case A: EVALUATED
      const evalSession = createCleanMockSession({
        _id: 'sess_evaluated',
        status: 'completed',
        evaluationStatus: 'EVALUATED',
        result: { score: 7, maxMarks: 16 },
      });
      const reqA = { params: { sessionId: 'sess_evaluated' }, user: { id: 'user_student_4b' } };
      const resA = createMockRes();
      MockTestSession.findById = async () => evalSession;
      await getMockTestResult(reqA, resA, () => {});
      assert.equal(resA.statusCode, 200);
      assert.equal(resA.body.evaluationStatus, 'EVALUATED');
      assert.ok(resA.body.result);
      assert.ok(resA.body.review);

      // Case B: HELD_FOR_REVIEW (Behavioral)
      const heldSession = createCleanMockSession({
        _id: 'sess_held_behavioral',
        status: 'completed',
        evaluationStatus: 'HELD_FOR_REVIEW',
        result: undefined,
      });
      const reqB = { params: { sessionId: 'sess_held_behavioral' }, user: { id: 'user_student_4b' } };
      const resB = createMockRes();
      MockTestSession.findById = async () => heldSession;
      await getMockTestResult(reqB, resB, () => {});
      assert.equal(resB.statusCode, 200);
      assert.equal(resB.body.evaluationStatus, 'HELD_FOR_REVIEW');
      assert.match(resB.body.message, /pending standard review/i);
      assert.equal(resB.body.result, undefined);
      assert.equal(resB.body.review, undefined);

      // Case C: HELD_TECHNICAL_REVIEW (Technical Insufficiency)
      const techSession = createCleanMockSession({
        _id: 'sess_held_technical',
        status: 'completed',
        evaluationStatus: 'HELD_TECHNICAL_REVIEW',
        result: undefined,
      });
      const reqC = { params: { sessionId: 'sess_held_technical' }, user: { id: 'user_student_4b' } };
      const resC = createMockRes();
      MockTestSession.findById = async () => techSession;
      await getMockTestResult(reqC, resC, () => {});
      assert.equal(resC.statusCode, 200);
      assert.equal(resC.body.evaluationStatus, 'HELD_TECHNICAL_REVIEW');
      assert.match(resC.body.message, /technical verification/i);
      assert.equal(resC.body.result, undefined);
      assert.equal(resC.body.review, undefined);
    }
  ));

  // ─── TEST 9: POST /submit Endpoint Distinguishes All States ────
  it('TEST 9: POST /submit endpoint correctly returns HELD_TECHNICAL_REVIEW when assessment is INSUFFICIENT_DATA', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        status: 'in_progress',
        evaluationStatus: 'PENDING',
      }),
      procSession: createCleanProcSession({
        cameraState: 'unsupported',
      }),
      events: [],
    },
    async () => {
      const req = {
        params: { sessionId: 'mock_sess_4b_1' },
        user: { id: 'user_student_4b' },
        body: { answers: [] },
      };
      const res = createMockRes();

      await submitMockTestSession(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.evaluationStatus, 'HELD_TECHNICAL_REVIEW');
      assert.match(res.body.message, /technical verification/i);
      assert.equal(res.body.result, undefined);
    }
  ));

  // ─── TEST 10: Proctoring Report Access Boundary ────────────────
  it('TEST 10: Proctoring report is accessible (HTTP 200) for HELD_TECHNICAL_REVIEW sessions', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        status: 'completed',
        evaluationStatus: 'HELD_TECHNICAL_REVIEW',
      }),
      procSession: createCleanProcSession(),
    },
    async () => {
      const req = {
        params: { sessionId: 'mock_sess_4b_1' },
        user: { id: 'user_student_4b' },
      };
      const res = createMockRes();
      let capturedErr = null;

      await getProctoringReport(req, res, (err) => {
        capturedErr = err;
      });

      assert.equal(res.statusCode, 200);
      assert.equal(capturedErr, null);
      assert.ok(res.body);
      assert.equal(res.body.success, true);
      assert.ok(res.body.report);
    }
  ));

  // ─── TEST 11: Idempotency of Terminal States ───────────────────
  it('TEST 11: finalizeMockTestSession handles HELD_TECHNICAL_REVIEW idempotently without re-evaluation', async () => {
    const session = createCleanMockSession({
      status: 'completed',
      evaluationStatus: 'HELD_TECHNICAL_REVIEW',
    });
    const mockTest = createMockTestDef();

    const res = await finalizeMockTestSession(session, mockTest);

    assert.equal(res.alreadyFinalized, true);
    assert.equal(res.assessment, null);
    assert.equal(session.evaluationStatus, 'HELD_TECHNICAL_REVIEW');
  });

  // ─── TEST 12: Schema Enum Validation ───────────────────────────
  it('TEST 12: Schema strictly permits PENDING, EVALUATED, HELD_FOR_REVIEW, HELD_TECHNICAL_REVIEW, REJECTED', () => {
    const validStatuses = ['PENDING', 'EVALUATED', 'HELD_FOR_REVIEW', 'HELD_TECHNICAL_REVIEW', 'REJECTED'];
    const enumValues = MockTestSession.schema.paths.evaluationStatus.enumValues;

    assert.deepStrictEqual(enumValues, validStatuses);

    // Negative check: unauthorized statuses must not be present
    assert.ok(!enumValues.includes('APPROVED'), 'APPROVED must not be in schema enum');
    assert.ok(!enumValues.includes('CANCELLED'), 'CANCELLED must not be in schema enum');
  });
});
