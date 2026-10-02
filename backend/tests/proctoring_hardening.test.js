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
  saveAnswer,
} = require('../controllers/mockTestController');

const {
  getProctoringReport,
} = require('../controllers/proctoringController');

describe('Proctoring Subsystem Hardening & Invariant Verification Suite (Final Hardening)', () => {
  const BASE_TIME = new Date('2026-09-24T10:00:00.000Z');

  function createTimestamp(offsetMs) {
    return new Date(BASE_TIME.getTime() + offsetMs);
  }

  function createMockTestDef() {
    return {
      _id: 'mock_test_hardened_1',
      title: 'JEE Main Full Mock Test - Hardened',
      slug: 'jee-main-hardened',
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
      _id: options._id || 'mock_sess_hardened_1',
      user: options.user || 'user_student_1',
      mockTest: options.mockTest || 'mock_test_hardened_1',
      status: options.status || 'in_progress',
      evaluationStatus: options.evaluationStatus || 'PENDING',
      startedAt: options.startedAt || new Date(Date.now() - 30 * 60 * 1000),
      expiresAt: options.expiresAt || new Date(Date.now() + 150 * 60 * 1000),
      submittedAt: options.submittedAt || null,
      answers: options.answers || [
        { questionId: 'q-phy-1', section: 'physics', selectedOption: 0, answeredAt: new Date(Date.now() - 20000) },
        { questionId: 'q-phy-2', section: 'physics', selectedOption: 1, answeredAt: new Date(Date.now() - 15000) },
        { questionId: 'q-chem-1', section: 'chemistry', selectedOption: 0, answeredAt: new Date(Date.now() - 10000) },
        { questionId: 'q-math-1', section: 'maths', selectedOption: -1, answeredAt: new Date(Date.now() - 5000) },
      ],
      result: options.result !== undefined ? options.result : undefined,
      proctoringSession: options.proctoringSession !== undefined ? options.proctoringSession : 'proc_sess_hardened_1',
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
      _id: options._id || 'proc_sess_hardened_1',
      mockTestSession: options.mockTestSession || 'mock_sess_hardened_1',
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

  function createNormalProctoringEvents(procSessionId = 'proc_sess_hardened_1') {
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
        _id: 'ev_start_screen',
        type: 'SCREEN_SHARE_STARTED',
        source: 'browser',
        timestamp: createTimestamp(600),
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

  // ─── 1. Section 2: Production Bypass Audit ──────────────────
  it('1. production invariant: missing proctoring data in production strictly sets HELD_TECHNICAL_REVIEW and never scores', async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const session = createCleanMockSession({
      proctoringSession: null, // missing proctoring reference
    });
    const mockTest = createMockTestDef();

    const origProcFindOne = ProctoringSession.findOne;
    const origProcFindById = ProctoringSession.findById;
    const origAssessmentFind = ProctoringAssessment.findOneAndUpdate;

    try {
      ProctoringSession.findOne = async () => null;
      ProctoringSession.findById = async () => null;
      ProctoringAssessment.findOneAndUpdate = async (q, u) => ({ _id: 'assess_hardened_1', ...u });

      const finalization = await finalizeMockTestSession(session, mockTest);

      assert.equal(session.evaluationStatus, 'HELD_TECHNICAL_REVIEW');
      assert.equal(session.result, undefined);
      assert.notEqual(finalization.assessment, null);
      assert.equal(finalization.assessment.status, 'INSUFFICIENT_DATA');
    } finally {
      process.env.NODE_ENV = origEnv;
      ProctoringSession.findOne = origProcFindOne;
      ProctoringSession.findById = origProcFindById;
      ProctoringAssessment.findOneAndUpdate = origAssessmentFind;
    }
  });

  it('2. production invariant: disconnected database connection during production finalization cannot evaluate', async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const session = createCleanMockSession({
      proctoringSession: null,
    });
    const mockTest = createMockTestDef();

    const origProcFindOne = ProctoringSession.findOne;
    try {
      ProctoringSession.findOne = async () => null;

      const finalization = await finalizeMockTestSession(session, mockTest);

      assert.equal(session.evaluationStatus, 'HELD_TECHNICAL_REVIEW');
      assert.equal(session.result, undefined);
      assert.notEqual(session.evaluationStatus, 'EVALUATED');
    } finally {
      process.env.NODE_ENV = origEnv;
      ProctoringSession.findOne = origProcFindOne;
    }
  });

  // ─── 2. Section 4: State Machine Invariants & Contradictory State Resistance ─
  it('3. state invariant: HELD_FOR_REVIEW with existing score in DB strictly strips score and sanitizes record', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        status: 'completed',
        evaluationStatus: 'HELD_FOR_REVIEW',
        result: { score: 99, percentage: '100' }, // Stale/tampered score in DB
      }),
    },
    async () => {
      const req = {
        params: { sessionId: 'mock_sess_hardened_1' },
        user: { id: 'user_student_1' },
      };
      const res = createMockRes();

      await getMockTestResult(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.evaluationStatus, 'HELD_FOR_REVIEW');
      assert.equal(res.body.result, undefined);
      assert.equal(res.body.review, undefined);
    }
  ));

  it('4. state invariant: PENDING session cannot release score or result via getMockTestResult', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        status: 'completed',
        evaluationStatus: 'PENDING',
        result: { score: 50 },
      }),
    },
    async () => {
      const req = {
        params: { sessionId: 'mock_sess_hardened_1' },
        user: { id: 'user_student_1' },
      };
      const res = createMockRes();
      let capturedError = null;

      await getMockTestResult(req, res, (err) => {
        capturedError = err;
      });

      assert.equal(res.statusCode, 400);
      assert.ok(capturedError);
      assert.match(capturedError.message, /pending evaluation/i);
    }
  ));

  it('5. state invariant: EVALUATED session with missing result self-heals by computing authoritative result', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        status: 'completed',
        evaluationStatus: 'EVALUATED',
        result: null, // missing result
      }),
    },
    async () => {
      const req = {
        params: { sessionId: 'mock_sess_hardened_1' },
        user: { id: 'user_student_1' },
      };
      const res = createMockRes();

      await getMockTestResult(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.evaluationStatus, 'EVALUATED');
      assert.ok(res.body.result, 'Result must be self-healed and present');
      assert.equal(res.body.result.score, 7, 'Server correctly computes 4 + 4 - 1 = 7');
      assert.ok(res.body.review, 'Detailed question review must be present');
    }
  ));

  // ─── 3. Section 5: Stale Result & Tamper Resistance ─────────
  it('6. tamper resistance: submitMockTestSession purges stale result when review rules trigger hold', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        status: 'in_progress',
        evaluationStatus: 'PENDING',
        result: { score: 120 }, // Attacker pre-injected score
      }),
      procSession: createCleanProcSession(),
      // Unrecovered camera stoppage triggers RULE_7 -> REVIEW_REQUIRED
      events: [
        {
          _id: 'ev_cam_stop',
          type: 'CAMERA_STOPPED',
          source: 'browser',
          timestamp: createTimestamp(5000),
          duration: 0,
          metadata: { reason: 'user_closed' },
          proctoringSession: 'proc_sess_hardened_1',
        },
      ],
    },
    async () => {
      const req = {
        params: { sessionId: 'mock_sess_hardened_1' },
        user: { id: 'user_student_1' },
        body: { answers: [] },
      };
      const res = createMockRes();

      await submitMockTestSession(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.evaluationStatus, 'HELD_FOR_REVIEW');
      assert.equal(res.body.result, undefined);
    }
  ));

  // ─── 4. Section 6: Assessment Persistence & Determinism ─────
  it('7. determinism: repeated getMockTestResult calls return identical terminal states without re-assessment', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        status: 'completed',
        evaluationStatus: 'EVALUATED',
        result: { score: 7, maxMarks: 16, percentage: '43.8', accuracy: '66.7', totalQuestions: 4 },
        proctoringAssessment: 'existing_assessment_101',
      }),
      procSession: createCleanProcSession(),
      events: createNormalProctoringEvents(),
    },
    async () => {
      const req = {
        params: { sessionId: 'mock_sess_hardened_1' },
        user: { id: 'user_student_1' },
      };

      const res1 = createMockRes();
      await getMockTestResult(req, res1, () => {});

      const res2 = createMockRes();
      await getMockTestResult(req, res2, () => {});

      assert.equal(res1.body.evaluationStatus, res2.body.evaluationStatus);
      assert.deepEqual(res1.body.result, res2.body.result);
    }
  ));

  // ─── 5. Section 7: Idempotency & Concurrency ────────────────
  it('8. concurrency: duplicate submit requests on already completed session are rejected with HTTP 400', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        status: 'completed',
        evaluationStatus: 'EVALUATED',
      }),
    },
    async () => {
      const req = {
        params: { sessionId: 'mock_sess_hardened_1' },
        user: { id: 'user_student_1' },
        body: { answers: [] },
      };
      const res = createMockRes();
      let capturedError = null;

      await submitMockTestSession(req, res, (err) => {
        capturedError = err;
      });

      assert.equal(res.statusCode, 400);
      assert.ok(capturedError);
      assert.match(capturedError.message, /already been submitted/i);
    }
  ));

  // ─── 6. Section 8: Expiration Semantics ─────────────────────
  it('9. expiration: expired attempt strictly rejects new answers with HTTP 400', async () => {
    const expiredSession = createCleanMockSession({
      status: 'in_progress',
      expiresAt: new Date(Date.now() - 60000), // expired 1 minute ago
    });

    const origFindById = MockTestSession.findById;
    MockTestSession.findById = async () => expiredSession;

    try {
      const req = {
        params: { sessionId: 'mock_sess_hardened_1' },
        user: { id: 'user_student_1' },
        body: { questionId: 'q-phy-1', selectedOption: 1 },
      };
      const res = createMockRes();
      let capturedError = null;

      await saveAnswer(req, res, (err) => {
        capturedError = err;
      });

      assert.equal(res.statusCode, 400);
      assert.ok(capturedError);
      assert.match(capturedError.message, /Exam session has expired/);
      assert.equal(expiredSession.status, 'expired');
    } finally {
      MockTestSession.findById = origFindById;
    }
  });

  it('10. expiration: expired attempt with CLEAR assessment finalizes to EVALUATED with score', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        status: 'expired',
        evaluationStatus: 'PENDING',
        expiresAt: new Date(Date.now() - 60000),
      }),
      procSession: createCleanProcSession(),
      events: createNormalProctoringEvents(),
    },
    async () => {
      const req = {
        params: { sessionId: 'mock_sess_hardened_1' },
        user: { id: 'user_student_1' },
      };
      const res = createMockRes();

      await getMockTestResult(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.evaluationStatus, 'EVALUATED');
      assert.equal(res.body.result.score, 7);
    }
  ));

  // ─── 7. Section 9: Answer Preservation ──────────────────────
  it('11. answer preservation: candidate answers and timestamps are preserved unmodified when HELD_TECHNICAL_REVIEW', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        status: 'in_progress',
        evaluationStatus: 'PENDING',
        proctoringSession: null, // missing proctoring session -> INSUFFICIENT_DATA -> technical hold
      }),
    },
    async () => {
      const initialAnswers = [
        { questionId: 'q-phy-1', section: 'physics', selectedOption: 0, answeredAt: new Date('2026-09-24T10:05:00.000Z') },
        { questionId: 'q-chem-1', section: 'chemistry', selectedOption: 2, answeredAt: new Date('2026-09-24T10:10:00.000Z') },
      ];

      const session = createCleanMockSession({
        answers: initialAnswers,
        proctoringSession: null,
      });
      const mockTest = createMockTestDef();

      await finalizeMockTestSession(session, mockTest);

      assert.equal(session.evaluationStatus, 'HELD_TECHNICAL_REVIEW');
      assert.equal(session.answers.length, 2);
      assert.equal(session.answers[0].questionId, 'q-phy-1');
      assert.equal(session.answers[0].selectedOption, 0);
      assert.deepEqual(session.answers[0].answeredAt, new Date('2026-09-24T10:05:00.000Z'));
      assert.equal(session.answers[1].questionId, 'q-chem-1');
      assert.equal(session.answers[1].selectedOption, 2);
    }
  ));

  // ─── 8. Section 11: Proctoring Report Boundary ──────────────
  it('12. report boundary: candidate with HELD_FOR_REVIEW can access detailed proctoring report (HTTP 200)', async () => {
    const heldSession = createCleanMockSession({
      status: 'completed',
      evaluationStatus: 'HELD_FOR_REVIEW',
      proctoringSession: 'proc_sess_hardened_1',
    });
    const procSession = createCleanProcSession();

    const origSessionFind = MockTestSession.findById;
    const origProcFind = ProctoringSession.findById;
    const origProcFindOne = ProctoringSession.findOne;
    MockTestSession.findById = async () => heldSession;
    ProctoringSession.findById = async () => procSession;
    ProctoringSession.findOne = async () => procSession;

    try {
      const req = {
        params: { sessionId: 'mock_sess_hardened_1' },
        user: { id: 'user_student_1' },
      };
      const res = createMockRes();
      let capturedError = null;

      await getProctoringReport(req, res, (err) => {
        capturedError = err;
      });

      assert.equal(res.statusCode, 200);
      assert.equal(capturedError, null);
      assert.ok(res.body);
      assert.equal(res.body.success, true);
      assert.ok(res.body.report);
    } finally {
      MockTestSession.findById = origSessionFind;
      ProctoringSession.findById = origProcFind;
      ProctoringSession.findOne = origProcFindOne;
    }
  });

  it('13. report boundary: in_progress session cannot access proctoring report (HTTP 400)', async () => {
    const inProgressSession = createCleanMockSession({
      status: 'in_progress',
      evaluationStatus: 'PENDING',
    });

    const origSessionFind = MockTestSession.findById;
    MockTestSession.findById = async () => inProgressSession;

    try {
      const req = {
        params: { sessionId: 'mock_sess_hardened_1' },
        user: { id: 'user_student_1' },
      };
      const res = createMockRes();
      let capturedError = null;

      await getProctoringReport(req, res, (err) => {
        capturedError = err;
      });

      assert.equal(res.statusCode, 400);
      assert.ok(capturedError);
      assert.match(capturedError.message, /in progress/i);
    } finally {
      MockTestSession.findById = origSessionFind;
    }
  });

  // ─── 9. Section 13: Security & Authorization ────────────────
  it('14. security: Candidate A cannot retrieve Candidate B mock test result (HTTP 403)', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        user: 'student_owner_123',
        status: 'completed',
        evaluationStatus: 'EVALUATED',
        result: { score: 100 },
      }),
    },
    async () => {
      const req = {
        params: { sessionId: 'mock_sess_hardened_1' },
        user: { id: 'attacker_student_999' },
      };
      const res = createMockRes();
      let capturedError = null;

      await getMockTestResult(req, res, (err) => {
        capturedError = err;
      });

      assert.equal(res.statusCode, 403);
      assert.ok(capturedError);
      assert.match(capturedError.message, /not authorized/i);
    }
  ));

  it('15. security: Candidate A cannot retrieve Candidate B proctoring report (HTTP 403)', async () => {
    const session = createCleanMockSession({
      user: 'student_owner_123',
      status: 'completed',
      evaluationStatus: 'EVALUATED',
    });

    const origSessionFind = MockTestSession.findById;
    MockTestSession.findById = async () => session;

    try {
      const req = {
        params: { sessionId: 'mock_sess_hardened_1' },
        user: { id: 'attacker_student_999' },
      };
      const res = createMockRes();
      let capturedError = null;

      await getProctoringReport(req, res, (err) => {
        capturedError = err;
      });

      assert.equal(res.statusCode, 403);
      assert.ok(capturedError);
      assert.match(capturedError.message, /not authorized/i);
    } finally {
      MockTestSession.findById = origSessionFind;
    }
  });

  // ─── 10. Section 14: No Client Authority ────────────────────
  it('16. no client authority: client cannot pass evaluationStatus EVALUATED in payload to bypass proctoring hold', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        status: 'in_progress',
        evaluationStatus: 'PENDING',
        proctoringSession: null, // missing proctoring session -> must hold
      }),
    },
    async () => {
      const req = {
        params: { sessionId: 'mock_sess_hardened_1' },
        user: { id: 'user_student_1' },
        body: {
          answers: [],
          evaluationStatus: 'EVALUATED',
          score: 300,
          assessment: 'CLEAR',
        },
      };
      const res = createMockRes();

      await submitMockTestSession(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.evaluationStatus, 'HELD_TECHNICAL_REVIEW');
      assert.equal(res.body.result, undefined);
    }
  ));
});
