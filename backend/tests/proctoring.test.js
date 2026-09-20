const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const MockTestSession = require('../models/MockTestSession');
const ProctoringSession = require('../models/ProctoringSession');
const { ProctoringEvent, ALLOWED_EVENT_TYPES, EVENT_SOURCES } = require('../models/ProctoringEvent');
const {
  startProctoring,
  recordProctoringEvent,
  proctoringHeartbeat,
  stopProctoring,
  getProctoringTimeline,
} = require('../controllers/proctoringController');
const { protect } = require('../middleware/authMiddleware');

describe('Foundational Proctoring Telemetry Suite (Phase 2)', () => {
  const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_12345';
  process.env.JWT_SECRET = JWT_SECRET;

  // ─── 1. Schema & Indexes ──────────────────────────────────────
  it('1. ProctoringSession and ProctoringEvent schemas enforce 1-to-1 relationship and required indexes', () => {
    // Verify ProctoringSession has unique index on mockTestSession
    const sessionIndexes = ProctoringSession.schema.indexes();
    const hasMockSessionIndex = sessionIndexes.some(
      (idx) => idx[0] && idx[0].mockTestSession === 1
    );
    assert.ok(hasMockSessionIndex, 'ProctoringSession must index mockTestSession for fast lookup');

    // Verify ProctoringEvent compound indexes
    const eventIndexes = ProctoringEvent.schema.indexes();
    const hasProcSessionTimeIndex = eventIndexes.some(
      (idx) => idx[0] && idx[0].proctoringSession === 1 && idx[0].timestamp === 1
    );
    assert.ok(hasProcSessionTimeIndex, 'ProctoringEvent must index { proctoringSession: 1, timestamp: 1 }');

    // Verify timestamp field in ProctoringEvent is immutable
    const timestampField = ProctoringEvent.schema.path('timestamp');
    assert.ok(timestampField.options.immutable, 'ProctoringEvent timestamp must be immutable');
  });

  // ─── 2. Unauthenticated Access Rejection ──────────────────────
  it('2. protect middleware rejects unauthenticated proctoring requests with 401', async () => {
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

  // ─── 3. Start Proctoring Session ──────────────────────────────
  it('3. startProctoring creates ProctoringSession linked to MockTestSession and emits PROCTORING_STARTED', async () => {
    let mockSessionSaved = false;
    let createdEvent = null;
    let createdProcSession = null;

    const mockSession = {
      _id: 'mock_session_101',
      user: 'student_user_1',
      status: 'in_progress',
      expiresAt: new Date(Date.now() + 3600 * 1000),
      proctoringSession: null,
      save: async function () {
        mockSessionSaved = true;
      },
    };

    const originalMockFindById = MockTestSession.findById;
    const originalProcFindOne = ProctoringSession.findOne;
    const originalProcCreate = ProctoringSession.create;
    const originalEventCreate = ProctoringEvent.create;

    MockTestSession.findById = async () => mockSession;
    ProctoringSession.findOne = async () => null; // No existing session
    ProctoringSession.create = async (doc) => {
      createdProcSession = { _id: 'proc_session_202', ...doc };
      return createdProcSession;
    };
    ProctoringEvent.create = async (doc) => {
      createdEvent = { _id: 'event_001', ...doc };
      return createdEvent;
    };

    try {
      const req = {
        user: { id: 'student_user_1' },
        params: { sessionId: 'mock_session_101' },
        body: {
          cameraState: 'active',
          microphoneState: 'active',
          screenShareState: 'inactive',
          fullscreenState: 'active',
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

      await startProctoring(req, res, () => {});

      assert.equal(respStatus, 201);
      assert.equal(respBody.success, true);
      assert.equal(createdProcSession.status, 'active');
      assert.equal(createdProcSession.cameraState, 'active');
      assert.equal(createdProcSession.microphoneState, 'active');
      assert.equal(mockSessionSaved, true);
      assert.equal(mockSession.proctoringSession, 'proc_session_202', 'MockTestSession must link to ProctoringSession');
      assert.equal(createdEvent.type, 'PROCTORING_STARTED');
      assert.equal(createdEvent.source, 'session');
    } finally {
      MockTestSession.findById = originalMockFindById;
      ProctoringSession.findOne = originalProcFindOne;
      ProctoringSession.create = originalProcCreate;
      ProctoringEvent.create = originalEventCreate;
    }
  });

  // ─── 4. Prevent Duplicate Proctoring Sessions ─────────────────
  it('4. startProctoring returns existing active session on repeat/refresh calls without creating duplicates', async () => {
    const existingProcSession = {
      _id: 'proc_session_existing',
      mockTestSession: 'mock_session_101',
      user: 'student_user_1',
      status: 'active',
      startedAt: new Date(Date.now() - 60000),
      lastHeartbeatAt: new Date(),
    };

    const mockSession = {
      _id: 'mock_session_101',
      user: 'student_user_1',
      status: 'in_progress',
      expiresAt: new Date(Date.now() + 3600 * 1000),
      proctoringSession: 'proc_session_existing',
      save: async () => {},
    };

    let createCalled = false;
    const originalMockFindById = MockTestSession.findById;
    const originalProcFindOne = ProctoringSession.findOne;
    const originalProcCreate = ProctoringSession.create;

    MockTestSession.findById = async () => mockSession;
    ProctoringSession.findOne = async () => existingProcSession;
    ProctoringSession.create = async () => {
      createCalled = true;
    };

    try {
      const req = {
        user: { id: 'student_user_1' },
        params: { sessionId: 'mock_session_101' },
        body: {},
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

      await startProctoring(req, res, () => {});

      assert.equal(respStatus, 200, 'Must return 200 when resuming existing session');
      assert.equal(createCalled, false, 'Must NOT create duplicate ProctoringSession');
      assert.equal(respBody.proctoringSession._id, 'proc_session_existing');
      assert.match(respBody.message, /resumed/i);
    } finally {
      MockTestSession.findById = originalMockFindById;
      ProctoringSession.findOne = originalProcFindOne;
      ProctoringSession.create = originalProcCreate;
    }
  });

  // ─── 5. Cross-User Authorization Rejection ────────────────────
  it('5. startProctoring, recordProctoringEvent, and stopProctoring reject cross-user access with 403', async () => {
    const ownerId = 'legit_owner_user';
    const attackerId = 'unauthorized_attacker_user';

    const mockSession = {
      _id: 'mock_session_protected',
      user: ownerId,
      status: 'in_progress',
      expiresAt: new Date(Date.now() + 3600 * 1000),
    };

    const originalMockFindById = MockTestSession.findById;
    MockTestSession.findById = async () => mockSession;

    try {
      // 1. Attacker attempts start
      let statusStart = null;
      let errStart = null;
      await startProctoring(
        { user: { id: attackerId }, params: { sessionId: 'mock_session_protected' }, body: {} },
        { status: (c) => { statusStart = c; return { json: () => {} }; } },
        (e) => { errStart = e; }
      );
      assert.equal(statusStart, 403);
      assert.match(errStart.message, /not authorized/i);

      // 2. Attacker attempts record event
      let statusEvent = null;
      let errEvent = null;
      await recordProctoringEvent(
        { user: { id: attackerId }, params: { sessionId: 'mock_session_protected' }, body: { type: 'FOCUS_LOST' } },
        { status: (c) => { statusEvent = c; return { json: () => {} }; } },
        (e) => { errEvent = e; }
      );
      assert.equal(statusEvent, 403);
      assert.match(errEvent.message, /not authorized/i);

      // 3. Attacker attempts stop
      let statusStop = null;
      let errStop = null;
      await stopProctoring(
        { user: { id: attackerId }, params: { sessionId: 'mock_session_protected' }, body: {} },
        { status: (c) => { statusStop = c; return { json: () => {} }; } },
        (e) => { errStop = e; }
      );
      assert.equal(statusStop, 403);
      assert.match(errStop.message, /not authorized/i);
    } finally {
      MockTestSession.findById = originalMockFindById;
    }
  });

  // ─── 6. Valid Event Creation & State Update ───────────────────
  it('6. recordProctoringEvent logs valid event and updates ProctoringSession state', async () => {
    const mockSession = {
      _id: 'mock_sess_1',
      user: 'user_1',
      status: 'in_progress',
      expiresAt: new Date(Date.now() + 3600000),
    };

    let procSessionSaved = false;
    const procSession = {
      _id: 'proc_sess_1',
      mockTestSession: 'mock_sess_1',
      user: 'user_1',
      status: 'active',
      fullscreenState: 'inactive',
      lastHeartbeatAt: new Date(),
      save: async function () {
        procSessionSaved = true;
      },
    };

    let loggedEvent = null;
    const originalMockFindById = MockTestSession.findById;
    const originalProcFindOne = ProctoringSession.findOne;
    const originalEventCreate = ProctoringEvent.create;

    MockTestSession.findById = async () => mockSession;
    ProctoringSession.findOne = async () => procSession;
    ProctoringEvent.create = async (doc) => {
      loggedEvent = { _id: 'ev_123', ...doc };
      return loggedEvent;
    };

    try {
      const req = {
        user: { id: 'user_1' },
        params: { sessionId: 'mock_sess_1' },
        body: {
          type: 'FULLSCREEN_ENTERED',
          source: 'browser',
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

      await recordProctoringEvent(req, res, () => {});

      assert.equal(respStatus, 201);
      assert.equal(respBody.event.type, 'FULLSCREEN_ENTERED');
      assert.equal(loggedEvent.type, 'FULLSCREEN_ENTERED');
      assert.equal(procSession.fullscreenState, 'active', 'ProctoringSession state must update to active');
      assert.equal(procSessionSaved, true);
    } finally {
      MockTestSession.findById = originalMockFindById;
      ProctoringSession.findOne = originalProcFindOne;
      ProctoringEvent.create = originalEventCreate;
    }
  });

  // ─── 7. Rejection of Invalid / AI Event Types ─────────────────
  it('7. recordProctoringEvent rejects unallowed/AI event types (e.g. PHONE_DETECTED, FACE_MISSING) with 400', async () => {
    const invalidTypes = ['PHONE_DETECTED', 'FACE_MISSING', 'CHEATING_SUSPECTED', 'GAZE_AWAY', 'UNKNOWN_CUSTOM_TYPE'];

    for (const badType of invalidTypes) {
      assert.equal(ALLOWED_EVENT_TYPES.includes(badType), false, `${badType} must NOT be in Phase 2 event types`);

      let statusCode = null;
      let errorThrown = null;
      const req = {
        params: { sessionId: 'any_session' },
        body: { type: badType },
      };
      const res = {
        status: (code) => {
          statusCode = code;
          return res;
        },
      };

      await recordProctoringEvent(req, res, (err) => {
        errorThrown = err;
      });

      assert.equal(statusCode, 400);
      assert.match(errorThrown.message, /invalid proctoring event type/i);
    }
  });

  // ─── 8. Server-Authoritative Identity & Timestamp ─────────────
  it('8. recordProctoringEvent ignores client-supplied user ID, proctoringSession ID, and timestamp', async () => {
    const mockSession = {
      _id: 'mock_sess_real',
      user: 'user_real',
      status: 'in_progress',
      expiresAt: new Date(Date.now() + 3600000),
    };

    const procSession = {
      _id: 'proc_sess_real',
      mockTestSession: 'mock_sess_real',
      user: 'user_real',
      status: 'active',
      save: async () => {},
    };

    let loggedDoc = null;
    const originalMockFindById = MockTestSession.findById;
    const originalProcFindOne = ProctoringSession.findOne;
    const originalEventCreate = ProctoringEvent.create;

    MockTestSession.findById = async () => mockSession;
    ProctoringSession.findOne = async () => procSession;
    ProctoringEvent.create = async (doc) => {
      loggedDoc = doc;
      return { _id: 'ev_1', ...doc };
    };

    try {
      const fakePastTimestamp = new Date('2020-01-01T00:00:00Z');
      const req = {
        user: { id: 'user_real' },
        params: { sessionId: 'mock_sess_real' },
        body: {
          type: 'FOCUS_LOST',
          // Malicious client tamper attempt
          user: 'attacker_hacked_user',
          proctoringSession: 'attacker_fake_session',
          mockTestSession: 'attacker_fake_mock_session',
          timestamp: fakePastTimestamp,
        },
      };

      const res = {
        status: () => res,
        json: () => {},
      };

      await recordProctoringEvent(req, res, () => {});

      assert.equal(loggedDoc.user, 'user_real', 'User must be derived from authenticated req.user');
      assert.equal(loggedDoc.proctoringSession, 'proc_sess_real', 'ProctoringSession must be server-derived');
      assert.equal(loggedDoc.mockTestSession, 'mock_sess_real', 'MockTestSession must be server-derived');
      assert.notEqual(loggedDoc.timestamp.getTime(), fakePastTimestamp.getTime(), 'Server must assign authoritative timestamp');
    } finally {
      MockTestSession.findById = originalMockFindById;
      ProctoringSession.findOne = originalProcFindOne;
      ProctoringEvent.create = originalEventCreate;
    }
  });

  // ─── 9. Proctoring Heartbeat Updates Liveness ─────────────────
  it('9. proctoringHeartbeat updates lastHeartbeatAt without creating redundant event records', async () => {
    let mockSaved = false;
    let procSaved = false;
    let eventCreated = false;

    const mockSession = {
      _id: 'mock_hb_1',
      user: 'user_1',
      status: 'in_progress',
      expiresAt: new Date(Date.now() + 1800000),
      lastHeartbeatAt: new Date(Date.now() - 60000),
      save: async function () { mockSaved = true; },
    };

    const procSession = {
      _id: 'proc_hb_1',
      mockTestSession: 'mock_hb_1',
      user: 'user_1',
      status: 'active',
      lastHeartbeatAt: new Date(Date.now() - 60000),
      save: async function () { procSaved = true; },
    };

    const originalMockFindById = MockTestSession.findById;
    const originalProcFindOne = ProctoringSession.findOne;
    const originalEventCreate = ProctoringEvent.create;

    MockTestSession.findById = async () => mockSession;
    ProctoringSession.findOne = async () => procSession;
    ProctoringEvent.create = async () => { eventCreated = true; };

    try {
      const req = {
        user: { id: 'user_1' },
        params: { sessionId: 'mock_hb_1' },
        body: { cameraState: 'active', microphoneState: 'active' },
      };

      let respBody = null;
      const res = {
        status: () => res,
        json: (p) => { respBody = p; return res; },
      };

      await proctoringHeartbeat(req, res, () => {});

      assert.equal(respBody.success, true);
      assert.equal(mockSaved, true);
      assert.equal(procSaved, true);
      assert.equal(eventCreated, false, 'Heartbeat MUST NOT create redundant ProctoringEvent rows');
      assert.ok(respBody.remainingSeconds > 1750 && respBody.remainingSeconds <= 1800);
    } finally {
      MockTestSession.findById = originalMockFindById;
      ProctoringSession.findOne = originalProcFindOne;
      ProctoringEvent.create = originalEventCreate;
    }
  });

  // ─── 10. Stop Proctoring Lifecycle ────────────────────────────
  it('10. stopProctoring marks session completed, sets endedAt, and logs PROCTORING_STOPPED', async () => {
    const mockSession = {
      _id: 'mock_stop_1',
      user: 'user_1',
      status: 'completed',
    };

    let procSaved = false;
    let procEndedAt = null;
    const procSession = {
      _id: 'proc_stop_1',
      mockTestSession: 'mock_stop_1',
      user: 'user_1',
      status: 'active',
      save: async function () {
        procSaved = true;
        procEndedAt = this.endedAt;
      },
    };

    let stoppedEvent = null;
    const originalMockFindById = MockTestSession.findById;
    const originalProcFindOne = ProctoringSession.findOne;
    const originalEventCreate = ProctoringEvent.create;

    MockTestSession.findById = async () => mockSession;
    ProctoringSession.findOne = async () => procSession;
    ProctoringEvent.create = async (doc) => {
      stoppedEvent = doc;
      return { _id: 'ev_stop', ...doc };
    };

    try {
      const req = {
        user: { id: 'user_1' },
        params: { sessionId: 'mock_stop_1' },
        body: { reason: 'exam_submitted' },
      };

      let respStatus = null;
      const res = {
        status: (code) => {
          respStatus = code;
          return res;
        },
        json: () => res,
      };

      await stopProctoring(req, res, () => {});

      assert.equal(respStatus, 200);
      assert.equal(procSession.status, 'completed');
      assert.ok(procEndedAt);
      assert.equal(procSaved, true);
      assert.equal(stoppedEvent.type, 'PROCTORING_STOPPED');
      assert.equal(stoppedEvent.metadata.reason, 'exam_submitted');
    } finally {
      MockTestSession.findById = originalMockFindById;
      ProctoringSession.findOne = originalProcFindOne;
      ProctoringEvent.create = originalEventCreate;
    }
  });

  // ─── 11. Rejects Events on Expired/Completed Session ──────────
  it('11. recordProctoringEvent rejects events when mock test session is expired with 400', async () => {
    const mockSession = {
      _id: 'mock_exp_1',
      user: 'user_1',
      status: 'in_progress',
      expiresAt: new Date(Date.now() - 5000), // Expired 5 seconds ago
      save: async () => {},
    };

    const originalMockFindById = MockTestSession.findById;
    MockTestSession.findById = async () => mockSession;

    try {
      const req = {
        user: { id: 'user_1' },
        params: { sessionId: 'mock_exp_1' },
        body: { type: 'PAGE_HIDDEN' },
      };

      let statusCode = null;
      let errorThrown = null;
      const res = {
        status: (code) => {
          statusCode = code;
          return res;
        },
      };

      await recordProctoringEvent(req, res, (err) => {
        errorThrown = err;
      });

      assert.equal(statusCode, 400);
      assert.match(errorThrown.message, /expired/i);
    } finally {
      MockTestSession.findById = originalMockFindById;
    }
  });

  // ─── 12. Timeline Retrieval ───────────────────────────────────
  it('12. getProctoringTimeline returns chronological telemetry events for authorized owner', async () => {
    const mockSession = {
      _id: 'mock_tl_1',
      user: 'user_1',
    };

    const procSession = {
      _id: 'proc_tl_1',
      mockTestSession: 'mock_tl_1',
      user: 'user_1',
      status: 'completed',
      startedAt: new Date(Date.now() - 3600000),
      endedAt: new Date(),
      lastHeartbeatAt: new Date(),
      cameraState: 'inactive',
      microphoneState: 'inactive',
      screenShareState: 'inactive',
      fullscreenState: 'inactive',
      visibilityState: 'visible',
    };

    const mockEvents = [
      { type: 'PROCTORING_STARTED', source: 'session', timestamp: new Date(Date.now() - 3600000), duration: 0 },
      { type: 'FOCUS_LOST', source: 'browser', timestamp: new Date(Date.now() - 2000000), duration: 0 },
      { type: 'FOCUS_REGAINED', source: 'browser', timestamp: new Date(Date.now() - 1980000), duration: 20000 },
      { type: 'PROCTORING_STOPPED', source: 'session', timestamp: new Date(), duration: 0 },
    ];

    const originalMockFindById = MockTestSession.findById;
    const originalProcFindOne = ProctoringSession.findOne;
    const originalEventFind = ProctoringEvent.find;

    MockTestSession.findById = async () => mockSession;
    ProctoringSession.findOne = async () => procSession;
    ProctoringEvent.find = () => ({
      select: () => ({
        sort: () => ({
          lean: async () => mockEvents,
        }),
      }),
    });

    try {
      const req = {
        user: { id: 'user_1' },
        params: { sessionId: 'mock_tl_1' },
      };

      let respBody = null;
      const res = {
        status: () => res,
        json: (p) => { respBody = p; return res; },
      };

      await getProctoringTimeline(req, res, () => {});

      assert.equal(respBody.success, true);
      assert.equal(respBody.totalEvents, 4);
      assert.equal(respBody.events[0].type, 'PROCTORING_STARTED');
      assert.equal(respBody.events[2].type, 'FOCUS_REGAINED');
      assert.equal(respBody.events[2].duration, 20000);
    } finally {
      MockTestSession.findById = originalMockFindById;
      ProctoringSession.findOne = originalProcFindOne;
      ProctoringEvent.find = originalEventFind;
    }
  });

  // ─── 13. Phase 3 CV Events & Webcam Source Acceptance ─────────
  it('13. recordProctoringEvent accepts Phase 3 CV events with source "webcam"', async () => {
    const mockSession = {
      _id: 'mock_sess_cv',
      user: 'user_cv',
      status: 'in_progress',
      expiresAt: new Date(Date.now() + 3600000),
    };
    const procSession = {
      _id: 'proc_sess_cv',
      mockTestSession: 'mock_sess_cv',
      user: 'user_cv',
      status: 'active',
      lastHeartbeatAt: new Date(),
      save: async () => {},
    };

    const originalMockFindById = MockTestSession.findById;
    const originalProcFindOne = ProctoringSession.findOne;
    const originalEventCreate = ProctoringEvent.create;

    MockTestSession.findById = async () => mockSession;
    ProctoringSession.findOne = async () => procSession;

    const cvTypes = ['FACE_PRESENT', 'FACE_ABSENT', 'MULTIPLE_FACES', 'HEAD_POSE_DEVIATION'];

    try {
      for (const cvType of cvTypes) {
        let loggedEvent = null;
        ProctoringEvent.create = async (doc) => {
          loggedEvent = { _id: 'ev_' + cvType, ...doc };
          return loggedEvent;
        };

        let respStatus = null;
        let respBody = null;
        const req = {
          user: { id: 'user_cv' },
          params: { sessionId: 'mock_sess_cv' },
          body: {
            type: cvType,
            source: 'webcam',
            duration: 1200,
            metadata: { confirmedDurationMs: 1200 },
          },
        };
        const res = {
          status: (c) => { respStatus = c; return res; },
          json: (b) => { respBody = b; return res; },
        };

        await recordProctoringEvent(req, res, () => {});

        assert.equal(respStatus, 201);
        assert.equal(respBody.event.type, cvType);
        assert.equal(respBody.event.source, 'webcam');
        assert.equal(loggedEvent.type, cvType);
        assert.equal(loggedEvent.source, 'webcam');
        assert.equal(loggedEvent.duration, 1200);
      }
    } finally {
      MockTestSession.findById = originalMockFindById;
      ProctoringSession.findOne = originalProcFindOne;
      ProctoringEvent.create = originalEventCreate;
    }
  });

  // ─── 14. Rejection of Oversized Metadata (> 4KB) ──────────────
  it('14. recordProctoringEvent rejects metadata exceeding 4096 bytes with 400 Bad Request', async () => {
    const hugeString = 'x'.repeat(4100);
    let statusCode = null;
    let errorThrown = null;

    const req = {
      user: { id: 'user_cv' },
      params: { sessionId: 'any_session' },
      body: {
        type: 'FACE_PRESENT',
        source: 'webcam',
        metadata: { payload: hugeString },
      },
    };
    const res = {
      status: (c) => { statusCode = c; return res; },
      json: () => res,
    };

    await recordProctoringEvent(req, res, (err) => {
      errorThrown = err;
    });

    assert.equal(statusCode, 400);
    assert.match(errorThrown.message, /exceeds maximum allowed size of 4KB/i);
  });

  // ─── 15. Rejection of Raw Image / Base64 Payloads in Metadata ──
  it('15. recordProctoringEvent rejects metadata containing raw image or base64 data URLs with 400', async () => {
    const forbiddenPayloads = [
      { image: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD...' },
      { frame: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB...' },
      { snapshot: 'some_prefix;base64,AQIDBA==' },
    ];

    for (const badMeta of forbiddenPayloads) {
      let statusCode = null;
      let errorThrown = null;

      const req = {
        user: { id: 'user_cv' },
        params: { sessionId: 'any_session' },
        body: {
          type: 'FACE_PRESENT',
          source: 'webcam',
          metadata: badMeta,
        },
      };
      const res = {
        status: (c) => { statusCode = c; return res; },
        json: () => res,
      };

      await recordProctoringEvent(req, res, (err) => {
        errorThrown = err;
      });

      assert.equal(statusCode, 400);
      assert.match(errorThrown.message, /Image and binary payloads are not permitted/i);
    }
  });

});
