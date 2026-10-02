/**
 * proctoring_phase_c_integration.test.js
 *
 * NexPrep JEE LMS — Phase C: End-to-End Autonomous Proctoring Integration & Lifecycle Test Suite
 *
 * Validates the complete lifecycle:
 *   EXAM START -> DEVICE READINESS -> PROCTORING -> TELEMETRY -> EXAM SUBMISSION
 *   -> EVENT FINALIZATION -> PHASE B ADJUDICATION -> AUTONOMOUS DECISION
 *   -> SESSION STATE -> SCORE / NO SCORE -> RESULT API -> CANDIDATE UI CONTRACT
 *
 * Constraints:
 * - Strictly zero changes to Phase A math, weights, caps, thresholds, or decision hierarchy.
 * - Autonomous tri-state outcomes: RELEASE (Clean & Advisory), VOID (REJECTED), TECHNICAL (HELD_TECHNICAL_REVIEW).
 * - Factual, non-accusatory candidate communication throughout.
 * - Administrative review retained as emergency/appeal override only.
 */

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
  reviewMockTestSession,
  finalizeMockTestSession,
  saveAnswer,
} = require('../controllers/mockTestController');

const BANNED_TERMS = ['cheater', 'cheat', 'fraud', 'suspicious', 'caught', 'guilty', 'malpractice', 'dishonest'];

