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
  reviewMockTestSession,
  getMockTestResult,
  finalizeMockTestSession,
} = require('../controllers/mockTestController');

const {
  getProctoringReport,
} = require('../controllers/proctoringController');

const {
  requireReviewerRole,
} = require('../middleware/authMiddleware');

describe('Review Resolution & Administrative Audit Suite (Phase 4C)', () => {
  const BASE_TIME = new Date('2026-09-25T10:00:00.000Z');

  function createTimestamp(offsetMs) {
    return new Date(BASE_TIME.getTime() + offsetMs);
  }

  function createMockTestDef() {
    return {
      _id: 'mock_test_4c_1',
      title: 'JEE Main Practice Mock Test - 4C',
      slug: 'jee-main-4c',
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
      _id: options._id || 'mock_sess_4c_1',
      user: options.user || 'user_candidate_1',
      mockTest: options.mockTest || 'mock_test_4c_1',
      status: options.status || 'completed',
      evaluationStatus: options.evaluationStatus || 'HELD_FOR_REVIEW',
      startedAt: options.startedAt || new Date(Date.now() - 60 * 60 * 1000),
      expiresAt: options.expiresAt || new Date(Date.now() + 120 * 60 * 1000),
      submittedAt: options.submittedAt || new Date(Date.now() - 10 * 60 * 1000),
      answers: options.answers || [
        { questionId: 'q-phy-1', section: 'physics', selectedOption: 0 }, // +4
        { questionId: 'q-phy-2', section: 'physics', selectedOption: 1 }, // +4
        { questionId: 'q-chem-1', section: 'chemistry', selectedOption: 0 }, // -1
        { questionId: 'q-math-1', section: 'maths', selectedOption: -1 }, // 0
      ],
      result: options.result !== undefined ? options.result : undefined,
      reviewAudit: options.reviewAudit || null,
      proctoringSession: options.proctoringSession || 'proc_sess_4c_1',
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
      _id: options._id || 'proc_sess_4c_1',
      mockTestSession: options.mockTestSession || 'mock_sess_4c_1',
      user: options.user || 'user_candidate_1',
      status: options.status || 'completed',
      cameraState: options.cameraState || 'inactive',
      screenShareState: options.screenShareState || 'inactive',
      metadata: options.metadata || { cvStatus: 'active', screenAiStatus: 'active' },
    };
  }

  function withMockDatabase(setup, testFn) {
    return async () => {
      const origMockFindById = MockTest.findById;
      const origSessionFindById = MockTestSession.findById;
      const origProcFindOne = ProctoringSession.findOne;
      const origProcFindById = ProctoringSession.findById;

      try {
        MockTest.findById = async (id) => setup.mockTest || createMockTestDef();
        MockTestSession.findById = async (id) => setup.mockSession;
        ProctoringSession.findOne = async () => setup.procSession || createCleanProcSession();
        ProctoringSession.findById = async () => setup.procSession || createCleanProcSession();

        await testFn();
      } finally {
        MockTest.findById = origMockFindById;
        MockTestSession.findById = origSessionFindById;
        ProctoringSession.findOne = origProcFindOne;
        ProctoringSession.findById = origProcFindById;
      }
    };
  }

  // ─── TEST 1: Unauthenticated request → 401 ─────────────────────
  it('TEST 1: unauthenticated request is rejected with HTTP 401', async () => {
    const req = {
      params: { sessionId: 'mock_sess_4c_1' },
      user: null, // No authenticated user
      body: { decision: 'RELEASE' },
    };
    const res = createMockRes();
    let capturedErr = null;

    requireReviewerRole(req, res, (err) => {
      capturedErr = err;
    });

    assert.equal(res.statusCode, 401);
    assert.ok(capturedErr);
    assert.match(capturedErr.message, /authentication required/i);
  });

  // ─── TEST 2: Authenticated student attempts review → 403 ───────
  it('TEST 2: authenticated candidate/student role is rejected with HTTP 403', async () => {
    const req = {
      params: { sessionId: 'mock_sess_4c_1' },
      user: { id: 'user_candidate_1', role: 'student' },
      body: { decision: 'RELEASE' },
    };
    const res = createMockRes();
    let capturedErr = null;

    requireReviewerRole(req, res, (err) => {
      capturedErr = err;
    });

    assert.equal(res.statusCode, 403);
    assert.ok(capturedErr);
    assert.match(capturedErr.message, /reviewer permissions required/i);
  });

  // ─── TEST 3: Authorized reviewer RELEASES HELD_FOR_REVIEW ─────
  it('TEST 3: reviewer RELEASES HELD_FOR_REVIEW → EVALUATED, score calculated, reviewAudit created', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        evaluationStatus: 'HELD_FOR_REVIEW',
        result: undefined,
      }),
    },
    async () => {
      const session = createCleanMockSession({
        evaluationStatus: 'HELD_FOR_REVIEW',
        result: undefined,
      });
      MockTestSession.findById = async () => session;

      const req = {
        params: { sessionId: session._id },
        user: { _id: 'reviewer_101', role: 'reviewer' },
        body: { decision: 'RELEASE', notes: 'Exam verified by proctor' },
      };
      const res = createMockRes();

      await reviewMockTestSession(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.evaluationStatus, 'EVALUATED');
      assert.equal(session.evaluationStatus, 'EVALUATED');

      // Verify academic score was calculated (2 correct = 8, 1 wrong = -1 -> 7)
      assert.ok(session.result);
      assert.equal(session.result.score, 7);
      assert.equal(session.result.maxMarks, 16);

      // Verify reviewAudit
      assert.ok(session.reviewAudit);
      assert.equal(session.reviewAudit.decision, 'RELEASE');
      assert.equal(session.reviewAudit.reviewedBy, 'reviewer_101');
      assert.ok(session.reviewAudit.reviewedAt instanceof Date);
      assert.equal(session.reviewAudit.notes, 'Exam verified by proctor');
    }
  ));

  // ─── TEST 4: Authorized reviewer RELEASES HELD_TECHNICAL_REVIEW 
  it('TEST 4: reviewer RELEASES HELD_TECHNICAL_REVIEW → EVALUATED, score calculated, reviewAudit created', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        evaluationStatus: 'HELD_TECHNICAL_REVIEW',
        result: undefined,
      }),
    },
    async () => {
      const session = createCleanMockSession({
        evaluationStatus: 'HELD_TECHNICAL_REVIEW',
        result: undefined,
      });
      MockTestSession.findById = async () => session;

      const req = {
        params: { sessionId: session._id },
        user: { _id: 'admin_202', role: 'admin' },
        body: { decision: 'RELEASE', notes: 'Camera failure excused' },
      };
      const res = createMockRes();

      await reviewMockTestSession(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.evaluationStatus, 'EVALUATED');
      assert.equal(session.evaluationStatus, 'EVALUATED');
      assert.ok(session.result);
      assert.equal(session.result.score, 7);
      assert.equal(session.reviewAudit.decision, 'RELEASE');
      assert.equal(session.reviewAudit.reviewedBy, 'admin_202');
    }
  ));

  // ─── TEST 5: Authorized reviewer REJECTS HELD_FOR_REVIEW ───────
  it('TEST 5: reviewer REJECTS HELD_FOR_REVIEW → REJECTED, no score, reviewAudit created', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        evaluationStatus: 'HELD_FOR_REVIEW',
        result: undefined,
      }),
    },
    async () => {
      const session = createCleanMockSession({
        evaluationStatus: 'HELD_FOR_REVIEW',
        result: undefined,
      });
      MockTestSession.findById = async () => session;

      const req = {
        params: { sessionId: session._id },
        user: { _id: 'instructor_303', role: 'instructor' },
        body: { decision: 'REJECT', notes: 'Confirmed unauthorized assistance' },
      };
      const res = createMockRes();

      await reviewMockTestSession(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.evaluationStatus, 'REJECTED');
      assert.equal(session.evaluationStatus, 'REJECTED');
      assert.equal(session.result, undefined, 'Score must NOT be calculated for rejected attempt');
      assert.ok(session.reviewAudit);
      assert.equal(session.reviewAudit.decision, 'REJECT');
      assert.equal(session.reviewAudit.reviewedBy, 'instructor_303');
      assert.equal(session.reviewAudit.notes, 'Confirmed unauthorized assistance');
    }
  ));

  // ─── TEST 6: Authorized reviewer REJECTS HELD_TECHNICAL_REVIEW ─
  it('TEST 6: reviewer REJECTS HELD_TECHNICAL_REVIEW → REJECTED, no score, reviewAudit created', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        evaluationStatus: 'HELD_TECHNICAL_REVIEW',
        result: undefined,
      }),
    },
    async () => {
      const session = createCleanMockSession({
        evaluationStatus: 'HELD_TECHNICAL_REVIEW',
        result: undefined,
      });
      MockTestSession.findById = async () => session;

      const req = {
        params: { sessionId: session._id },
        user: { _id: 'reviewer_101', role: 'reviewer' },
        body: { decision: 'REJECT', notes: 'Entire session unmonitored' },
      };
      const res = createMockRes();

      await reviewMockTestSession(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.evaluationStatus, 'REJECTED');
      assert.equal(session.evaluationStatus, 'REJECTED');
      assert.equal(session.result, undefined);
      assert.equal(session.reviewAudit.decision, 'REJECT');
    }
  ));

  // ─── TEST 7: Invalid decision → 400 ────────────────────────────
  it('TEST 7: invalid review decision produces HTTP 400 Bad Request', withMockDatabase(
    {
      mockSession: createCleanMockSession(),
    },
    async () => {
      const req = {
        params: { sessionId: 'mock_sess_4c_1' },
        user: { _id: 'reviewer_101', role: 'reviewer' },
        body: { decision: 'APPROVE' }, // Not 'RELEASE' or 'REJECT'
      };
      const res = createMockRes();
      let capturedErr = null;

      await reviewMockTestSession(req, res, (err) => {
        capturedErr = err;
      });

      assert.equal(res.statusCode, 400);
      assert.ok(capturedErr);
      assert.match(capturedErr.message, /Invalid review decision/i);
    }
  ));

  // ─── TEST 8: Attempt to review already EVALUATED → 409 ──────────
  it('TEST 8: attempt to review already EVALUATED session returns HTTP 409 Conflict', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        evaluationStatus: 'EVALUATED',
        result: { score: 10 },
      }),
    },
    async () => {
      const req = {
        params: { sessionId: 'mock_sess_4c_1' },
        user: { _id: 'reviewer_101', role: 'reviewer' },
        body: { decision: 'REJECT' },
      };
      const res = createMockRes();
      let capturedErr = null;

      await reviewMockTestSession(req, res, (err) => {
        capturedErr = err;
      });

      assert.equal(res.statusCode, 409);
      assert.ok(capturedErr);
      assert.match(capturedErr.message, /already been evaluated and released/i);
    }
  ));

  // ─── TEST 9: Attempt to review already REJECTED → 409 ───────────
  it('TEST 9: attempt to review already REJECTED session returns HTTP 409 Conflict', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        evaluationStatus: 'REJECTED',
        reviewAudit: { decision: 'REJECT', reviewedBy: 'prev_rev', reviewedAt: new Date() },
      }),
    },
    async () => {
      const req = {
        params: { sessionId: 'mock_sess_4c_1' },
        user: { _id: 'reviewer_101', role: 'reviewer' },
        body: { decision: 'RELEASE' },
      };
      const res = createMockRes();
      let capturedErr = null;

      await reviewMockTestSession(req, res, (err) => {
        capturedErr = err;
      });

      assert.equal(res.statusCode, 409);
      assert.ok(capturedErr);
      assert.match(capturedErr.message, /already been rejected/i);
    }
  ));

  // ─── TEST 10: Attempt to review PENDING → 409 ──────────────────
  it('TEST 10: attempt to review PENDING (unevaluated) session returns HTTP 409 Conflict', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        evaluationStatus: 'PENDING',
      }),
    },
    async () => {
      const req = {
        params: { sessionId: 'mock_sess_4c_1' },
        user: { _id: 'reviewer_101', role: 'reviewer' },
        body: { decision: 'RELEASE' },
      };
      const res = createMockRes();
      let capturedErr = null;

      await reviewMockTestSession(req, res, (err) => {
        capturedErr = err;
      });

      assert.equal(res.statusCode, 409);
      assert.ok(capturedErr);
      assert.match(capturedErr.message, /pending initial evaluation/i);
    }
  ));

  // ─── TEST 11: Candidate cannot review their own attempt → 403 ──
  it('TEST 11: candidate cannot review their own attempt even with reviewer role', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        user: 'user_candidate_1',
        evaluationStatus: 'HELD_FOR_REVIEW',
      }),
    },
    async () => {
      const req = {
        params: { sessionId: 'mock_sess_4c_1' },
        // Reviewer ID matches session candidate ID
        user: { _id: 'user_candidate_1', id: 'user_candidate_1', role: 'reviewer' },
        body: { decision: 'RELEASE' },
      };
      const res = createMockRes();
      let capturedErr = null;

      await reviewMockTestSession(req, res, (err) => {
        capturedErr = err;
      });

      assert.equal(res.statusCode, 403);
      assert.ok(capturedErr);
      assert.match(capturedErr.message, /not permitted to review their own/i);
    }
  ));

  // ─── TEST 12: Reviewer identity from JWT, NOT req.body ─────────
  it('TEST 12: spoofed reviewedBy in request body is ignored; JWT reviewer ID is enforced', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        evaluationStatus: 'HELD_FOR_REVIEW',
      }),
    },
    async () => {
      const session = createCleanMockSession({
        evaluationStatus: 'HELD_FOR_REVIEW',
      });
      MockTestSession.findById = async () => session;

      const req = {
        params: { sessionId: session._id },
        user: { _id: 'authentic_reviewer_999', role: 'reviewer' },
        body: {
          decision: 'RELEASE',
          reviewedBy: 'malicious_impersonated_id', // Spoofed payload
        },
      };
      const res = createMockRes();

      await reviewMockTestSession(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(session.reviewAudit.reviewedBy, 'authentic_reviewer_999');
      assert.notEqual(session.reviewAudit.reviewedBy, 'malicious_impersonated_id');
    }
  ));

  // ─── TEST 13: Client-supplied reviewedAt cannot override server 
  it('TEST 13: spoofed reviewedAt in request body is ignored; server timestamp is enforced', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        evaluationStatus: 'HELD_FOR_REVIEW',
      }),
    },
    async () => {
      const session = createCleanMockSession({
        evaluationStatus: 'HELD_FOR_REVIEW',
      });
      MockTestSession.findById = async () => session;

      const spoofedTime = new Date('2020-01-01T00:00:00.000Z');
      const req = {
        params: { sessionId: session._id },
        user: { _id: 'reviewer_101', role: 'reviewer' },
        body: {
          decision: 'RELEASE',
          reviewedAt: spoofedTime, // Spoofed past timestamp
        },
      };
      const res = createMockRes();

      const before = Date.now();
      await reviewMockTestSession(req, res, () => {});
      const after = Date.now();

      assert.equal(res.statusCode, 200);
      assert.ok(session.reviewAudit.reviewedAt.getTime() >= before);
      assert.ok(session.reviewAudit.reviewedAt.getTime() <= after);
      assert.notEqual(session.reviewAudit.reviewedAt.toISOString(), spoofedTime.toISOString());
    }
  ));

  // ─── TEST 14: Client-supplied score cannot manipulate RELEASE ──
  it('TEST 14: client-supplied score in request body cannot tamper with released score', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        evaluationStatus: 'HELD_FOR_REVIEW',
      }),
    },
    async () => {
      const session = createCleanMockSession({
        evaluationStatus: 'HELD_FOR_REVIEW',
      });
      MockTestSession.findById = async () => session;

      const req = {
        params: { sessionId: session._id },
        user: { _id: 'reviewer_101', role: 'reviewer' },
        body: {
          decision: 'RELEASE',
          score: 100, // Attacker attempts to inject 100
          result: { score: 100, percentage: 100 },
        },
      };
      const res = createMockRes();

      await reviewMockTestSession(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(session.result.score, 7, 'Server correctly computes 4 + 4 - 1 = 7, ignoring body');
      assert.notEqual(session.result.score, 100);
    }
  ));

  // ─── TEST 15: RELEASE uses validateAndScoreMockTest ────────────
  it('TEST 15: RELEASE executes server-authoritative validateAndScoreMockTest', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        evaluationStatus: 'HELD_FOR_REVIEW',
        answers: [
          { questionId: 'q-phy-1', section: 'physics', selectedOption: 0 }, // +4
          { questionId: 'q-phy-2', section: 'physics', selectedOption: 2 }, // -1
          { questionId: 'q-chem-1', section: 'chemistry', selectedOption: -1 }, // 0
          { questionId: 'q-math-1', section: 'maths', selectedOption: -1 }, // 0
        ],
      }),
    },
    async () => {
      const session = createCleanMockSession({
        evaluationStatus: 'HELD_FOR_REVIEW',
        answers: [
          { questionId: 'q-phy-1', section: 'physics', selectedOption: 0 },
          { questionId: 'q-phy-2', section: 'physics', selectedOption: 2 },
          { questionId: 'q-chem-1', section: 'chemistry', selectedOption: -1 },
          { questionId: 'q-math-1', section: 'maths', selectedOption: -1 },
        ],
      });
      MockTestSession.findById = async () => session;

      const req = {
        params: { sessionId: session._id },
        user: { _id: 'reviewer_101', role: 'reviewer' },
        body: { decision: 'RELEASE' },
      };
      const res = createMockRes();

      await reviewMockTestSession(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(session.result.score, 3, '4 - 1 = 3');
      assert.equal(session.result.correctCount, 1);
      assert.equal(session.result.incorrectCount, 1);
      assert.equal(session.result.unattemptedCount, 2);
    }
  ));

  // ─── TEST 16: REJECT never calculates a score ──────────────────
  it('TEST 16: REJECT purges any stale result and sets result undefined', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        evaluationStatus: 'HELD_FOR_REVIEW',
        result: { score: 99 }, // Stale result
      }),
    },
    async () => {
      const session = createCleanMockSession({
        evaluationStatus: 'HELD_FOR_REVIEW',
        result: { score: 99 },
      });
      MockTestSession.findById = async () => session;

      const req = {
        params: { sessionId: session._id },
        user: { _id: 'reviewer_101', role: 'reviewer' },
        body: { decision: 'REJECT' },
      };
      const res = createMockRes();

      await reviewMockTestSession(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(session.evaluationStatus, 'REJECTED');
      assert.equal(session.result, undefined);
    }
  ));

  // ─── TEST 17: Result endpoint after RELEASE returns the score ──
  it('TEST 17: GET /result on RELEASED (EVALUATED) session returns HTTP 200 with result and review', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        status: 'completed',
        evaluationStatus: 'EVALUATED',
        result: { score: 7, maxMarks: 16 },
        reviewAudit: { decision: 'RELEASE', reviewedBy: 'rev_1', reviewedAt: new Date() },
      }),
    },
    async () => {
      const req = {
        params: { sessionId: 'mock_sess_4c_1' },
        user: { id: 'user_candidate_1' },
      };
      const res = createMockRes();

      await getMockTestResult(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.evaluationStatus, 'EVALUATED');
      assert.ok(res.body.result);
      assert.equal(res.body.result.score, 7);
      assert.ok(res.body.review);
    }
  ));

  // ─── TEST 18: Result endpoint after REJECT returns no score ────
  it('TEST 18: GET /result on REJECTED session returns HTTP 200 with dedicated rejected message and no score/review', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        status: 'completed',
        evaluationStatus: 'REJECTED',
        result: undefined,
        reviewAudit: { decision: 'REJECT', reviewedBy: 'rev_1', reviewedAt: new Date(), notes: 'Internal violation notes' },
      }),
    },
    async () => {
      const req = {
        params: { sessionId: 'mock_sess_4c_1' },
        user: { id: 'user_candidate_1' },
      };
      const res = createMockRes();

      await getMockTestResult(req, res, () => {});

      assert.equal(res.statusCode, 200);
      assert.equal(res.body.evaluationStatus, 'REJECTED');
      assert.equal(res.body.result, undefined, 'Must not return result');
      assert.equal(res.body.review, undefined, 'Must not return question review');
      assert.match(res.body.message, /rejected upon review/i);

      // Privacy: Must not expose reviewer notes or identity to candidate
      assert.equal(res.body.reviewAudit, undefined);
      assert.equal(res.body.notes, undefined);
      assert.equal(res.body.reviewedBy, undefined);
    }
  ));

  // ─── TEST 19: Proctoring report security after RELEASE/REJECT ──
  it('TEST 19: Proctoring report is accessible (HTTP 200) for REJECTED sessions', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        status: 'completed',
        evaluationStatus: 'REJECTED',
      }),
      procSession: createCleanProcSession(),
    },
    async () => {
      const req = {
        params: { sessionId: 'mock_sess_4c_1' },
        user: { id: 'user_candidate_1' },
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

  // ─── TEST 20: Second resolution attempt cannot overwrite audit ─
  it('TEST 20: duplicate review attempt on already reviewed session is rejected with HTTP 409', withMockDatabase(
    {
      mockSession: createCleanMockSession({
        evaluationStatus: 'HELD_FOR_REVIEW',
        reviewAudit: {
          decision: 'RELEASE',
          reviewedBy: 'first_reviewer_id',
          reviewedAt: new Date('2026-09-25T11:00:00.000Z'),
          notes: 'First decision is final',
        },
      }),
    },
    async () => {
      const req = {
        params: { sessionId: 'mock_sess_4c_1' },
        user: { _id: 'second_reviewer_id', role: 'reviewer' },
        body: { decision: 'REJECT', notes: 'Trying to overturn' },
      };
      const res = createMockRes();
      let capturedErr = null;

      await reviewMockTestSession(req, res, (err) => {
        capturedErr = err;
      });

      assert.equal(res.statusCode, 409);
      assert.ok(capturedErr);
      assert.match(capturedErr.message, /already been reviewed/i);
    }
  ));

  // ─── TEST 21: Invalid notes type / oversized notes → 400 ───────
  it('TEST 21: invalid notes type (e.g. object) or notes exceeding 1000 characters returns HTTP 400', withMockDatabase(
    {
      mockSession: createCleanMockSession(),
    },
    async () => {
      // Subtest A: notes is an object/array
      const reqA = {
        params: { sessionId: 'mock_sess_4c_1' },
        user: { _id: 'reviewer_101', role: 'reviewer' },
        body: { decision: 'RELEASE', notes: { evil: 'payload' } },
      };
      const resA = createMockRes();
      let errA = null;
      await reviewMockTestSession(reqA, resA, (err) => {
        errA = errA || err;
      });
      assert.equal(resA.statusCode, 400);
      assert.match(errA.message, /notes must be a string/i);

      // Subtest B: notes > 1000 chars
      const reqB = {
        params: { sessionId: 'mock_sess_4c_1' },
        user: { _id: 'reviewer_101', role: 'reviewer' },
        body: { decision: 'RELEASE', notes: 'A'.repeat(1001) },
      };
      const resB = createMockRes();
      let errB = null;
      await reviewMockTestSession(reqB, resB, (err) => {
        errB = errB || err;
      });
      assert.equal(resB.statusCode, 400);
      assert.match(errB.message, /exceed maximum length/i);
    }
  ));

  // ─── TEST 22: Candidate cannot review another candidate's session 
  it('TEST 22: candidate student cannot review another candidate session (rejected by requireReviewerRole)', () => {
    const req = {
      params: { sessionId: 'someone_elses_session' },
      user: { id: 'other_student_id', role: 'student' },
      body: { decision: 'RELEASE' },
    };
    const res = createMockRes();
    let capturedErr = null;

    requireReviewerRole(req, res, (err) => {
      capturedErr = err;
    });

    assert.equal(res.statusCode, 403);
    assert.ok(capturedErr);
    assert.match(capturedErr.message, /reviewer permissions required/i);
  });
});
