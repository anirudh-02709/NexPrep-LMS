const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const MockTestSession = require('../models/MockTestSession');
const ProctoringSession = require('../models/ProctoringSession');
const { ProctoringEvent } = require('../models/ProctoringEvent');
const ProctoringEpisode = require('../models/ProctoringEpisode');
const MockTest = require('../models/MockTest');
const {
  CORRELATION_WINDOW_MS,
  MAX_CLUSTER_DURATION_MS,
  classifyEvent,
  evaluatePairwiseRelationships,
  correlateEvents,
  syncSessionEpisodes,
} = require('../services/temporalCorrelationService');
const { getProctoringCorrelations } = require('../controllers/proctoringController');
const { protect } = require('../middleware/authMiddleware');

describe('Event Correlation & Temporal Analysis Suite (Phase 5)', () => {
  const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_12345';
  process.env.JWT_SECRET = JWT_SECRET;

  const baseDate = new Date('2026-09-20T14:00:00.000Z');

  // ─── 1. Schema & Indexes ──────────────────────────────────────
  it('1. ProctoringEpisode schema defines required fields, indexes, and no suspicion scores', () => {
    const indexes = ProctoringEpisode.schema.indexes();
    const hasProcSessionTimeIndex = indexes.some(
      (idx) => idx[0] && idx[0].proctoringSession === 1 && idx[0].startedAt === 1
    );
    assert.ok(hasProcSessionTimeIndex, 'ProctoringEpisode must index { proctoringSession: 1, startedAt: 1 }');

    const schemaPaths = Object.keys(ProctoringEpisode.schema.paths);
    assert.ok(schemaPaths.includes('proctoringSession'));
    assert.ok(schemaPaths.includes('mockTestSession'));
    assert.ok(schemaPaths.includes('user'));
    assert.ok(schemaPaths.includes('startedAt'));
    assert.ok(schemaPaths.includes('endedAt'));
    assert.ok(schemaPaths.includes('durationMs'));
    assert.ok(schemaPaths.includes('eventIds'));
    assert.ok(schemaPaths.includes('signalTypes'));
    assert.ok(schemaPaths.includes('relationships'));
    assert.ok(schemaPaths.includes('answerInteractionContext'));
    assert.ok(schemaPaths.includes('summary'));

    // Verify negative boundaries: zero suspicion/cheating scores
    assert.ok(!schemaPaths.includes('suspicionScore'), 'Must NOT have suspicionScore');
    assert.ok(!schemaPaths.includes('cheatingScore'), 'Must NOT have cheatingScore');
    assert.ok(!schemaPaths.includes('riskScore'), 'Must NOT have riskScore');
    assert.ok(!schemaPaths.includes('cheatingProbability'), 'Must NOT have cheatingProbability');
  });

  // ─── 2. Single Meaningful Event ──────────────────────────────
  it('2. Single meaningful event produces exactly one episode with zero duration', () => {
    const events = [
      {
        _id: 'ev_1',
        type: 'FOCUS_LOST',
        source: 'browser',
        timestamp: new Date(baseDate.getTime() + 1000),
      },
    ];

    const episodes = correlateEvents(events);
    assert.equal(episodes.length, 1);
    assert.equal(episodes[0].eventIds.length, 1);
    assert.deepEqual(episodes[0].signalTypes, ['FOCUS_LOST']);
    assert.equal(episodes[0].durationMs, 0);
    assert.equal(episodes[0].summary.eventCount, 1);
    assert.deepEqual(episodes[0].summary.categories, ['ATTENTION']);
  });

  // ─── 3. Multiple Related Events in Window ─────────────────────
  it('3. Multiple related events within correlation window produce one bounded episode', () => {
    const events = [
      {
        _id: 'ev_1',
        type: 'FOCUS_LOST',
        timestamp: new Date(baseDate.getTime() + 1000),
      },
      {
        _id: 'ev_2',
        type: 'PAGE_HIDDEN',
        timestamp: new Date(baseDate.getTime() + 2000),
      },
      {
        _id: 'ev_3',
        type: 'FACE_ABSENT',
        timestamp: new Date(baseDate.getTime() + 3500),
      },
    ];

    const episodes = correlateEvents(events);
    assert.equal(episodes.length, 1);
    assert.equal(episodes[0].eventIds.length, 3);
    assert.equal(episodes[0].durationMs, 2500);
    assert.deepEqual(episodes[0].signalTypes, ['FOCUS_LOST', 'PAGE_HIDDEN', 'FACE_ABSENT']);
  });

  // ─── 4. Separated Events Form Separate Episodes ───────────────
  it('4. Events separated by more than correlation window produce separate episodes', () => {
    const events = [
      {
        _id: 'ev_1',
        type: 'FOCUS_LOST',
        timestamp: new Date(baseDate.getTime() + 1000),
      },
      {
        _id: 'ev_2',
        type: 'PAGE_HIDDEN',
        timestamp: new Date(baseDate.getTime() + 2000),
      },
      // 10 minutes later
      {
        _id: 'ev_3',
        type: 'FACE_ABSENT',
        timestamp: new Date(baseDate.getTime() + 602000),
      },
    ];

    const episodes = correlateEvents(events);
    assert.equal(episodes.length, 2);
    assert.equal(episodes[0].eventIds.length, 2);
    assert.equal(episodes[1].eventIds.length, 1);
  });

  // ─── 5. Heartbeat Invariance ──────────────────────────────────
  it('5. PROCTORING_HEARTBEAT events do not create, join, or extend episodes', () => {
    const events = [
      {
        _id: 'hb_1',
        type: 'PROCTORING_HEARTBEAT',
        timestamp: new Date(baseDate.getTime() + 1000),
      },
      {
        _id: 'hb_2',
        type: 'PROCTORING_HEARTBEAT',
        timestamp: new Date(baseDate.getTime() + 2000),
      },
      {
        _id: 'ev_1',
        type: 'FOCUS_LOST',
        timestamp: new Date(baseDate.getTime() + 10000),
      },
      {
        _id: 'hb_3',
        type: 'PROCTORING_HEARTBEAT',
        timestamp: new Date(baseDate.getTime() + 11000),
      },
    ];

    const episodes = correlateEvents(events);
    assert.equal(episodes.length, 1);
    assert.equal(episodes[0].eventIds.length, 1);
    assert.equal(episodes[0].signalTypes[0], 'FOCUS_LOST');
    assert.ok(!episodes[0].signalTypes.includes('PROCTORING_HEARTBEAT'));
  });

  // ─── 6. Continuous Stream Bounded Growth ──────────────────────
  it('6. Continuous stream of events cannot create an arbitrarily long episode (bounded by maxClusterDurationMs)', () => {
    // 25 events spaced by 2000ms: total span = 48,000ms > maxClusterDurationMs (30,000ms)
    const events = [];
    for (let i = 0; i < 25; i++) {
      events.push({
        _id: `ev_${i}`,
        type: i % 2 === 0 ? 'HEAD_POSE_DEVIATION' : 'FACE_PRESENT',
        timestamp: new Date(baseDate.getTime() + i * 2000),
      });
    }

    const episodes = correlateEvents(events, { maxClusterDurationMs: 30000 });
    // Must be split into at least 2 episodes because 48s exceeds the 30s cluster limit
    assert.ok(episodes.length >= 2, `Expected at least 2 episodes, got ${episodes.length}`);
    for (const ep of episodes) {
      assert.ok(
        ep.durationMs <= 30000,
        `Episode duration ${ep.durationMs}ms exceeded max cluster duration 30000ms`
      );
    }
  });

  // ─── 7. Rule A: FOCUS_LOST ↔ PAGE_HIDDEN ──────────────────────
  it('7. Rule A: FOCUS_LOST and PAGE_HIDDEN within window detect FOCUS_VISIBILITY_ALIGNMENT', () => {
    const events = [
      {
        _id: 'ev_1',
        type: 'FOCUS_LOST',
        timestamp: new Date(baseDate.getTime() + 1000),
      },
      {
        _id: 'ev_2',
        type: 'PAGE_HIDDEN',
        timestamp: new Date(baseDate.getTime() + 1850),
      },
    ];

    const episodes = correlateEvents(events);
    assert.equal(episodes.length, 1);
    const rels = episodes[0].relationships;
    assert.equal(rels.length, 1);
    assert.equal(rels[0].type, 'FOCUS_VISIBILITY_ALIGNMENT');
    assert.equal(rels[0].deltaMs, 850);
  });

  // ─── 8. Rule B: FOCUS_REGAINED ↔ PAGE_VISIBLE ─────────────────
  it('8. Rule B: FOCUS_REGAINED and PAGE_VISIBLE within window detect FOCUS_VISIBILITY_RETURN', () => {
    const events = [
      {
        _id: 'ev_1',
        type: 'FOCUS_REGAINED',
        timestamp: new Date(baseDate.getTime() + 5000),
      },
      {
        _id: 'ev_2',
        type: 'PAGE_VISIBLE',
        timestamp: new Date(baseDate.getTime() + 5500),
      },
    ];

    const episodes = correlateEvents(events);
    assert.equal(episodes.length, 1);
    const rels = episodes[0].relationships;
    assert.equal(rels.length, 1);
    assert.equal(rels[0].type, 'FOCUS_VISIBILITY_RETURN');
    assert.equal(rels[0].deltaMs, 500);
  });

  // ─── 9. Rule C: FACE_ABSENT ↔ Browser Attention Change ────────
  it('9. Rule C: FACE_ABSENT with FOCUS_LOST, PAGE_HIDDEN, or FULLSCREEN_EXITED detects FACE_ABSENCE_WITH_BROWSER_ATTENTION_CHANGE', () => {
    const events = [
      {
        _id: 'ev_1',
        type: 'FOCUS_LOST',
        timestamp: new Date(baseDate.getTime() + 1000),
      },
      {
        _id: 'ev_2',
        type: 'FACE_ABSENT',
        timestamp: new Date(baseDate.getTime() + 2200),
      },
    ];

    const episodes = correlateEvents(events);
    const rel = episodes[0].relationships.find(
      (r) => r.type === 'FACE_ABSENCE_WITH_BROWSER_ATTENTION_CHANGE'
    );
    assert.ok(rel);
    assert.equal(rel.deltaMs, 1200);
  });

  // ─── 10. Rule D: SCREEN_VIEW_CHANGED ↔ Browser Attention Change ─
  it('10. Rule D: SCREEN_VIEW_CHANGED with FOCUS_LOST or PAGE_HIDDEN detects SCREEN_CHANGE_WITH_BROWSER_ATTENTION_CHANGE', () => {
    const events = [
      {
        _id: 'ev_1',
        type: 'PAGE_HIDDEN',
        timestamp: new Date(baseDate.getTime() + 2000),
      },
      {
        _id: 'ev_2',
        type: 'SCREEN_VIEW_CHANGED',
        timestamp: new Date(baseDate.getTime() + 3500),
      },
    ];

    const episodes = correlateEvents(events);
    const rel = episodes[0].relationships.find(
      (r) => r.type === 'SCREEN_CHANGE_WITH_BROWSER_ATTENTION_CHANGE'
    );
    assert.ok(rel);
    assert.equal(rel.deltaMs, 1500);
  });

  // ─── 11. Rule E: MULTIPLE_FACES ↔ SCREEN_VIEW_CHANGED ─────────
  it('11. Rule E: MULTIPLE_FACES and SCREEN_VIEW_CHANGED detect MULTIPLE_FACES_WITH_SCREEN_CHANGE', () => {
    const events = [
      {
        _id: 'ev_1',
        type: 'MULTIPLE_FACES',
        timestamp: new Date(baseDate.getTime() + 1000),
      },
      {
        _id: 'ev_2',
        type: 'SCREEN_VIEW_CHANGED',
        timestamp: new Date(baseDate.getTime() + 2000),
      },
    ];

    const episodes = correlateEvents(events);
    const rel = episodes[0].relationships.find(
      (r) => r.type === 'MULTIPLE_FACES_WITH_SCREEN_CHANGE'
    );
    assert.ok(rel);
    assert.equal(rel.deltaMs, 1000);
  });

  // ─── 12. Rule F: SCREEN_VIEW_UNAVAILABLE ↔ SCREEN_SHARE_STOPPED
  it('12. Rule F: SCREEN_VIEW_UNAVAILABLE and SCREEN_SHARE_STOPPED detect SCREEN_CAPTURE_INTERRUPTION', () => {
    const events = [
      {
        _id: 'ev_1',
        type: 'SCREEN_VIEW_UNAVAILABLE',
        timestamp: new Date(baseDate.getTime() + 1000),
      },
      {
        _id: 'ev_2',
        type: 'SCREEN_SHARE_STOPPED',
        timestamp: new Date(baseDate.getTime() + 1100),
      },
    ];

    const episodes = correlateEvents(events);
    const rel = episodes[0].relationships.find(
      (r) => r.type === 'SCREEN_CAPTURE_INTERRUPTION'
    );
    assert.ok(rel);
    assert.equal(rel.deltaMs, 100);
  });

  // ─── 13. Rule G: CAMERA_STOPPED ↔ FACE_ABSENT ──────────────────
  it('13. Rule G: CAMERA_STOPPED and FACE_ABSENT detect CAMERA_MEDIA_INTERRUPTION', () => {
    const events = [
      {
        _id: 'ev_1',
        type: 'CAMERA_STOPPED',
        timestamp: new Date(baseDate.getTime() + 1000),
      },
      {
        _id: 'ev_2',
        type: 'FACE_ABSENT',
        timestamp: new Date(baseDate.getTime() + 1300),
      },
    ];

    const episodes = correlateEvents(events);
    const rel = episodes[0].relationships.find(
      (r) => r.type === 'CAMERA_MEDIA_INTERRUPTION'
    );
    assert.ok(rel);
    assert.equal(rel.deltaMs, 300);
  });

  // ─── 14. Mixed Episode Resolution ─────────────────────────────
  it('14. Mixed multi-signal sequence produces exactly one coherent episode with expected relationships', () => {
    const events = [
      { _id: 'e1', type: 'FOCUS_LOST', timestamp: new Date(baseDate.getTime() + 20000) },
      { _id: 'e2', type: 'PAGE_HIDDEN', timestamp: new Date(baseDate.getTime() + 21000) },
      { _id: 'e3', type: 'FACE_ABSENT', timestamp: new Date(baseDate.getTime() + 23000) },
      { _id: 'e4', type: 'SCREEN_VIEW_CHANGED', timestamp: new Date(baseDate.getTime() + 24000) },
      { _id: 'e5', type: 'FOCUS_REGAINED', timestamp: new Date(baseDate.getTime() + 27000) },
      { _id: 'e6', type: 'PAGE_VISIBLE', timestamp: new Date(baseDate.getTime() + 28000) },
      { _id: 'e7', type: 'FACE_PRESENT', timestamp: new Date(baseDate.getTime() + 29000) },
      { _id: 'e8', type: 'SCREEN_VIEW_STABLE', timestamp: new Date(baseDate.getTime() + 31000) },
    ];

    const episodes = correlateEvents(events);
    assert.equal(episodes.length, 1);
    assert.equal(episodes[0].eventIds.length, 8);
    assert.equal(episodes[0].durationMs, 11000);

    const relTypes = episodes[0].relationships.map((r) => r.type);
    assert.ok(relTypes.includes('FOCUS_VISIBILITY_ALIGNMENT'));
    assert.ok(relTypes.includes('FOCUS_VISIBILITY_RETURN'));
    assert.ok(relTypes.includes('FACE_ABSENCE_WITH_BROWSER_ATTENTION_CHANGE'));
    assert.ok(relTypes.includes('SCREEN_CHANGE_WITH_BROWSER_ATTENTION_CHANGE'));
  });

  // ─── 15. Timing Boundaries: 2999ms, 3000ms, 3001ms ─────────────
  it('15. Timing boundaries: delta = 2999ms and 3000ms detect relationship; delta = 3001ms does not', () => {
    // 2999ms
    const ev2999 = [
      { _id: 'a1', type: 'FOCUS_LOST', timestamp: new Date(baseDate.getTime() + 1000) },
      { _id: 'a2', type: 'PAGE_HIDDEN', timestamp: new Date(baseDate.getTime() + 3999) },
    ];
    const ep2999 = correlateEvents(ev2999);
    assert.equal(ep2999.length, 1);
    assert.equal(ep2999[0].relationships.length, 1);
    assert.equal(ep2999[0].relationships[0].deltaMs, 2999);

    // 3000ms
    const ev3000 = [
      { _id: 'b1', type: 'FOCUS_LOST', timestamp: new Date(baseDate.getTime() + 1000) },
      { _id: 'b2', type: 'PAGE_HIDDEN', timestamp: new Date(baseDate.getTime() + 4000) },
    ];
    const ep3000 = correlateEvents(ev3000);
    assert.equal(ep3000.length, 1);
    assert.equal(ep3000[0].relationships.length, 1);
    assert.equal(ep3000[0].relationships[0].deltaMs, 3000);

    // 3001ms (exceeds windowMs, separates into 2 episodes, 0 relationships)
    const ev3001 = [
      { _id: 'c1', type: 'FOCUS_LOST', timestamp: new Date(baseDate.getTime() + 1000) },
      { _id: 'c2', type: 'PAGE_HIDDEN', timestamp: new Date(baseDate.getTime() + 4001) },
    ];
    const ep3001 = correlateEvents(ev3001);
    assert.equal(ep3001.length, 2);
    assert.equal(ep3001[0].relationships.length, 0);
    assert.equal(ep3001[1].relationships.length, 0);
  });

  // ─── 16. Out-of-Order Input Sorting ───────────────────────────
  it('16. Shuffled or out-of-order input events are sorted chronologically by server timestamp', () => {
    const events = [
      { _id: 'ev_3', type: 'FACE_ABSENT', timestamp: new Date(baseDate.getTime() + 3000) },
      { _id: 'ev_1', type: 'FOCUS_LOST', timestamp: new Date(baseDate.getTime() + 1000) },
      { _id: 'ev_2', type: 'PAGE_HIDDEN', timestamp: new Date(baseDate.getTime() + 2000) },
    ];

    const episodes = correlateEvents(events);
    assert.equal(episodes.length, 1);
    assert.deepEqual(episodes[0].eventIds, ['ev_1', 'ev_2', 'ev_3']);
  });

  // ─── 17. Deduplication of Pairwise Relationships ───────────────
  it('17. Duplicate raw events do not produce duplicate relationship records', () => {
    const events = [
      { _id: 'ev_1', type: 'FOCUS_LOST', timestamp: new Date(baseDate.getTime() + 1000) },
      { _id: 'ev_2', type: 'PAGE_HIDDEN', timestamp: new Date(baseDate.getTime() + 2000) },
      { _id: 'ev_2', type: 'PAGE_HIDDEN', timestamp: new Date(baseDate.getTime() + 2000) }, // Duplicate
    ];

    const episodes = correlateEvents(events);
    const alignRels = episodes[0].relationships.filter(
      (r) => r.type === 'FOCUS_VISIBILITY_ALIGNMENT'
    );
    assert.equal(alignRels.length, 1, 'Should deduplicate relationships between the same event IDs');
  });

  // ─── 18. Authoritative Answer Interaction Context ─────────────
  it('18. Authoritative answer interaction in episode range attaches answerInteractionContext', () => {
    const events = [
      { _id: 'ev_1', type: 'FOCUS_LOST', timestamp: new Date(baseDate.getTime() + 10000) },
      { _id: 'ev_2', type: 'PAGE_HIDDEN', timestamp: new Date(baseDate.getTime() + 12000) },
    ];

    const mockTestSession = {
      _id: 'session_1',
      answers: [
        {
          questionId: 'q_phy_17',
          section: 'physics',
          selectedOption: 2,
          answeredAt: new Date(baseDate.getTime() + 11000), // Falls inside episode
        },
        {
          questionId: 'q_chem_5',
          section: 'chemistry',
          selectedOption: 0,
          answeredAt: new Date(baseDate.getTime() + 50000), // Outside episode
        },
      ],
    };

    const mockTest = {
      questions: [
        { id: 'q_phy_16', section: 'physics' },
        { id: 'q_phy_17', section: 'physics' },
      ],
    };

    const episodes = correlateEvents(events, { mockTestSession, mockTest });
    assert.equal(episodes.length, 1);
    assert.ok(episodes[0].answerInteractionContext);
    assert.equal(episodes[0].answerInteractionContext.questionId, 'q_phy_17');
    assert.equal(episodes[0].answerInteractionContext.questionNumber, 2);
    assert.equal(episodes[0].answerInteractionContext.section, 'PHYSICS');
  });

  // ─── 19. No Answer Interaction Context Falls Back to null ─────
  it('19. When no authoritative answer interaction occurs in episode range, answerInteractionContext is null', () => {
    const events = [
      { _id: 'ev_1', type: 'FOCUS_LOST', timestamp: new Date(baseDate.getTime() + 10000) },
      { _id: 'ev_2', type: 'PAGE_HIDDEN', timestamp: new Date(baseDate.getTime() + 12000) },
    ];

    const mockTestSession = {
      _id: 'session_1',
      answers: [
        {
          questionId: 'q_chem_5',
          section: 'chemistry',
          selectedOption: 0,
          answeredAt: new Date(baseDate.getTime() + 50000), // Far outside episode
        },
      ],
    };

    const episodes = correlateEvents(events, { mockTestSession });
    assert.equal(episodes.length, 1);
    assert.equal(episodes[0].answerInteractionContext, null);
  });

  // ─── 20. Context Terminology Verification ─────────────────────
  it('20. Terminology verification: answerInteractionContext is used, activeQuestionContext is not', () => {
    const events = [
      { _id: 'ev_1', type: 'FOCUS_LOST', timestamp: new Date(baseDate.getTime() + 1000) },
    ];

    const episodes = correlateEvents(events);
    assert.ok('answerInteractionContext' in episodes[0]);
    assert.ok(!('activeQuestionContext' in episodes[0]));
    assert.ok(!('activeQuestionCertainty' in episodes[0]));
  });

  // ─── 21. Event Classification Helper ──────────────────────────
  it('21. classifyEvent maps all event types deterministically to functional categories', () => {
    assert.equal(classifyEvent('FOCUS_LOST'), 'ATTENTION');
    assert.equal(classifyEvent('PAGE_VISIBLE'), 'ATTENTION');
    assert.equal(classifyEvent('FACE_PRESENT'), 'CAMERA');
    assert.equal(classifyEvent('MULTIPLE_FACES'), 'CAMERA');
    assert.equal(classifyEvent('SCREEN_VIEW_CHANGED'), 'SCREEN');
    assert.equal(classifyEvent('SCREEN_SURFACE_IDENTIFIED'), 'SCREEN');
    assert.equal(classifyEvent('CAMERA_STARTED'), 'SESSION_MEDIA');
    assert.equal(classifyEvent('PROCTORING_ERROR'), 'SESSION_MEDIA');
    assert.equal(classifyEvent('UNKNOWN_EVENT_TYPE'), 'SESSION_MEDIA');
  });

  // ─── 22. API Security: Unauthorized Access (401) ──────────────
  it('22. GET /api/mock-tests/:sessionId/proctoring/correlations rejects unauthenticated requests with 401', async () => {
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

  // ─── 23. API Security: Cross-User Access Rejection (403) ──────
  it('23. getProctoringCorrelations rejects requests for another user session with 403', async () => {
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

      await getProctoringCorrelations(req, res, (err) => {
        nextError = err;
      });

      assert.equal(statusCalled, 403);
      assert.ok(nextError);
      assert.match(nextError.message, /not authorized/i);
    } finally {
      MockTestSession.findById = originalFindById;
    }
  });

  // ─── 24. API: Authorized Correlations Retrieval & Idempotency ───
  it('24. getProctoringCorrelations returns structured episodes and is idempotent upon repeat calls', async () => {
    const originalMockFindById = MockTestSession.findById;
    const originalProcFindOne = ProctoringSession.findOne;
    const originalTestFindById = MockTest.findById;
    const originalEventFind = ProctoringEvent.find;
    const originalEpisodeDeleteMany = ProctoringEpisode.deleteMany;
    const originalEpisodeInsertMany = ProctoringEpisode.insertMany;

    let deleteCallCount = 0;
    let insertCallCount = 0;

    const makeQueryable = (doc) => {
      const p = Promise.resolve(doc);
      p.lean = async () => doc;
      return p;
    };

    MockTestSession.findById = () =>
      makeQueryable({
        _id: 'session_owner_101',
        user: 'student_123',
        mockTest: 'test_template_1',
        answers: [],
      });

    ProctoringSession.findOne = () =>
      makeQueryable({
        _id: 'proc_session_202',
        mockTestSession: 'session_owner_101',
        user: 'student_123',
      });

    MockTest.findById = () =>
      makeQueryable({
        _id: 'test_template_1',
        questions: [],
      });

    ProctoringEvent.find = () => ({
      sort: () => ({
        lean: async () => [
          {
            _id: 'e1',
            type: 'FOCUS_LOST',
            timestamp: new Date(baseDate.getTime() + 1000),
          },
          {
            _id: 'e2',
            type: 'PAGE_HIDDEN',
            timestamp: new Date(baseDate.getTime() + 2000),
          },
        ],
      }),
    });

    ProctoringEpisode.deleteMany = async () => {
      deleteCallCount++;
      return { deletedCount: 1 };
    };

    ProctoringEpisode.insertMany = async (docs) => {
      insertCallCount++;
      return docs.map((d, i) => ({ _id: `ep_${i}`, ...d }));
    };

    try {
      const req = {
        user: { id: 'student_123' },
        params: { sessionId: 'session_owner_101' },
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

      // First call
      await getProctoringCorrelations(req, res, (err) => {
        if (err) throw err;
      });

      assert.equal(respStatus, 200);
      assert.equal(respBody.success, true);
      assert.equal(respBody.totalEpisodes, 1);
      assert.equal(respBody.episodes[0].relationships.length, 1);
      assert.equal(respBody.episodes[0].relationships[0].type, 'FOCUS_VISIBILITY_ALIGNMENT');

      // Second call (verify idempotency: replaces existing episodes cleanly)
      await getProctoringCorrelations(req, res, (err) => {
        if (err) throw err;
      });

      assert.equal(respStatus, 200);
      assert.equal(deleteCallCount, 2, 'Should delete prior episodes before regenerating');
      assert.equal(insertCallCount, 2, 'Should insert fresh deterministic episodes');
    } finally {
      MockTestSession.findById = originalMockFindById;
      ProctoringSession.findOne = originalProcFindOne;
      MockTest.findById = originalTestFindById;
      ProctoringEvent.find = originalEventFind;
      ProctoringEpisode.deleteMany = originalEpisodeDeleteMany;
      ProctoringEpisode.insertMany = originalEpisodeInsertMany;
    }
  });

  // ─── 25. Cross-Session Isolation: foreign events never enter ───
  it('25. Cross-session isolation: query exclusively retrieves events for proctoringSession', async () => {
    let queriedFilter = null;
    const originalEventFind = ProctoringEvent.find;

    const makeQueryable = (doc) => {
      const p = Promise.resolve(doc);
      p.lean = async () => doc;
      return p;
    };

    ProctoringEvent.find = (filter) => {
      queriedFilter = filter;
      return {
        sort: () => ({
          lean: async () => [],
        }),
      };
    };

    const originalMockFindById = MockTestSession.findById;
    const originalProcFindOne = ProctoringSession.findOne;
    const originalTestFindById = MockTest.findById;
    const originalEpisodeDeleteMany = ProctoringEpisode.deleteMany;

    MockTestSession.findById = () =>
      makeQueryable({
        _id: 'session_target',
        user: 'user_target',
        mockTest: 'test_1',
      });

    ProctoringSession.findOne = () =>
      makeQueryable({
        _id: 'proc_session_target',
        mockTestSession: 'session_target',
        user: 'user_target',
      });

    MockTest.findById = () => makeQueryable({ _id: 'test_1', questions: [] });

    ProctoringEpisode.deleteMany = async () => ({ deletedCount: 0 });

    try {
      await syncSessionEpisodes('session_target');
      assert.ok(queriedFilter);
      assert.equal(queriedFilter.proctoringSession, 'proc_session_target');
    } finally {
      ProctoringEvent.find = originalEventFind;
      MockTestSession.findById = originalMockFindById;
      ProctoringSession.findOne = originalProcFindOne;
      MockTest.findById = originalTestFindById;
      ProctoringEpisode.deleteMany = originalEpisodeDeleteMany;
    }
  });
});