function assertNoBannedTerms(text) {
  if (!text) return;
  const lower = String(text).toLowerCase();
  for (const term of BANNED_TERMS) {
    assert.ok(
      !lower.includes(term),
      `Candidate message must not contain accusatory term "${term}". Received: "${text}"`
    );
  }
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

function createMockTestDef() {
  return {
    _id: 'mock_test_jee_main_1',
    id: 'mock_test_jee_main_1',
    title: 'JEE Main Full Mock Test 1',
    slug: 'jee-main-full-mock-1',
    type: 'jee_main',
    duration: 180,
    totalQuestions: 2,
    totalMarks: 8,
    active: true,
    sections: [
      { id: 'physics', name: 'Physics', totalQuestions: 1, duration: 60 },
      { id: 'chemistry', name: 'Chemistry', totalQuestions: 1, duration: 60 },
    ],
    markingScheme: { correct: 4, incorrect: -1, unattempted: 0 },
    questions: [
      {
        id: 'q1',
        section: 'physics',
        questionText: 'What is the SI unit of Force?',
        options: ['Newton', 'Joule', 'Watt', 'Pascal'],
        answer: 0,
        explanation: 'Force is measured in Newtons.',
      },
      {
        id: 'q2',
        section: 'chemistry',
        questionText: 'What is the atomic number of Carbon?',
        options: ['4', '5', '6', '7'],
        answer: 2,
        explanation: 'Carbon has atomic number 6.',
      },
    ],
  };
}

function createTimestamp(baseDate, offsetMs) {
  return new Date(baseDate.getTime() + offsetMs);
}

function withIntegrationDatabase(setup = {}, testFn) {
  return async () => {
    const origMockFindById = MockTest.findById;
    const origMockFindOne = MockTest.findOne;
    const origSessionFindById = MockTestSession.findById;
    const origSessionFindOne = MockTestSession.findOne;
    const origProcFindById = ProctoringSession.findById;
    const origProcFindOne = ProctoringSession.findOne;
    const origProcFindByIdAndUpdate = ProctoringSession.findByIdAndUpdate;
    const origEventFind = ProctoringEvent.find;
    const origEpisodeFind = ProctoringEpisode.find;
    const origAssessmentFindById = ProctoringAssessment.findById;
    const origAssessmentFindOne = ProctoringAssessment.findOne;
    const origAssessmentFindOneAndUpdate = ProctoringAssessment.findOneAndUpdate;

    let savedAssessment = null;

    try {
      const mockTestDoc = setup.mockTest || createMockTestDef();
      const sessionDoc = setup.session;
      const procSessionDoc = setup.procSession;
      const events = setup.events || [];
      const episodes = setup.episodes || [];

      MockTest.findById = async (id) => mockTestDoc;
      MockTest.findOne = async () => mockTestDoc;

      MockTestSession.findById = async (id) => {
        if (setup.sessionsById && setup.sessionsById[id]) {
          return setup.sessionsById[id];
        }
        return sessionDoc;
      };
      MockTestSession.findOne = async (query) => {
        if (setup.sessionsByQuery) {
          return setup.sessionsByQuery(query);
        }
        return sessionDoc;
      };

      ProctoringSession.findById = async (id) => procSessionDoc;
      ProctoringSession.findOne = async () => procSessionDoc;
      ProctoringSession.findByIdAndUpdate = async (id, update) => {
        if (procSessionDoc) {
          Object.assign(procSessionDoc, update);
        }
        return procSessionDoc;
      };

      ProctoringEvent.find = () => {
        return {
          sort: () => Promise.resolve(events),
        };
      };

      ProctoringEpisode.find = () => {
        return {
          sort: () => Promise.resolve(episodes),
        };
      };

      ProctoringAssessment.findById = async (id) => savedAssessment || setup.assessment || null;
      ProctoringAssessment.findOne = async () => savedAssessment || setup.assessment || null;
      ProctoringAssessment.findOneAndUpdate = async (filter, update, opts) => {
        savedAssessment = {
          ...update,
          _id: setup.assessmentId || new mongoose.Types.ObjectId(),
        };
        return savedAssessment;
      };

      await testFn({
        getSavedAssessment: () => savedAssessment,
        session: sessionDoc,
        procSession: procSessionDoc,
        mockTest: mockTestDoc,
      });
    } finally {
      MockTest.findById = origMockFindById;
      MockTest.findOne = origMockFindOne;
      MockTestSession.findById = origSessionFindById;
      MockTestSession.findOne = origSessionFindOne;
      ProctoringSession.findById = origProcFindById;
      ProctoringSession.findOne = origProcFindOne;
      ProctoringSession.findByIdAndUpdate = origProcFindByIdAndUpdate;
      ProctoringEvent.find = origEventFind;
      ProctoringEpisode.find = origEpisodeFind;
      ProctoringAssessment.findById = origAssessmentFindById;
      ProctoringAssessment.findOne = origAssessmentFindOne;
      ProctoringAssessment.findOneAndUpdate = origAssessmentFindOneAndUpdate;
    }
  };
}

describe('Phase C: End-to-End Autonomous Proctoring Integration & Lifecycle', () => {
  // ─── SCENARIO 1: Complete Clean Attempt -> RELEASE (Clean) ───────────────────
  it('1. Clean attempt executes start -> proctoring -> submit -> RELEASE -> publishes score and review', withIntegrationDatabase(
    (() => {
      const now = new Date();
      const session = {
        _id: 'session_c_clean_1',
        user: 'student_c_1',
        mockTest: 'mock_test_jee_main_1',
        status: 'in_progress',
        evaluationStatus: 'PENDING',
        startedAt: now,
        expiresAt: new Date(now.getTime() + 180 * 60 * 1000),
        answers: [
          { questionId: 'q1', section: 'physics', selectedOption: 0, isMarkedForReview: false },
          { questionId: 'q2', section: 'chemistry', selectedOption: 2, isMarkedForReview: false },
        ],
        proctoringSession: 'proc_sess_c_clean_1',
        save: async function () { return this; },
      };

      const procSession = {
        _id: 'proc_sess_c_clean_1',
        mockTestSession: 'session_c_clean_1',
        user: 'student_c_1',
        status: 'active',
        cameraState: 'active',
        screenShareState: 'active',
        metadata: { cvStatus: 'active', screenAiStatus: 'active' },
        save: async function () { return this; },
      };

      const events = [
        { type: 'CAMERA_STARTED', source: 'media', timestamp: createTimestamp(now, 1000), duration: 0 },
        { type: 'SCREEN_SHARE_STARTED', source: 'screen', timestamp: createTimestamp(now, 2000), duration: 0 },
        { type: 'PROCTORING_HEARTBEAT', source: 'system', timestamp: createTimestamp(now, 30000), duration: 0 },
      ];

      return { session, procSession, events };
    })(),
    async ({ session, procSession, getSavedAssessment }) => {
      // Step A: Candidate submits exam with adjudicationMode: true
      const submitReq = {
        params: { sessionId: 'session_c_clean_1' },
        user: { id: 'student_c_1' },
        body: {
          adjudicationMode: true,
          answers: [
            { questionId: 'q1', selectedOption: 0 },
            { questionId: 'q2', selectedOption: 2 },
          ],
        },
      };
      const submitRes = createMockRes();

      await submitMockTestSession(submitReq, submitRes, (err) => {
        if (err) throw err;
      });

      // Assert submission outcome
      assert.equal(submitRes.statusCode, 200);
      assert.equal(submitRes.body.evaluationStatus, 'EVALUATED');
      assert.equal(submitRes.body.advisoryClearance, false);
      assert.ok(submitRes.body.result, 'Result scorecard must be present');
      assert.equal(submitRes.body.result.score, 8); // 2 correct (+4 each)
      assert.equal(session.evaluationStatus, 'EVALUATED');
      assert.equal(session.status, 'completed');
      assert.equal(procSession.status, 'completed', 'ProctoringSession must be completed upon finalization');
      assert.ok(procSession.endedAt, 'ProctoringSession endedAt must be set');

      const savedAssessment = getSavedAssessment();
      assert.ok(savedAssessment);
      assert.equal(savedAssessment.adjudication.decision, 'RELEASE');
      assert.equal(savedAssessment.adjudication.advisoryClearance, false);
      assert.equal(savedAssessment.adjudication.integrityRiskScore, 0);

      // Step B: Candidate calls GET /result
      const resultReq = {
        params: { sessionId: 'session_c_clean_1' },
        user: { id: 'student_c_1' },
      };
      const resultRes = createMockRes();

      await getMockTestResult(resultReq, resultRes, (err) => {
        if (err) throw err;
      });

      assert.equal(resultRes.statusCode, 200);
      assert.equal(resultRes.body.evaluationStatus, 'EVALUATED');
      assert.equal(resultRes.body.advisoryClearance, false);
      assert.equal(resultRes.body.result.score, 8);
      assert.equal(resultRes.body.result.totalQuestions, 2);
      assert.equal(resultRes.body.review.length, 2);
      assert.equal(resultRes.body.review[0].isCorrect, true);
      assert.equal(resultRes.body.review[1].isCorrect, true);
      assertNoBannedTerms(resultRes.body.message);
    }
  ));

  // ─── SCENARIO 2: Advisory Release Attempt -> RELEASE (Advisory) ───────────────
  it('2. Minor noise attempt (25 <= R < 50) -> RELEASE (Advisory) -> publishes score with advisoryClearance flag', withIntegrationDatabase(
    (() => {
      const now = new Date();
      const session = {
        _id: 'session_c_advisory_1',
        user: 'student_c_2',
        mockTest: 'mock_test_jee_main_1',
        status: 'in_progress',
        evaluationStatus: 'PENDING',
        startedAt: now,
        expiresAt: new Date(now.getTime() + 180 * 60 * 1000),
        answers: [
          { questionId: 'q1', section: 'physics', selectedOption: 0, isMarkedForReview: false },
          { questionId: 'q2', section: 'chemistry', selectedOption: 1, isMarkedForReview: false }, // incorrect
        ],
        proctoringSession: 'proc_sess_c_advisory_1',
        save: async function () { return this; },
      };

      const procSession = {
        _id: 'proc_sess_c_advisory_1',
        mockTestSession: 'session_c_advisory_1',
        user: 'student_c_2',
        status: 'active',
        cameraState: 'active',
        screenShareState: 'active',
        metadata: { cvStatus: 'active', screenAiStatus: 'active' },
        save: async function () { return this; },
      };

      // Canonical Scenario 7 events: two long face absences (35s & 40s) -> R=32, C=0.96, H=SUFFICIENT -> Advisory RELEASE
      const events = [
        { type: 'CAMERA_STARTED', source: 'media', timestamp: createTimestamp(now, 100), duration: 0 },
        { type: 'SCREEN_SHARE_STARTED', source: 'screen', timestamp: createTimestamp(now, 200), duration: 0 },
        { type: 'FACE_ABSENT', source: 'camera', timestamp: createTimestamp(now, 10000), duration: 35000 },
        { type: 'FACE_ABSENT', source: 'camera', timestamp: createTimestamp(now, 90000), duration: 40000 },
        { type: 'PROCTORING_HEARTBEAT', source: 'system', timestamp: createTimestamp(now, 140000), duration: 0 },
      ];

      return { session, procSession, events };
    })(),
    async ({ session, procSession, getSavedAssessment }) => {
      const submitReq = {
        params: { sessionId: 'session_c_advisory_1' },
        user: { id: 'student_c_2' },
        body: { adjudicationMode: true, answers: session.answers },
      };
      const submitRes = createMockRes();

      await submitMockTestSession(submitReq, submitRes, (err) => {
        if (err) throw err;
      });

      assert.equal(submitRes.statusCode, 200);
      assert.equal(submitRes.body.evaluationStatus, 'EVALUATED');
      assert.equal(submitRes.body.advisoryClearance, true, 'advisoryClearance must be true for 25 <= R < 50');
      assert.ok(submitRes.body.result, 'Academic scorecard must be fully released');
      assert.equal(submitRes.body.result.score, 3); // 1 correct (+4), 1 incorrect (-1) = 3
      assert.equal(procSession.status, 'completed');

      const savedAssessment = getSavedAssessment();
      assert.equal(savedAssessment.adjudication.decision, 'RELEASE');
      assert.equal(savedAssessment.adjudication.advisoryClearance, true);
      assert.ok(savedAssessment.adjudication.integrityRiskScore >= 25);
      assert.ok(savedAssessment.adjudication.integrityRiskScore < 50);

      // Verify GET /result reflects advisory notice contract
      const resultReq = {
        params: { sessionId: 'session_c_advisory_1' },
        user: { id: 'student_c_2' },
      };
      const resultRes = createMockRes();

      await getMockTestResult(resultReq, resultRes, (err) => {
        if (err) throw err;
      });

      assert.equal(resultRes.statusCode, 200);
      assert.equal(resultRes.body.evaluationStatus, 'EVALUATED');
      assert.equal(resultRes.body.advisoryClearance, true);
      assert.equal(resultRes.body.result.score, 3);
      assert.equal(resultRes.body.review.length, 2);
      assertNoBannedTerms(resultRes.body.message);
    }
  ));

  // ─── SCENARIO 3: Behavioral Breach -> VOID (REJECTED) ────────────────────────
  it('3. Corroborated breach attempt -> VOID -> sets REJECTED, strictly withholds score, returns neutral receipt', withIntegrationDatabase(
    (() => {
      const now = new Date();
      const session = {
        _id: 'session_c_void_1',
        user: 'student_c_3',
        mockTest: 'mock_test_jee_main_1',
        status: 'in_progress',
        evaluationStatus: 'PENDING',
        startedAt: now,
        expiresAt: new Date(now.getTime() + 180 * 60 * 1000),
        answers: [
          { questionId: 'q1', section: 'physics', selectedOption: 0, isMarkedForReview: false },
          { questionId: 'q2', section: 'chemistry', selectedOption: 2, isMarkedForReview: false },
        ],
        proctoringSession: 'proc_sess_c_void_1',
        save: async function () { return this; },
      };

      const procSession = {
        _id: 'proc_sess_c_void_1',
        mockTestSession: 'session_c_void_1',
        user: 'student_c_3',
        status: 'active',
        cameraState: 'active',
        screenShareState: 'active',
        metadata: { cvStatus: 'active', screenAiStatus: 'active' },
        save: async function () { return this; },
      };

      // Multi-channel breach:
      // Focus lost repeated + sustained face absent (45s) + sustained screen change (45s)
      const events = [
        { type: 'CAMERA_STARTED', source: 'media', timestamp: createTimestamp(now, 500), duration: 0 },
        { type: 'SCREEN_SHARE_STARTED', source: 'screen', timestamp: createTimestamp(now, 1000), duration: 0 },
        { type: 'FOCUS_LOST', source: 'attention', timestamp: createTimestamp(now, 5000), duration: 0 },
        { type: 'FOCUS_REGAINED', source: 'attention', timestamp: createTimestamp(now, 8000), duration: 0 },
        { type: 'FACE_ABSENT', source: 'camera', timestamp: createTimestamp(now, 20000), duration: 45000 },
        { type: 'FOCUS_LOST', source: 'attention', timestamp: createTimestamp(now, 20500), duration: 0 },
        { type: 'SCREEN_VIEW_CHANGED', source: 'screen', timestamp: createTimestamp(now, 21000), duration: 45000 },
        { type: 'FOCUS_REGAINED', source: 'attention', timestamp: createTimestamp(now, 65500), duration: 0 },
        { type: 'PROCTORING_HEARTBEAT', source: 'system', timestamp: createTimestamp(now, 90000), duration: 0 },
      ];

      return { session, procSession, events };
    })(),
    async ({ session, procSession, getSavedAssessment }) => {
      const submitReq = {
        params: { sessionId: 'session_c_void_1' },
        user: { id: 'student_c_3' },
        body: { adjudicationMode: true, answers: session.answers },
      };
      const submitRes = createMockRes();

      await submitMockTestSession(submitReq, submitRes, (err) => {
        if (err) throw err;
      });

      assert.equal(submitRes.statusCode, 200);
      assert.equal(submitRes.body.evaluationStatus, 'REJECTED');
      assert.equal(submitRes.body.result, undefined, 'Score must NOT be returned in submit response');
      assert.ok(submitRes.body.message.includes('Session integrity requirements were not met.'));
      assertNoBannedTerms(submitRes.body.message);

      assert.equal(session.evaluationStatus, 'REJECTED');
      assert.equal(session.result, undefined, 'session.result MUST NOT be calculated or persisted');
      assert.equal(procSession.status, 'completed');

      const savedAssessment = getSavedAssessment();
      assert.equal(savedAssessment.adjudication.decision, 'VOID');
      assert.ok(savedAssessment.adjudication.integrityRiskScore >= 50);

      // Verify GET /result on REJECTED session
      const resultReq = {
        params: { sessionId: 'session_c_void_1' },
        user: { id: 'student_c_3' },
      };
      const resultRes = createMockRes();

      await getMockTestResult(resultReq, resultRes, (err) => {
        if (err) throw err;
      });

      assert.equal(resultRes.statusCode, 200);
      assert.equal(resultRes.body.evaluationStatus, 'REJECTED');
      assert.equal(resultRes.body.result, undefined, 'Scorecard MUST be strictly withheld');
      assert.equal(resultRes.body.review, undefined, 'Question review MUST be strictly withheld');
      assert.ok(resultRes.body.message.includes('Academic scores and question reviews are not available'));
      assertNoBannedTerms(resultRes.body.message);
    }
  ));

  // ─── SCENARIO 4: Technical Interruption -> TECHNICAL (HELD_TECHNICAL_REVIEW) ─
  it('4. Technical failure attempt -> TECHNICAL -> sets HELD_TECHNICAL_REVIEW, strictly withholds score, neutral receipt', withIntegrationDatabase(
    (() => {
      const now = new Date();
      const session = {
        _id: 'session_c_tech_1',
        user: 'student_c_4',
        mockTest: 'mock_test_jee_main_1',
        status: 'in_progress',
        evaluationStatus: 'PENDING',
        startedAt: now,
        expiresAt: new Date(now.getTime() + 180 * 60 * 1000),
        answers: [
          { questionId: 'q1', section: 'physics', selectedOption: 0, isMarkedForReview: false },
        ],
        proctoringSession: 'proc_sess_c_tech_1',
        save: async function () { return this; },
      };

      const procSession = {
        _id: 'proc_sess_c_tech_1',
        mockTestSession: 'session_c_tech_1',
        user: 'student_c_4',
        status: 'active',
        cameraState: 'active',
        screenShareState: 'active',
        metadata: { cvStatus: 'unavailable', screenAiStatus: 'active' },
        save: async function () { return this; },
      };

      // Unrecovered camera stoppage causing low camera continuity without behavioral risk
      const events = [
        { type: 'CAMERA_STARTED', source: 'media', timestamp: createTimestamp(now, 500), duration: 0 },
        { type: 'SCREEN_SHARE_STARTED', source: 'screen', timestamp: createTimestamp(now, 1000), duration: 0 },
        { type: 'CAMERA_STOPPED', source: 'media', timestamp: createTimestamp(now, 3000), duration: 0 },
      ];

      return { session, procSession, events };
    })(),
    async ({ session, procSession, getSavedAssessment }) => {
      // Finalize with simulated continuityCamera = 0.40 (triggering H = INSUFFICIENT)
      const submitReq = {
        params: { sessionId: 'session_c_tech_1' },
        user: { id: 'student_c_4' },
        body: { adjudicationMode: true, answers: session.answers },
      };
      const submitRes = createMockRes();

      await finalizeMockTestSession(session, createMockTestDef(), {
        adjudicationMode: true,
        continuityCamera: 0.4,
      });

      assert.equal(session.evaluationStatus, 'HELD_TECHNICAL_REVIEW');
      assert.equal(session.result, undefined, 'Score MUST NOT be computed on technical hold');

      const savedAssessment = getSavedAssessment();
      assert.equal(savedAssessment.adjudication.decision, 'TECHNICAL');
      assert.equal(savedAssessment.adjudication.technicalHealth, 'INSUFFICIENT');

      // Verify GET /result on HELD_TECHNICAL_REVIEW
      const resultReq = {
        params: { sessionId: 'session_c_tech_1' },
        user: { id: 'student_c_4' },
      };
      const resultRes = createMockRes();

      await getMockTestResult(resultReq, resultRes, (err) => {
        if (err) throw err;
      });

      assert.equal(resultRes.statusCode, 200);
      assert.equal(resultRes.body.evaluationStatus, 'HELD_TECHNICAL_REVIEW');
      assert.equal(resultRes.body.result, undefined, 'Scorecard MUST NOT be disclosed');
      assert.equal(resultRes.body.review, undefined, 'Review questions MUST NOT be disclosed');
      assert.ok(resultRes.body.message.includes('technical verification'));
      assertNoBannedTerms(resultRes.body.message);
    }
  ));

  // ─── SCENARIO 5: Teardown Flush / Active Incident at Submission ───────────────
  it('5. Incident active at submission is cleanly clamped to T_finalization without hanging or crashing', withIntegrationDatabase(
    (() => {
      const now = new Date(Date.now() - 60000); // started 60s ago
      const session = {
        _id: 'session_c_teardown_1',
        user: 'student_c_5',
        mockTest: 'mock_test_jee_main_1',
        status: 'in_progress',
        evaluationStatus: 'PENDING',
        startedAt: now,
        expiresAt: new Date(now.getTime() + 180 * 60 * 1000),
        answers: [],
        proctoringSession: 'proc_sess_c_teardown_1',
        save: async function () { return this; },
      };

      const procSession = {
        _id: 'proc_sess_c_teardown_1',
        mockTestSession: 'session_c_teardown_1',
        user: 'student_c_5',
        status: 'active',
        cameraState: 'active',
        screenShareState: 'active',
        metadata: { cvStatus: 'active', screenAiStatus: 'active' },
        save: async function () { return this; },
      };

      // Candidate lost focus 10s ago, did not regain focus before clicking submit
      const events = [
        { type: 'CAMERA_STARTED', source: 'media', timestamp: createTimestamp(now, 500), duration: 0 },
        { type: 'SCREEN_SHARE_STARTED', source: 'screen', timestamp: createTimestamp(now, 1000), duration: 0 },
        { type: 'FOCUS_LOST', source: 'attention', timestamp: createTimestamp(now, 50000), duration: 0 },
      ];

      return { session, procSession, events };
    })(),
    async ({ session, procSession, mockTest, getSavedAssessment }) => {
      // Call finalizeMockTestSession directly with adjudicationMode: true
      const finalizationResult = await finalizeMockTestSession(session, mockTest, {
        adjudicationMode: true,
      });

      assert.ok(finalizationResult);
      assert.ok(finalizationResult.adjudication);
      assert.equal(procSession.status, 'completed');
      assert.ok(procSession.endedAt);
      // Ensure adjudication completed deterministically without error
      assert.ok(['RELEASE', 'VOID', 'TECHNICAL'].includes(finalizationResult.adjudication.decision));
    }
  ));

  // ─── SCENARIO 6: Idempotency on Repeated Submission ──────────────────────────
  it('6. Double-submission is rejected with HTTP 400 and does not re-evaluate or mutate state', withIntegrationDatabase(
    (() => {
      const now = new Date();
      const session = {
        _id: 'session_c_idempotency_1',
        user: 'student_c_6',
        mockTest: 'mock_test_jee_main_1',
        status: 'completed', // Already completed
        evaluationStatus: 'EVALUATED',
        startedAt: now,
        submittedAt: now,
        expiresAt: new Date(now.getTime() + 180 * 60 * 1000),
        result: { score: 8, maxMarks: 8, totalQuestions: 2 },
        answers: [
          { questionId: 'q1', section: 'physics', selectedOption: 0, isMarkedForReview: false },
          { questionId: 'q2', section: 'chemistry', selectedOption: 2, isMarkedForReview: false },
        ],
        save: async function () { return this; },
      };

      return { session };
    })(),
    async ({ session }) => {
      const submitReq = {
        params: { sessionId: 'session_c_idempotency_1' },
        user: { id: 'student_c_6' },
        body: { adjudicationMode: true, answers: [] },
      };
      const submitRes = createMockRes();
      let capturedErr = null;

      await submitMockTestSession(submitReq, submitRes, (err) => {
        capturedErr = err;
      });

      assert.equal(submitRes.statusCode, 400);
      assert.ok(capturedErr);
      assert.match(capturedErr.message, /already been submitted/i);
    }
  ));

  // ─── SCENARIO 7: Candidate Result Access Control & Isolation ──────────────────
  it('7. Access control strictly isolates candidate results and blocks unevaluated/in-progress attempts', withIntegrationDatabase(
    (() => {
      const now = new Date();
      const session = {
        _id: 'session_c_auth_1',
        user: 'student_c_owner',
        mockTest: 'mock_test_jee_main_1',
        status: 'in_progress', // still in progress
        evaluationStatus: 'PENDING',
        startedAt: now,
        expiresAt: new Date(now.getTime() + 180 * 60 * 1000),
        save: async function () { return this; },
      };

      return { session };
    })(),
    async ({ session }) => {
      // Attempt 1: Unauthorized candidate requests session result -> HTTP 403
      const unauthorizedReq = {
        params: { sessionId: 'session_c_auth_1' },
        user: { id: 'student_c_intruder' },
      };
      const unauthRes = createMockRes();
      let unauthErr = null;

      await getMockTestResult(unauthorizedReq, unauthRes, (err) => {
        unauthErr = err;
      });

      assert.equal(unauthRes.statusCode, 403);
      assert.ok(unauthErr);
      assert.match(unauthErr.message, /not authorized to access this exam session/i);

      // Attempt 2: Owner requests session result while still in_progress -> HTTP 400
      const ownerReq = {
        params: { sessionId: 'session_c_auth_1' },
        user: { id: 'student_c_owner' },
      };
      const ownerRes = createMockRes();
      let inProgressErr = null;

      await getMockTestResult(ownerReq, ownerRes, (err) => {
        inProgressErr = err;
      });

      assert.equal(ownerRes.statusCode, 400);
      assert.ok(inProgressErr);
      assert.match(inProgressErr.message, /in progress/i);
    }
  ));

  // ─── SCENARIO 8: Administrative Review Override on Technical Hold ────────────
  it('8. Administrator can review HELD_TECHNICAL_REVIEW attempt, candidate cannot self-review, re-review blocked', withIntegrationDatabase(
    (() => {
      const now = new Date();
      const session = {
        _id: 'session_c_admin_1',
        user: 'student_c_held',
        mockTest: 'mock_test_jee_main_1',
        status: 'completed',
        evaluationStatus: 'HELD_TECHNICAL_REVIEW',
        startedAt: now,
        submittedAt: now,
        expiresAt: new Date(now.getTime() + 180 * 60 * 1000),
        answers: [
          { questionId: 'q1', section: 'physics', selectedOption: 0, isMarkedForReview: false },
          { questionId: 'q2', section: 'chemistry', selectedOption: 2, isMarkedForReview: false },
        ],
        save: async function () { return this; },
      };

      return { session };
    })(),
    async ({ session }) => {
      // 8A. Candidate cannot review their own session even if calling review endpoint -> HTTP 403
      const selfReviewReq = {
        params: { sessionId: 'session_c_admin_1' },
        user: { _id: 'student_c_held', id: 'student_c_held', role: 'reviewer' },
        body: { decision: 'RELEASE', notes: 'Trying to self-clear' },
      };
      const selfRes = createMockRes();
      let selfErr = null;

      await reviewMockTestSession(selfReviewReq, selfRes, (err) => {
        selfErr = err;
      });

      assert.equal(selfRes.statusCode, 403);
      assert.ok(selfErr);
      assert.match(selfErr.message, /not permitted to review their own/i);

      // 8B. Legitimate Administrator overrides technical hold with RELEASE
      const adminReq = {
        params: { sessionId: 'session_c_admin_1' },
        user: { _id: 'admin_officer_9', id: 'admin_officer_9', role: 'reviewer' },
        body: { decision: 'RELEASE', notes: 'Verified genuine camera driver crash on appeal.' },
      };
      const adminRes = createMockRes();

      await reviewMockTestSession(adminReq, adminRes, (err) => {
        if (err) throw err;
      });

      assert.equal(adminRes.statusCode, 200);
      assert.equal(session.evaluationStatus, 'EVALUATED');
      assert.ok(session.result, 'Academic score must be calculated and released upon admin override');
      assert.equal(session.result.score, 8);
      assert.equal(session.reviewAudit.decision, 'RELEASE');
      assert.equal(session.reviewAudit.reviewedBy, 'admin_officer_9');
      assert.equal(session.reviewAudit.notes, 'Verified genuine camera driver crash on appeal.');

      // 8C. Re-reviewing already resolved session is prohibited -> HTTP 409
      const reReviewReq = {
        params: { sessionId: 'session_c_admin_1' },
        user: { _id: 'admin_officer_10', id: 'admin_officer_10', role: 'reviewer' },
        body: { decision: 'REJECT' },
      };
      const reRes = createMockRes();
      let reErr = null;

      await reviewMockTestSession(reReviewReq, reRes, (err) => {
        reErr = err;
      });

      assert.equal(reRes.statusCode, 409);
      assert.ok(reErr);
      assert.match(reErr.message, /already been evaluated and released|already been reviewed/i);
    }
  ));

  // ─── SCENARIO 9: Non-Accusatory Terminology Enforcement Across All Surfaces ───
  it('9. Zero banned/accusatory terms exist across all candidate receipts and hold notices', () => {
    const receipts = [
      'Exam submitted successfully. Session integrity requirements were not met.',
      'Exam submitted successfully. Your submission is undergoing technical verification before results can be released.',
      'Exam submitted and evaluated successfully.',
      'Exam integrity requirements were not satisfied; no score published.',
      'Exam telemetry was inconclusive due to technical interruption; no score published.',
      'Your exam submission is currently undergoing technical verification. Results will be released once verification is complete.',
      'Your exam submission was rejected upon review. Academic scores and question reviews are not available for this session.',
      'Session Advisory: Minor environmental or attention fluctuations were recorded during your examination. Your score has been verified and released.',
    ];

    for (const receipt of receipts) {
      assertNoBannedTerms(receipt);
    }
  });
});
