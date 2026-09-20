const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const MockTestSession = require('../models/MockTestSession');
const ProctoringSession = require('../models/ProctoringSession');
const { ProctoringEvent } = require('../models/ProctoringEvent');
const ProctoringEpisode = require('../models/ProctoringEpisode');
const MockTest = require('../models/MockTest');
const {
  extractEvidence,
  computeStatistics,
  buildTimeline,
  buildRelationships,
  buildTechnicalObservations,
  buildUnknowns,
  synthesizeReport,
} = require('../services/proctoringReportService');
const { getProctoringReport } = require('../controllers/proctoringController');
const { protect } = require('../middleware/authMiddleware');

describe('Proctoring Report & Evidence-Grounded Reasoning Suite (Phase 6)', () => {
  const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_12345';
  process.env.JWT_SECRET = JWT_SECRET;

  const baseDate = new Date('2026-09-20T14:00:00.000Z');

  // Sample raw events
  const sampleEvents = [
    {
      _id: 'ev_1',
      type: 'CAMERA_STARTED',
      source: 'media',
      timestamp: new Date(baseDate.getTime() + 1000),
      duration: 0,
      metadata: {},
    },
    {
      _id: 'ev_2',
      type: 'FOCUS_LOST',
      source: 'browser',
      timestamp: new Date(baseDate.getTime() + 10000),
      duration: 0,
      metadata: {},
    },
    {
      _id: 'ev_3',
      type: 'PAGE_HIDDEN',
      source: 'browser',
      timestamp: new Date(baseDate.getTime() + 10850),
      duration: 0,
      metadata: {},
    },
    {
      _id: 'ev_4',
      type: 'SCREEN_VIEW_CHANGED',
      source: 'screen',
      timestamp: new Date(baseDate.getTime() + 12000),
      duration: 1500,
      metadata: { similarity: 0.65, classification: 'UNEXPECTED_VIEW' },
    },
    {
      _id: 'ev_5',
      type: 'FACE_ABSENT',
      source: 'webcam',
      timestamp: new Date(baseDate.getTime() + 20000),
      duration: 2400,
      metadata: {},
    },
    {
      _id: 'ev_6',
      type: 'HEAD_POSE_DEVIATION',
      source: 'webcam',
      timestamp: new Date(baseDate.getTime() + 25000),
      duration: 1200,
      metadata: { maxYaw: 32, maxPitch: 15 },
    },
    {
      _id: 'ev_7',
      type: 'MULTIPLE_FACES',
      source: 'webcam',
      timestamp: new Date(baseDate.getTime() + 30000),
      duration: 1100,
      metadata: { maxFacesObserved: 2 },
    },
    {
      _id: 'ev_8',
      type: 'CAMERA_STOPPED',
      source: 'media',
      timestamp: new Date(baseDate.getTime() + 40000),
      duration: 0,
      metadata: {},
    },
    {
      _id: 'ev_9',
      type: 'SCREEN_VIEW_UNAVAILABLE',
      source: 'screen',
      timestamp: new Date(baseDate.getTime() + 45000),
      duration: 0,
      metadata: { reason: 'capture_ended' },
    },
  ];

  // Sample Phase 5 episodes
  const sampleEpisodes = [
    {
      _id: 'ep_1',
      startedAt: new Date(baseDate.getTime() + 10000),
      endedAt: new Date(baseDate.getTime() + 13500),
      durationMs: 3500,
      eventIds: ['ev_2', 'ev_3', 'ev_4'],
      signalTypes: ['FOCUS_LOST', 'PAGE_HIDDEN', 'SCREEN_VIEW_CHANGED'],
      relationships: [
        {
          type: 'FOCUS_VISIBILITY_ALIGNMENT',
          eventIds: ['ev_2', 'ev_3'],
          startTime: new Date(baseDate.getTime() + 10000),
          endTime: new Date(baseDate.getTime() + 10850),
          deltaMs: 850,
        },
        {
          type: 'SCREEN_CHANGE_WITH_BROWSER_ATTENTION_CHANGE',
          eventIds: ['ev_2', 'ev_4'],
          startTime: new Date(baseDate.getTime() + 10000),
          endTime: new Date(baseDate.getTime() + 12000),
          deltaMs: 2000,
        },
      ],
      answerInteractionContext: {
        questionId: 'q_phy_17',
        questionNumber: 17,
        section: 'PHYSICS',
        answeredAt: new Date(baseDate.getTime() + 11500),
      },
      summary: {
        eventCount: 3,
        categories: ['ATTENTION', 'SCREEN'],
        relationshipTypes: ['FOCUS_VISIBILITY_ALIGNMENT', 'SCREEN_CHANGE_WITH_BROWSER_ATTENTION_CHANGE'],
      },
    },
    {
      _id: 'ep_2',
      startedAt: new Date(baseDate.getTime() + 20000),
      endedAt: new Date(baseDate.getTime() + 22400),
      durationMs: 2400,
      eventIds: ['ev_5'],
      signalTypes: ['FACE_ABSENT'],
      relationships: [],
      answerInteractionContext: null,
      summary: {
        eventCount: 1,
        categories: ['CAMERA'],
        relationshipTypes: [],
      },
    },
  ];

  const sampleMockSession = {
    _id: 'mock_sess_101',
    user: 'student_123',
    status: 'completed',
    startedAt: new Date(baseDate.getTime()),
    submittedAt: new Date(baseDate.getTime() + 3600000),
    answers: [{ questionId: 'q_phy_17', section: 'physics', selectedOption: 1 }],
    result: {
      score: 85,
      maxMarks: 120,
      totalQuestions: 30,
      correctCount: 22,
      incorrectCount: 3,
      unattemptedCount: 5,
    },
  };

  const sampleProcSession = {
    _id: 'proc_sess_202',
    mockTestSession: 'mock_sess_101',
    user: 'student_123',
    status: 'completed',
    startedAt: new Date(baseDate.getTime()),
    endedAt: new Date(baseDate.getTime() + 3600000),
    cameraState: 'inactive',
    screenShareState: 'inactive',
    fullscreenState: 'inactive',
  };

  const sampleMockTest = {
    _id: 'mock_test_1',
    title: 'JEE Main Full Mock Assessment 1',
    duration: 60,
    totalQuestions: 30,
    questions: [{ id: 'q_phy_17', section: 'physics' }],
  };

  // ─── 1. Evidence Extraction: OBSERVED ─────────────────────────
  it('1. extractEvidence extracts OBSERVED evidence items directly from raw events', () => {
    const evidence = extractEvidence(sampleEvents, sampleEpisodes);
    const observed = evidence.filter((e) => e.type === 'OBSERVED');
    assert.equal(observed.length, sampleEvents.length);
    assert.equal(observed[0].eventType, 'CAMERA_STARTED');
    assert.equal(observed[1].eventType, 'FOCUS_LOST');
    assert.ok(observed[1].description.includes('browser window blur'));
  });

  // ─── 2. Evidence Extraction: DERIVED ──────────────────────────
  it('2. extractEvidence extracts DERIVED evidence items directly from Phase 5 relationships', () => {
    const evidence = extractEvidence(sampleEvents, sampleEpisodes);
    const derived = evidence.filter((e) => e.type === 'DERIVED');
    assert.equal(derived.length, 2);
    assert.equal(derived[0].relationshipType, 'FOCUS_VISIBILITY_ALIGNMENT');
    assert.equal(derived[0].deltaMs, 850);
    assert.ok(derived[0].description.includes('850 ms'));
  });

  // ─── 3. INTERPRETED Template Generation ───────────────────────
  it('3. buildTimeline generates deterministic INTERPRETED template narratives for episodes', () => {
    const evidence = extractEvidence(sampleEvents, sampleEpisodes);
    const timeline = buildTimeline(sampleEpisodes, evidence);
    assert.equal(timeline.length, 2);
    assert.ok(timeline[0].narrative.includes('FOCUS_LOST, PAGE_HIDDEN, SCREEN_VIEW_CHANGED'));
    assert.ok(timeline[0].narrative.includes('FOCUS_VISIBILITY_ALIGNMENT'));
  });

  // ─── 4. UNKNOWN Generation ────────────────────────────────────
  it('4. buildUnknowns generates explicit limitation statements grounded in evidence types', () => {
    const evidence = extractEvidence(sampleEvents, sampleEpisodes);
    const unknowns = buildUnknowns(sampleEvents, evidence);
    assert.ok(unknowns.length >= 4);
    const categories = unknowns.map((u) => u.category);
    assert.ok(categories.includes('SCREEN'));
    assert.ok(categories.includes('CAMERA'));
    assert.ok(categories.includes('ATTENTION'));
  });

  // ─── 5. Statistics: Event Counts ──────────────────────────────
  it('5. computeStatistics accurately counts occurrences of each event type', () => {
    const stats = computeStatistics(sampleEvents, sampleEpisodes, sampleMockSession, sampleProcSession);
    assert.equal(stats.totalEvents, sampleEvents.length);
    assert.equal(stats.eventCounts.FOCUS_LOST, 1);
    assert.equal(stats.eventCounts.PAGE_HIDDEN, 1);
    assert.equal(stats.eventCounts.SCREEN_VIEW_CHANGED, 1);
  });

  // ─── 6. Statistics: Episode Counts ────────────────────────────
  it('6. computeStatistics accurately calculates total episodes and category distributions', () => {
    const stats = computeStatistics(sampleEvents, sampleEpisodes, sampleMockSession, sampleProcSession);
    assert.equal(stats.totalEpisodes, 2);
    assert.equal(stats.episodeCountsByCategory.ATTENTION, 1);
    assert.equal(stats.episodeCountsByCategory.CAMERA, 1);
  });

  // ─── 7. Statistics: Relationship Counts ───────────────────────
  it('7. computeStatistics accurately aggregates relationship counts', () => {
    const stats = computeStatistics(sampleEvents, sampleEpisodes, sampleMockSession, sampleProcSession);
    assert.equal(stats.totalRelationships, 2);
    assert.equal(stats.relationshipCounts.FOCUS_VISIBILITY_ALIGNMENT, 1);
    assert.equal(stats.relationshipCounts.SCREEN_CHANGE_WITH_BROWSER_ATTENTION_CHANGE, 1);
  });

  // ─── 8. Statistics: Duration Calculations ─────────────────────
  it('8. computeStatistics accurately calculates longest event durations and session duration', () => {
    const stats = computeStatistics(sampleEvents, sampleEpisodes, sampleMockSession, sampleProcSession);
    assert.equal(stats.sessionDurationMs, 3600000);
    assert.equal(stats.longestFaceAbsenceMs, 2400);
    assert.equal(stats.longestScreenChangeEpisodeMs, 1500);
    assert.equal(stats.longestAttentionEpisodeMs, 3500);
  });

  // ─── 9. Statistics: Category Counts ───────────────────────────
  it('9. computeStatistics accurately calculates technical interruptions (camera, screen, fullscreen)', () => {
    const stats = computeStatistics(sampleEvents, sampleEpisodes, sampleMockSession, sampleProcSession);
    assert.equal(stats.cameraInterruptions, 1); // CAMERA_STOPPED = 1
    assert.equal(stats.screenInterruptions, 1); // SCREEN_VIEW_UNAVAILABLE = 1
    assert.equal(stats.fullscreenExits, 0);
  });

  // ─── 10. Traceability: Timeline Items ─────────────────────────
  it('10. Every timeline item has valid, non-empty evidence IDs mapping to observed evidence', () => {
    const evidence = extractEvidence(sampleEvents, sampleEpisodes);
    const timeline = buildTimeline(sampleEpisodes, evidence);
    for (const item of timeline) {
      assert.ok(Array.isArray(item.evidenceIds));
      assert.ok(item.evidenceIds.length > 0, `Timeline item ${item.id} must have evidence IDs`);
      for (const eid of item.evidenceIds) {
        const found = evidence.find((e) => e.id === eid);
        assert.ok(found, `Timeline evidenceId ${eid} must exist in evidence index`);
      }
    }
  });

  // ─── 11. Traceability: Relationships ──────────────────────────
  it('11. Every relationship has valid evidence IDs resolving to constituent events and derived items', () => {
    const evidence = extractEvidence(sampleEvents, sampleEpisodes);
    const relationships = buildRelationships(sampleEpisodes, evidence);
    assert.equal(relationships.length, 2);
    for (const rel of relationships) {
      assert.ok(Array.isArray(rel.evidenceIds));
      assert.ok(rel.evidenceIds.length > 0, `Relationship ${rel.id} must have evidence IDs`);
      for (const eid of rel.evidenceIds) {
        const found = evidence.find((e) => e.id === eid);
        assert.ok(found, `Relationship evidenceId ${eid} must exist in evidence index`);
      }
    }
  });

  // ─── 12. Traceability: Evidence References Resolution ──────────
  it('12. Every evidence reference resolves cleanly to an existing event ID and episode ID', () => {
    const evidence = extractEvidence(sampleEvents, sampleEpisodes);
    const rawIds = new Set(sampleEvents.map((e) => String(e._id)));
    const epIds = new Set(sampleEpisodes.map((e) => String(e._id)));

    for (const ev of evidence) {
      if (ev.type === 'OBSERVED') {
        assert.ok(rawIds.has(ev.eventIds[0]), `Observed eventId ${ev.eventIds[0]} must exist`);
      }
      if (ev.episodeId) {
        assert.ok(epIds.has(ev.episodeId), `Evidence episodeId ${ev.episodeId} must exist`);
      }
    }
  });

  // ─── 13. Traceability: No Orphan Evidence References ──────────
  it('13. No orphan evidence references exist in synthesized report', () => {
    const report = synthesizeReport(sampleMockSession, sampleProcSession, sampleMockTest, sampleEvents, sampleEpisodes);
    const evidenceIdSet = new Set(report.evidence.map((e) => e.id));

    report.timeline.forEach((tl) => {
      tl.evidenceIds.forEach((eid) => {
        assert.ok(evidenceIdSet.has(eid), `Timeline references unknown evidenceId: ${eid}`);
      });
    });

    report.relationships.forEach((rel) => {
      rel.evidenceIds.forEach((eid) => {
        assert.ok(evidenceIdSet.has(eid), `Relationship references unknown evidenceId: ${eid}`);
      });
    });

    report.unknowns.forEach((unk) => {
      unk.applicableEvidenceIds.forEach((eid) => {
        assert.ok(evidenceIdSet.has(eid), `Unknown references unknown evidenceId: ${eid}`);
      });
    });
  });

  // ─── 14. Limitations: Screen-View Change ──────────────────────
  it('14. Screen-view change generates explicit screen-content limitation without app claims', () => {
    const evidence = extractEvidence(sampleEvents, sampleEpisodes);
    const unknowns = buildUnknowns(sampleEvents, evidence);
    const screenUnk = unknowns.find((u) => u.category === 'SCREEN');
    assert.ok(screenUnk);
    assert.ok(screenUnk.description.includes('does not identify the specific application'));
    assert.ok(!screenUnk.description.includes('cheating'));
  });

  // ─── 15. Limitations: Face Absence ────────────────────────────
  it('15. Face absence generates explicit detector limitation without looking-away claims', () => {
    const evidence = extractEvidence(sampleEvents, sampleEpisodes);
    const unknowns = buildUnknowns(sampleEvents, evidence);
    const faceUnk = unknowns.find((u) => u.description.includes('Face absence means'));
    assert.ok(faceUnk);
    assert.ok(faceUnk.description.includes('does not establish why the face was not detected'));
    assert.ok(!faceUnk.description.includes('looked away'));
  });

  // ─── 16. Limitations: Head Pose Deviation ─────────────────────
  it('16. Head-pose deviation generates explicit threshold limitation without device claims', () => {
    const evidence = extractEvidence(sampleEvents, sampleEpisodes);
    const unknowns = buildUnknowns(sampleEvents, evidence);
    const poseUnk = unknowns.find((u) => u.description.includes('Head-pose deviation indicates'));
    assert.ok(poseUnk);
    assert.ok(poseUnk.description.includes('does not establish what the student was looking at'));
    assert.ok(!poseUnk.description.includes('another device'));
  });

  // ─── 17. Limitations: Focus Loss ──────────────────────────────
  it('17. Focus loss generates explicit intent limitation without intent claims', () => {
    const evidence = extractEvidence(sampleEvents, sampleEpisodes);
    const unknowns = buildUnknowns(sampleEvents, evidence);
    const attnUnk = unknowns.find((u) => u.category === 'ATTENTION');
    assert.ok(attnUnk);
    assert.ok(attnUnk.description.includes('do not establish user intent'));
  });

  // ─── 18. Limitations: Multiple Faces ──────────────────────────
  it('18. Multiple faces generates explicit identity limitation without assistance claims', () => {
    const evidence = extractEvidence(sampleEvents, sampleEpisodes);
    const unknowns = buildUnknowns(sampleEvents, evidence);
    const multiUnk = unknowns.find((u) => u.description.includes('Multiple-face detection establishes'));
    assert.ok(multiUnk);
    assert.ok(multiUnk.description.includes('does not establish who the additional person was'));
    assert.ok(!multiUnk.description.includes('cheated with'));
  });

  // ─── 19. Safety: No Cheating Score ────────────────────────────
  it('19. Synthesized report contains zero cheating score', () => {
    const report = synthesizeReport(sampleMockSession, sampleProcSession, sampleMockTest, sampleEvents, sampleEpisodes);
    const reportStr = JSON.stringify(report).toLowerCase();
    assert.ok(!reportStr.includes('cheatingscore'));
    assert.ok(!reportStr.includes('"score":100')); // Academic score is 85
  });

  // ─── 20. Safety: No Suspicion Score ───────────────────────────
  it('20. Synthesized report contains zero suspicion score or rating', () => {
    const report = synthesizeReport(sampleMockSession, sampleProcSession, sampleMockTest, sampleEvents, sampleEpisodes);
    const reportStr = JSON.stringify(report).toLowerCase();
    assert.ok(!reportStr.includes('suspicionscore'));
    assert.ok(!reportStr.includes('suspicion'));
  });

  // ─── 21. Safety: No Risk Score ────────────────────────────────
  it('21. Synthesized report contains zero risk score or level', () => {
    const report = synthesizeReport(sampleMockSession, sampleProcSession, sampleMockTest, sampleEvents, sampleEpisodes);
    const reportStr = JSON.stringify(report).toLowerCase();
    assert.ok(!reportStr.includes('riskscore'));
    assert.ok(!reportStr.includes('"risk"'));
  });

  // ─── 22. Safety: No Cheating Probability ──────────────────────
  it('22. Synthesized report contains zero cheating probability', () => {
    const report = synthesizeReport(sampleMockSession, sampleProcSession, sampleMockTest, sampleEvents, sampleEpisodes);
    const reportStr = JSON.stringify(report).toLowerCase();
    assert.ok(!reportStr.includes('cheatingprobability'));
    assert.ok(!reportStr.includes('probabilityofcheating'));
  });

  // ─── 23. Safety: No Cheating Verdict ──────────────────────────
  it('23. Synthesized report contains zero cheating verdict or student guilt conclusions', () => {
    const report = synthesizeReport(sampleMockSession, sampleProcSession, sampleMockTest, sampleEvents, sampleEpisodes);
    const reportStr = JSON.stringify(report).toLowerCase();
    assert.ok(!reportStr.includes('verdict'));
    assert.ok(!reportStr.includes('student cheated'));
    assert.ok(!reportStr.includes('student probably cheated'));
  });

  // ─── 24. Safety: No Intent Claims ─────────────────────────────
  it('24. Synthesized report contains zero intent claims or speculation', () => {
    const report = synthesizeReport(sampleMockSession, sampleProcSession, sampleMockTest, sampleEvents, sampleEpisodes);
    const reportStr = JSON.stringify(report).toLowerCase();
    assert.ok(!reportStr.includes('intended to'));
    assert.ok(!reportStr.includes('intentionally'));
  });

  // ─── 25. Safety: No External-App Claims ───────────────────────
  it('25. Synthesized report does not claim another application or specific app was opened', () => {
    const report = synthesizeReport(sampleMockSession, sampleProcSession, sampleMockTest, sampleEvents, sampleEpisodes);
    const reportStr = JSON.stringify(report).toLowerCase();
    assert.ok(!reportStr.includes('student used another application'));
    assert.ok(!reportStr.includes('switched to another application'));
    assert.ok(!reportStr.includes('whatsapp'));
    assert.ok(!reportStr.includes('discord'));
  });

  // ─── 26. Determinism: Identical Inputs Yield Identical Output ─
  it('26. Same authoritative inputs produce identical substantive report output (excluding generatedAt)', () => {
    const report1 = synthesizeReport(sampleMockSession, sampleProcSession, sampleMockTest, sampleEvents, sampleEpisodes);
    const report2 = synthesizeReport(sampleMockSession, sampleProcSession, sampleMockTest, sampleEvents, sampleEpisodes);

    assert.deepEqual(report1, report2, 'Substantive report output must be 100% deterministic');
  });

  // ─── 27. Academic Isolation: Score Unchanged ──────────────────
  it('27. Report generation does not modify academic score or marks in MockTestSession', () => {
    const sessionCopy = JSON.parse(JSON.stringify(sampleMockSession));
    synthesizeReport(sessionCopy, sampleProcSession, sampleMockTest, sampleEvents, sampleEpisodes);
    assert.equal(sessionCopy.result.score, 85);
    assert.equal(sessionCopy.result.maxMarks, 120);
  });

  // ─── 28. Academic Isolation: Answers Unchanged ────────────────
  it('28. Report generation does not alter student answer selections or review state', () => {
    const sessionCopy = JSON.parse(JSON.stringify(sampleMockSession));
    synthesizeReport(sessionCopy, sampleProcSession, sampleMockTest, sampleEvents, sampleEpisodes);
    assert.equal(sessionCopy.answers[0].selectedOption, 1);
    assert.equal(sessionCopy.answers[0].questionId, 'q_phy_17');
  });

  // ─── 29. Academic Isolation: Test Status Unchanged ────────────
  it('29. Report generation does not modify session completion status', () => {
    const sessionCopy = JSON.parse(JSON.stringify(sampleMockSession));
    synthesizeReport(sessionCopy, sampleProcSession, sampleMockTest, sampleEvents, sampleEpisodes);
    assert.equal(sessionCopy.status, 'completed');
  });

  // ─── 30. API Security: Unauthenticated Access (401) ───────────
  it('30. GET /api/mock-tests/:sessionId/proctoring/report rejects unauthenticated requests with 401', async () => {
    const req = { headers: {} };
    let statusCalled = null;
    let nextError = null;
    const res = {
      status: (code) => {
        statusCalled = code;
        return res;
      },
    };

    await protect(req, res, (err) => {
      nextError = err;
    });

    assert.equal(statusCalled, 401);
    assert.ok(nextError);
    assert.match(nextError.message, /token missing/i);
  });

  // ─── 31. API Security: Cross-User Access (403) ────────────────
  it('31. getProctoringReport rejects requests for another user session with 403', async () => {
    const originalFindById = MockTestSession.findById;
    MockTestSession.findById = async () => ({
      _id: 'session_target',
      user: 'owner_user_id',
    });

    try {
      const req = {
        user: { id: 'attacker_user_id' },
        params: { sessionId: 'session_target' },
      };

      let statusCalled = null;
      let nextError = null;
      const res = {
        status: (code) => {
          statusCalled = code;
          return res;
        },
      };

      await getProctoringReport(req, res, (err) => {
        nextError = err;
      });

      assert.equal(statusCalled, 403);
      assert.ok(nextError);
      assert.match(nextError.message, /not authorized/i);
    } finally {
      MockTestSession.findById = originalFindById;
    }
  });

  // ─── 32. API Security: Missing Session Handled (404) ──────────
  it('32. getProctoringReport returns 404 for non-existent session', async () => {
    const originalFindById = MockTestSession.findById;
    MockTestSession.findById = async () => null;

    try {
      const req = {
        user: { id: 'student_123' },
        params: { sessionId: 'nonexistent_id' },
      };

      let statusCalled = null;
      let nextError = null;
      const res = {
        status: (code) => {
          statusCalled = code;
          return res;
        },
      };

      await getProctoringReport(req, res, (err) => {
        nextError = err;
      });

      assert.equal(statusCalled, 404);
      assert.ok(nextError);
      assert.match(nextError.message, /not found/i);
    } finally {
      MockTestSession.findById = originalFindById;
    }
  });
});
