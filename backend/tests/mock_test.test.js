const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const MockTest = require('../models/MockTest');
const MockTestSession = require('../models/MockTestSession');
const {
  sanitizeQuestions,
  validateAndScoreMockTest,
  buildQuestionReview,
} = require('../services/mockTestScoring');
const {
  getMockTests,
  getMockTestById,
  startMockTestSession,
  saveAnswer,
  submitMockTestSession,
  getMockTestResult,
  heartbeat,
} = require('../controllers/mockTestController');
const { buildRepresentativeMockTest } = require('../data/mockTestData');

describe('JEE Main Mock Test Subsystem Suite', () => {
  const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_12345';
  process.env.JWT_SECRET = JWT_SECRET;

  // ─── 1. Schema & Future Extensibility ─────────────────────────
  it('1. MockTest and MockTestSession schemas declare required indexes and proctoring hook', () => {
    const mockIndexes = MockTestSession.schema.indexes();
    const hasCompoundUserTest = mockIndexes.some(
      (idx) => idx[0] && idx[0].user === 1 && idx[0].mockTest === 1 && idx[0].status === 1
    );
    const hasUserCreated = mockIndexes.some(
      (idx) => idx[0] && idx[0].user === 1 && idx[0].createdAt === -1
    );

    assert.ok(hasCompoundUserTest, 'MockTestSession must have compound index { user, mockTest, status }');
    assert.ok(hasUserCreated, 'MockTestSession must have index { user, createdAt }');

    // Verify proctoringSession field exists for future Phase 2 attachment
    const proctoringField = MockTestSession.schema.path('proctoringSession');
    assert.ok(proctoringField, 'MockTestSession schema must define proctoringSession reference for Phase 2');
    assert.equal(proctoringField.instance, 'ObjectId');
  });

  // ─── 2. Question Sanitization ─────────────────────────────────
  it('2. sanitizeQuestions strictly removes "answer" keys from all questions', () => {
    const repTest = buildRepresentativeMockTest();
    assert.ok(repTest.questions.length > 0);

    // Verify raw questions have answers
    repTest.questions.forEach((q) => {
      assert.notEqual(q.answer, undefined, 'Raw questions must have answers server-side');
    });

    const sanitized = sanitizeQuestions(repTest.questions);
    assert.equal(sanitized.length, repTest.questions.length);

    sanitized.forEach((q) => {
      assert.ok(q.id);
      assert.ok(q.section);
      assert.ok(q.q);
      assert.ok(Array.isArray(q.options));
      assert.equal(
        Object.prototype.hasOwnProperty.call(q, 'answer'),
        false,
        'Sanitized questions must NOT contain "answer" property'
      );
      assert.equal(q.answer, undefined);
    });
  });

  // ─── 3. Server-Authoritative Scoring (+4 / -1 / 0) ────────────
  it('3. validateAndScoreMockTest correctly evaluates full score (+4/question) and 0 unattempted', () => {
    const testDef = buildRepresentativeMockTest();
    const answers = testDef.questions.map((q) => ({
      questionId: q.id,
      selectedOption: q.answer,
    }));

    const result = validateAndScoreMockTest(testDef, answers);
    assert.equal(result.score, testDef.totalMarks, 'Full score must equal totalMarks (120)');
    assert.equal(result.correctCount, testDef.totalQuestions);
    assert.equal(result.incorrectCount, 0);
    assert.equal(result.unattemptedCount, 0);
    assert.equal(result.accuracy, 100);
    assert.equal(result.percentage, 100);

    // Check section breakdown
    assert.ok(result.sectionScores.physics);
    assert.ok(result.sectionScores.chemistry);
    assert.ok(result.sectionScores.maths);
    assert.equal(result.sectionScores.physics.score, 40);
    assert.equal(result.sectionScores.chemistry.score, 40);
    assert.equal(result.sectionScores.maths.score, 40);
  });

  it('4. validateAndScoreMockTest penalizes wrong answers (-1) and handles unattempted (0)', () => {
    const testDef = buildRepresentativeMockTest();
    // 10 correct, 10 wrong (-1 each), 10 unattempted (0 each)
    const answers = testDef.questions.map((q, idx) => {
      if (idx < 10) {
        return { questionId: q.id, selectedOption: q.answer }; // Correct: 10 * 4 = +40
      } else if (idx < 20) {
        return { questionId: q.id, selectedOption: (q.answer + 1) % 4 }; // Wrong: 10 * -1 = -10
      } else {
        return { questionId: q.id, selectedOption: -1 }; // Unattempted: 10 * 0 = 0
      }
    });

    const result = validateAndScoreMockTest(testDef, answers);
    assert.equal(result.score, 30); // 40 - 10 + 0 = 30
    assert.equal(result.correctCount, 10);
    assert.equal(result.incorrectCount, 10);
    assert.equal(result.unattemptedCount, 10);
    assert.equal(result.accuracy, 50); // 10 / 20 attempted = 50%
  });

  it('5. validateAndScoreMockTest supports arbitrary question counts, durations, and marking schemes without hardcoding', () => {
    // Arbitrary 5-question test with custom marking scheme (+3 / -2 / -0.5)
    const customTest = {
      title: 'Custom Mock',
      totalQuestions: 5,
      totalMarks: 15,
      markingScheme: { correct: 3, incorrect: -2, unattempted: 0 },
      questions: [
        { id: 'c-1', section: 'sec1', q: 'Q1', options: ['A', 'B'], answer: 0 },
        { id: 'c-2', section: 'sec1', q: 'Q2', options: ['A', 'B'], answer: 1 },
        { id: 'c-3', section: 'sec2', q: 'Q3', options: ['A', 'B'], answer: 0 },
        { id: 'c-4', section: 'sec2', q: 'Q4', options: ['A', 'B'], answer: 1 },
        { id: 'c-5', section: 'sec2', q: 'Q5', options: ['A', 'B'], answer: 0 },
      ],
    };

    const answers = [
      { questionId: 'c-1', selectedOption: 0 }, // +3
      { questionId: 'c-2', selectedOption: 0 }, // -2 (wrong)
      { questionId: 'c-3', selectedOption: -1 }, // 0 (unattempted)
      { questionId: 'c-4', selectedOption: 1 }, // +3
      { questionId: 'c-5', selectedOption: 1 }, // -2 (wrong)
    ];

    const result = validateAndScoreMockTest(customTest, answers);
    assert.equal(result.score, 2); // 3 - 2 + 0 + 3 - 2 = 2
    assert.equal(result.totalQuestions, 5);
    assert.equal(result.correctCount, 2);
    assert.equal(result.incorrectCount, 2);
    assert.equal(result.unattemptedCount, 1);
  });

  // ─── 4. Rejects Invalid and Duplicate Question IDs ────────────
  it('6. validateAndScoreMockTest rejects non-existent question IDs and duplicate IDs with 400', () => {
    const testDef = buildRepresentativeMockTest();

    // Foreign question ID
    assert.throws(
      () =>
        validateAndScoreMockTest(testDef, [
          { questionId: 'foreign-unknown-id-99', selectedOption: 1 },
        ]),
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /does not belong to this mock test/i);
        return true;
      }
    );

    // Duplicate question ID
    assert.throws(
      () =>
        validateAndScoreMockTest(testDef, [
          { questionId: testDef.questions[0].id, selectedOption: 1 },
          { questionId: testDef.questions[0].id, selectedOption: 2 },
        ]),
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.match(err.message, /duplicate question id/i);
        return true;
      }
    );
  });

  // ─── 5. Controller: Starting Valid Mock Test & Expiration ─────
  it('7. startMockTestSession establishes server-authoritative startedAt and expiresAt', async () => {
    const sampleMockTest = {
      _id: 'mock_test_db_id_1',
      id: 'mock_test_db_id_1',
      title: 'JEE Mock 1',
      slug: 'jee-mock-1',
      active: true,
      duration: 60,
      totalQuestions: 2,
      totalMarks: 8,
      sections: [{ id: 'physics', name: 'Physics', totalQuestions: 2 }],
      questions: [
        { id: 'q1', section: 'physics', q: 'Q1', options: ['A', 'B'], answer: 0 },
        { id: 'q2', section: 'physics', q: 'Q2', options: ['A', 'B'], answer: 1 },
      ],
    };

    const originalFindOne = MockTest.findOne;
    const originalSessionFindOne = MockTestSession.findOne;
    const originalSessionCreate = MockTestSession.create;

    MockTest.findOne = async () => sampleMockTest;
    MockTestSession.findOne = async () => null; // No existing session
    let createdSessionDoc = null;
    MockTestSession.create = async (doc) => {
      createdSessionDoc = { _id: 'session_new_123', ...doc };
      return createdSessionDoc;
    };

    try {
      const req = {
        user: { id: 'student_1' },
        params: { id: 'jee-mock-1' },
      };

      let respStatus = null;
      let respBody = null;
      const res = {
        status: (code) => {
          respStatus = code;
          return res;
        },
        json: (payload) => {
          respBody = payload;
          return res;
        },
      };

      await startMockTestSession(req, res, () => {});

      assert.equal(respStatus, 201);
      assert.equal(respBody.success, true);
      assert.equal(respBody.sessionId, 'session_new_123');
      assert.equal(respBody.status, 'in_progress');

      // Check server authoritative expiration time is startedAt + 60 minutes
      const started = new Date(respBody.startedAt).getTime();
      const expires = new Date(respBody.expiresAt).getTime();
      assert.equal(expires - started, 60 * 60 * 1000, 'Expiration must be startedAt + 60 minutes');

      // Sanitization: questions must NOT contain answers
      respBody.questions.forEach((q) => {
        assert.equal(Object.prototype.hasOwnProperty.call(q, 'answer'), false);
      });
    } finally {
      MockTest.findOne = originalFindOne;
      MockTestSession.findOne = originalSessionFindOne;
      MockTestSession.create = originalSessionCreate;
    }
  });

  // ─── 6. Controller: Invalid Mock Test ID ───────────────────────
  it('8. startMockTestSession returns 404 for invalid or non-existent mock test ID', async () => {
    const originalFindOne = MockTest.findOne;
    const originalFindById = MockTest.findById;
    const originalCreate = MockTest.create;

    MockTest.findOne = async (filter) => {
      if (filter && filter.slug === 'jee-main-mock-1') {
        return { _id: 'seed_mock' }; // Satisfies ensureSeedMockTests
      }
      return null;
    };
    MockTest.findById = async () => null;
    MockTest.create = async () => null;

    try {
      const req = {
        user: { id: 'student_1' },
        params: { id: 'non-existent-mock-id' },
      };

      let respStatus = null;
      let errorThrown = null;
      const res = {
        status: (code) => {
          respStatus = code;
          return res;
        },
      };
      const next = (err) => {
        errorThrown = err;
      };

      await startMockTestSession(req, res, next);
      assert.equal(respStatus, 404);
      assert.ok(errorThrown);
      assert.match(errorThrown.message, /mock test not found/i);
    } finally {
      MockTest.findOne = originalFindOne;
      MockTest.findById = originalFindById;
      MockTest.create = originalCreate;
    }
  });

  // ─── 7. Controller: Resume Existing In-Progress Session ────────
  it('9. startMockTestSession resumes active session on refresh without creating duplicates', async () => {
    const sampleMockTest = {
      _id: 'mock_test_db_id_1',
      title: 'JEE Mock 1',
      slug: 'jee-mock-1',
      active: true,
      duration: 60,
      questions: [{ id: 'q1', section: 'physics', q: 'Q1', options: ['A', 'B'], answer: 0 }],
    };

    const existingActiveSession = {
      _id: 'session_active_existing',
      user: 'student_1',
      mockTest: 'mock_test_db_id_1',
      status: 'in_progress',
      startedAt: new Date(Date.now() - 5 * 60 * 1000), // Started 5 mins ago
      expiresAt: new Date(Date.now() + 55 * 60 * 1000), // Expires in 55 mins
      answers: [{ questionId: 'q1', section: 'physics', selectedOption: 1 }],
      save: async () => {},
    };

    const originalFindOne = MockTest.findOne;
    const originalSessionFindOne = MockTestSession.findOne;
    let createCalled = false;
    const originalSessionCreate = MockTestSession.create;

    MockTest.findOne = async () => sampleMockTest;
    MockTestSession.findOne = async () => existingActiveSession;
    MockTestSession.create = async () => {
      createCalled = true;
    };

    try {
      const req = {
        user: { id: 'student_1' },
        params: { id: 'jee-mock-1' },
      };

      let respStatus = null;
      let respBody = null;
      const res = {
        status: (code) => {
          respStatus = code;
          return res;
        },
        json: (payload) => {
          respBody = payload;
          return res;
        },
      };

      await startMockTestSession(req, res, () => {});

      assert.equal(respStatus, 200, 'Must return 200 OK when resuming existing attempt');
      assert.equal(createCalled, false, 'Must NOT create a duplicate session on refresh');
      assert.equal(respBody.sessionId, 'session_active_existing');
      assert.match(respBody.message, /resumed/i);
    } finally {
      MockTest.findOne = originalFindOne;
      MockTestSession.findOne = originalSessionFindOne;
      MockTestSession.create = originalSessionCreate;
    }
  });

  // ─── 8. Unauthorized Session Access (Cross-User Isolation) ────
  it('10. saveAnswer and submitMockTestSession reject access from another user with 403', async () => {
    const ownerUserId = 'owner_user_111';
    const unauthorizedUserId = 'attacker_user_999';

    const sessionDoc = {
      _id: 'session_secret_1',
      user: ownerUserId,
      mockTest: 'mock_1',
      status: 'in_progress',
      expiresAt: new Date(Date.now() + 3600000),
      answers: [],
      save: async () => {},
    };

    const originalSessionFindById = MockTestSession.findById;
    MockTestSession.findById = async () => sessionDoc;

    try {
      // User B attempts to save answer on User A's session
      const reqAnswer = {
        user: { id: unauthorizedUserId },
        params: { sessionId: 'session_secret_1' },
        body: { questionId: 'q1', selectedOption: 0 },
      };

      let statusAnswer = null;
      let errorAnswer = null;
      const resAnswer = {
        status: (code) => {
          statusAnswer = code;
          return resAnswer;
        },
      };

      await saveAnswer(reqAnswer, resAnswer, (err) => {
        errorAnswer = err;
      });
      assert.equal(statusAnswer, 403, 'Must return 403 for unauthorized session answer');
      assert.match(errorAnswer.message, /not authorized/i);

      // User B attempts to submit User A's session
      const reqSubmit = {
        user: { id: unauthorizedUserId },
        params: { sessionId: 'session_secret_1' },
        body: {},
      };

      let statusSubmit = null;
      let errorSubmit = null;
      const resSubmit = {
        status: (code) => {
          statusSubmit = code;
          return resSubmit;
        },
      };

      await submitMockTestSession(reqSubmit, resSubmit, (err) => {
        errorSubmit = err;
      });
      assert.equal(statusSubmit, 403, 'Must return 403 for unauthorized session submit');
      assert.match(errorSubmit.message, /not authorized/i);
    } finally {
      MockTestSession.findById = originalSessionFindById;
    }
  });

  // ─── 9. Prevent Duplicate Submission ──────────────────────────
  it('11. submitMockTestSession rejects duplicate submission of an already completed session with 400', async () => {
    const sessionDoc = {
      _id: 'session_completed_1',
      user: 'student_1',
      mockTest: 'mock_1',
      status: 'completed', // Already completed
      expiresAt: new Date(Date.now() + 3600000),
      answers: [],
      save: async () => {},
    };

    const originalSessionFindById = MockTestSession.findById;
    MockTestSession.findById = async () => sessionDoc;

    try {
      const req = {
        user: { id: 'student_1' },
        params: { sessionId: 'session_completed_1' },
        body: {},
      };

      let statusCode = null;
      let errorThrown = null;
      const res = {
        status: (code) => {
          statusCode = code;
          return res;
        },
      };

      await submitMockTestSession(req, res, (err) => {
        errorThrown = err;
      });
      assert.equal(statusCode, 400);
      assert.match(errorThrown.message, /already been submitted/i);
    } finally {
      MockTestSession.findById = originalSessionFindById;
    }
  });

  // ─── 10. Expired Session Handling ─────────────────────────────
  it('12. saveAnswer rejects modification of expired session with 400 and marks status expired', async () => {
    let savedStatus = null;
    const sessionDoc = {
      _id: 'session_expired_1',
      user: 'student_1',
      mockTest: 'mock_1',
      status: 'in_progress',
      expiresAt: new Date(Date.now() - 60000), // Expired 1 min ago
      answers: [],
      save: async function () {
        savedStatus = this.status;
      },
    };

    const originalSessionFindById = MockTestSession.findById;
    MockTestSession.findById = async () => sessionDoc;

    try {
      const req = {
        user: { id: 'student_1' },
        params: { sessionId: 'session_expired_1' },
        body: { questionId: 'q1', selectedOption: 2 },
      };

      let statusCode = null;
      let errorThrown = null;
      const res = {
        status: (code) => {
          statusCode = code;
          return res;
        },
      };

      await saveAnswer(req, res, (err) => {
        errorThrown = err;
      });
      assert.equal(statusCode, 400);
      assert.match(errorThrown.message, /expired/i);
      assert.equal(savedStatus, 'expired');
    } finally {
      MockTestSession.findById = originalSessionFindById;
    }
  });

  // ─── 11. Tamper Resistance on Submit ──────────────────────────
  it('13. client-supplied score and marks in submit payload cannot override server evaluation', async () => {
    const testDef = {
      _id: 'mock_test_tamper',
      questions: [
        { id: 't-1', section: 'physics', q: 'Q1', options: ['A', 'B'], answer: 0 },
        { id: 't-2', section: 'physics', q: 'Q2', options: ['A', 'B'], answer: 1 },
      ],
      markingScheme: { correct: 4, incorrect: -1, unattempted: 0 },
    };

    let sessionSaved = null;
    const sessionDoc = {
      _id: 'session_tamper_1',
      user: 'student_1',
      mockTest: 'mock_test_tamper',
      status: 'in_progress',
      expiresAt: new Date(Date.now() + 3600000),
      answers: [
        { questionId: 't-1', selectedOption: 0 }, // Correct (+4)
        { questionId: 't-2', selectedOption: 0 }, // Incorrect (-1)
      ],
      save: async function () {
        sessionSaved = this;
      },
    };

    const originalSessionFindById = MockTestSession.findById;
    const originalMockFindById = MockTest.findById;

    MockTestSession.findById = async () => sessionDoc;
    MockTest.findById = async () => testDef;

    try {
      const req = {
        user: { id: 'student_1' },
        params: { sessionId: 'session_tamper_1' },
        body: {
          // Attacker sends bogus score to try to cheat
          score: 999,
          totalMarks: 999,
          result: { score: 999 },
        },
      };

      let respStatus = null;
      let respBody = null;
      const res = {
        status: (code) => {
          respStatus = code;
          return res;
        },
        json: (payload) => {
          respBody = payload;
          return res;
        },
      };

      await submitMockTestSession(req, res, () => {});

      assert.equal(respStatus, 200);
      assert.equal(respBody.result.score, 3, 'Score must be server-calculated (4 - 1 = 3), ignoring 999');
      assert.equal(sessionSaved.result.score, 3, 'Database score must be server-calculated (3)');
      assert.equal(sessionSaved.status, 'completed');
    } finally {
      MockTestSession.findById = originalSessionFindById;
      MockTest.findById = originalMockFindById;
    }
  });

  // ─── 12. Heartbeat Endpoint ───────────────────────────────────
  it('14. heartbeat updates lastHeartbeatAt and returns remainingSeconds', async () => {
    let heartbeatSaved = false;
    const expiresAt = new Date(Date.now() + 1800 * 1000); // 1800s remaining

    const sessionDoc = {
      _id: 'session_hb_1',
      user: 'student_1',
      status: 'in_progress',
      expiresAt,
      lastHeartbeatAt: new Date(Date.now() - 60000),
      save: async function () {
        heartbeatSaved = true;
      },
    };

    const originalSessionFindById = MockTestSession.findById;
    MockTestSession.findById = async () => sessionDoc;

    try {
      const req = {
        user: { id: 'student_1' },
        params: { sessionId: 'session_hb_1' },
      };

      let respBody = null;
      const res = {
        status: () => res,
        json: (payload) => {
          respBody = payload;
          return res;
        },
      };

      await heartbeat(req, res, () => {});

      assert.equal(heartbeatSaved, true);
      assert.equal(respBody.success, true);
      assert.equal(respBody.status, 'in_progress');
      assert.ok(respBody.remainingSeconds > 1750 && respBody.remainingSeconds <= 1800);
    } finally {
      MockTestSession.findById = originalSessionFindById;
    }
  });

  // ─── 13. Result Query for In-Progress Exam Rejection ──────────
  it('15. getMockTestResult rejects in-progress session with 400', async () => {
    const sessionDoc = {
      _id: 'session_prog_1',
      user: 'student_1',
      status: 'in_progress',
    };

    const originalSessionFindById = MockTestSession.findById;
    MockTestSession.findById = async () => sessionDoc;

    try {
      const req = {
        user: { id: 'student_1' },
        params: { sessionId: 'session_prog_1' },
      };

      let statusCode = null;
      let errorThrown = null;
      const res = {
        status: (code) => {
          statusCode = code;
          return res;
        },
      };

      await getMockTestResult(req, res, (err) => {
        errorThrown = err;
      });
      assert.equal(statusCode, 400);
      assert.match(errorThrown.message, /still in progress/i);
    } finally {
      MockTestSession.findById = originalSessionFindById;
    }
  });

  // ─── 14. Expired Session Result Hardening & Modification Invariant ───
  it('16. getMockTestResult evaluates score for expired session with absent result, while rejecting subsequent answer submissions', async () => {
    const testDef = {
      _id: 'mock_test_expired_eval',
      questions: [
        { id: 'exp-1', section: 'physics', q: 'Q1', options: ['A', 'B'], answer: 0 },
        { id: 'exp-2', section: 'physics', q: 'Q2', options: ['A', 'B'], answer: 1 },
      ],
      markingScheme: { correct: 4, incorrect: -1, unattempted: 0 },
    };

    let sessionSaved = null;
    const sessionDoc = {
      _id: 'session_expired_scoring',
      user: 'student_1',
      mockTest: 'mock_test_expired_eval',
      status: 'expired',
      expiresAt: new Date(Date.now() - 10000), // Expired
      answers: [
        { questionId: 'exp-1', selectedOption: 0 }, // Correct (+4)
        { questionId: 'exp-2', selectedOption: -1 }, // Unattempted (0)
      ],
      result: null, // Initially absent
      submittedAt: null,
      save: async function () {
        sessionSaved = this;
      },
    };

    const originalSessionFindById = MockTestSession.findById;
    const originalMockFindById = MockTest.findById;

    MockTestSession.findById = async () => sessionDoc;
    MockTest.findById = async () => testDef;

    try {
      // Step 1: getMockTestResult evaluates score and persists to session
      const reqResult = {
        user: { id: 'student_1' },
        params: { sessionId: 'session_expired_scoring' },
      };

      let resultBody = null;
      const resResult = {
        status: () => resResult,
        json: (payload) => {
          resultBody = payload;
          return resResult;
        },
      };

      await getMockTestResult(reqResult, resResult, () => {});

      assert.equal(resultBody.success, true);
      assert.equal(resultBody.status, 'expired');
      assert.ok(resultBody.result);
      assert.equal(resultBody.result.score, 4); // 1 correct (+4) + 1 unattempted (0) = 4
      assert.equal(sessionDoc.result.score, 4); // Persisted
      assert.ok(sessionDoc.submittedAt); // Submitted timestamp established

      // Step 2: Invariant check — subsequent saveAnswer must still be strictly rejected with HTTP 400
      const reqAnswer = {
        user: { id: 'student_1' },
        params: { sessionId: 'session_expired_scoring' },
        body: { questionId: 'exp-2', selectedOption: 1 },
      };

      let answerStatusCode = null;
      let answerError = null;
      const resAnswer = {
        status: (code) => {
          answerStatusCode = code;
          return resAnswer;
        },
      };

      await saveAnswer(reqAnswer, resAnswer, (err) => {
        answerError = err;
      });

      assert.equal(answerStatusCode, 400);
      assert.match(answerError.message, /expired/i);

      // Step 3: Invariant check — subsequent submitMockTestSession must also be rejected with HTTP 400
      const reqSubmit = {
        user: { id: 'student_1' },
        params: { sessionId: 'session_expired_scoring' },
        body: { answers: [{ questionId: 'exp-2', selectedOption: 1 }] },
      };

      let submitStatusCode = null;
      let submitError = null;
      const resSubmit = {
        status: (code) => {
          submitStatusCode = code;
          return resSubmit;
        },
      };

      await submitMockTestSession(reqSubmit, resSubmit, (err) => {
        submitError = err;
      });

      assert.equal(submitStatusCode, 400);
      assert.match(submitError.message, /expired/i);
    } finally {
      MockTestSession.findById = originalSessionFindById;
      MockTest.findById = originalMockFindById;
    }
  });

});
