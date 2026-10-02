const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// Import frontend mock test module
const mockTestModule = require('../../frontend/scripts/mockTest.js');
const {
  mockState,
  openReadiness,
  requestProctoringPermissions,
  startExamWithProctoring,
  renderReadinessScreen,
  backToInstructions,
  backToList,
  confirmSubmit,
  teardownMediaAndTelemetry,
  sendProctoringEvent,
} = mockTestModule;

// Helper to create mock MediaStreamTrack
function createMockTrack(kind = 'video', readyState = 'live', settings = {}) {
  const listeners = {};
  return {
    kind,
    readyState,
    getSettings: () => ({
      width: settings.width || (kind === 'video' ? 640 : undefined),
      height: settings.height || (kind === 'video' ? 480 : undefined),
      frameRate: settings.frameRate || (kind === 'video' ? 30 : undefined),
      displaySurface: settings.displaySurface || (kind === 'video' ? 'monitor' : undefined),
    }),
    stop() {
      this.readyState = 'ended';
      // In real browsers, calling track.stop() triggers onended if listener is still attached
      if (typeof this.onended === 'function') {
        this.onended();
      }
    },
    onended: null,
  };
}

// Helper to create mock MediaStream
function createMockStream(tracks = []) {
  return {
    getTracks: () => tracks,
    getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
    getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
  };
}

describe('Frontend Readiness Gate & Media Lifecycle Telemetry (Phase 4A)', () => {
  let mockContainer;
  let apiFetchCalls = [];
  let mockApiResponses = new Map();

  beforeEach(() => {
    // Reset mockState
    mockState.screen = 'list';
    mockState.selectedMockTest = {
      _id: 'test_phase4a',
      slug: 'jee-main-phase4a',
      title: 'JEE Main Practice Mock Test 2026',
      duration: 180,
      totalQuestions: 75,
      sections: [{ name: 'physics', totalQuestions: 25 }],
    };
    mockState.activeSessionInfo = null;
    mockState.sessionId = null;
    mockState.sessionStatus = null;
    mockState.startedAt = null;
    mockState.expiresAt = null;
    mockState.questions = [];
    mockState.answers.clear();
    mockState.visitedQuestions.clear();
    mockState.currentQIndex = 0;
    mockState.currentSection = 'physics';
    mockState.timerInterval = null;
    mockState.heartbeatInterval = null;
    mockState.remainingSeconds = 0;
    mockState.showSubmitModal = false;
    mockState.submitting = false;
    mockState.loading = false;
    mockState.errorMessage = '';
    mockState.result = null;
    mockState.review = [];

    // Reset Proctoring & Media state
    mockState.procSessionId = null;
    mockState.proctoringState = {
      cameraState: 'inactive',
      microphoneState: 'inactive',
      screenShareState: 'inactive',
      fullscreenState: 'inactive',
      visibilityState: 'visible',
    };
    mockState.readinessCapabilities = null;
    mockState.readinessState = {
      camera: 'idle',
      screen: 'idle',
      faceDetection: 'idle',
      overallReady: false,
      errorMessage: '',
      errorType: '',
    };
    mockState.cameraStartedEmitted = false;
    mockState.screenStartedEmitted = false;
    mockState.cameraStream = null;
    mockState.screenStream = null;
    mockState.cvAnalyzer = null;
    mockState.screenMonitor = null;
    mockState.activeEventListeners = [];

    // Reset Tracking Mocks
    apiFetchCalls = [];
    mockApiResponses.clear();

    // Mock DOM
    mockContainer = {
      innerHTML: '',
      appendChild: () => {},
    };

    global.document = {
      getElementById: (id) => {
        if (id === 'mock-test-container') return mockContainer;
        if (id === 'webcam-preview-el') return { srcObject: null, play: async () => {} };
        if (id === 'exam-webcam-video') return { srcObject: null, play: async () => {} };
        if (id === 'proctoring-pill') return { innerHTML: '' };
        return null;
      },
      createElement: () => ({
        innerHTML: '',
        firstElementChild: {},
      }),
      addEventListener: () => {},
      removeEventListener: () => {},
      hidden: false,
      fullscreenElement: null,
      fullscreenEnabled: true,
      documentElement: {
        requestFullscreen: async () => {},
      },
    };

    global.window = {
      location: {
        pathname: '/mock-test.html',
        search: '',
      },
      history: {
        replaceState: () => {},
      },
      isSecureContext: true,
      addEventListener: () => {},
      removeEventListener: () => {},
      alert: () => {},
    };

    // Default Navigator Mocks using Object.defineProperty for Node 24 compatibility
    function setMockNavigator(custom = {}) {
      const mockNav = {
        mediaDevices: {
          getUserMedia: async (constraints) => {
            const vTrack = createMockTrack('video', 'live', { width: 640, height: 480, frameRate: 30 });
            const tracks = [vTrack];
            if (constraints && constraints.audio) {
              tracks.push(createMockTrack('audio', 'live'));
            }
            return createMockStream(tracks);
          },
          getDisplayMedia: async () => {
            const sTrack = createMockTrack('video', 'live', { displaySurface: 'monitor', width: 1920, height: 1080 });
            return createMockStream([sTrack]);
          },
          ...custom,
        },
      };
      Object.defineProperty(globalThis, 'navigator', {
        value: mockNav,
        configurable: true,
        writable: true,
      });
    }

    setMockNavigator();
    global.setMockNavigator = setMockNavigator;

    // Global apiFetch Mock
    global.apiFetch = async (endpoint, options = {}) => {
      apiFetchCalls.push({ endpoint, options });
      if (mockApiResponses.has(endpoint)) {
        return mockApiResponses.get(endpoint);
      }
      if (endpoint.includes('/start')) {
        return {
          ok: true,
          data: {
            sessionId: 'sess_phase4a_123',
            status: 'in_progress',
            startedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 180 * 60 * 1000).toISOString(),
            mockTest: mockState.selectedMockTest,
            questions: [{ id: 'q1', section: 'physics', options: ['A', 'B', 'C', 'D'] }],
            proctoringSession: { _id: 'proc_phase4a_456' },
          },
        };
      }
      if (endpoint.includes('/proctoring/event')) {
        return {
          ok: true,
          data: { success: true, event: { id: 'evt_1', type: options.body?.type } },
        };
      }
      return { ok: true, data: { success: true } };
    };
  });

  afterEach(() => {
    teardownMediaAndTelemetry();
  });

  // ─── Test 1: Initial readiness screen state ─────────────────────────────────
  it('1. Initial readiness screen disables "Begin Examination" and renders permission required chips', () => {
    openReadiness('jee-main-phase4a');

    assert.equal(mockState.screen, 'readiness');
    assert.equal(mockState.readinessState.overallReady, false);
    assert.equal(mockState.readinessState.camera, 'idle');
    assert.equal(mockState.readinessState.screen, 'idle');

    const html = renderReadinessScreen();

    // Button MUST be disabled
    assert.match(html, /id="btn-begin-proctored-exam"[^>]*disabled/);
    // Mandatory permission chips must indicate required status
    assert.match(html, /Webcam Stream \(Mandatory\)/);
    assert.match(html, /Screen Sharing \(Mandatory\)/);
    assert.match(html, /Permission Required/);
    assert.doesNotMatch(html, /Ready to Begin/);
  });

  // ─── Test 2: Readiness gate enforcement prevents launching exam ─────────────
  it('2. startExamWithProctoring blocks exam launch when overallReady is false', async () => {
    openReadiness('jee-main-phase4a');
    assert.equal(mockState.readinessState.overallReady, false);

    // Candidate clicks start exam without granting permissions
    await startExamWithProctoring('jee-main-phase4a');

    // Must NOT transition to exam screen
    assert.equal(mockState.screen, 'readiness');
    assert.equal(mockState.sessionId, null);
    // Must set clear error message
    assert.match(mockState.readinessState.errorMessage, /Mandatory proctoring permissions must be granted/i);

    // Zero API calls should have been made to start the exam
    const startCalls = apiFetchCalls.filter((c) => c.endpoint.includes('/start'));
    assert.equal(startCalls.length, 0);
  });

  // ─── Test 3: Camera denial handling ─────────────────────────────────────────
  it('3. Camera permission denial flags camera error and keeps exam locked', async () => {
    openReadiness('jee-main-phase4a');

    // Simulate user denying webcam access
    global.setMockNavigator({
      getUserMedia: async () => {
        const err = new Error('Permission denied');
        err.name = 'NotAllowedError';
        throw err;
      },
    });

    await requestProctoringPermissions();

    assert.equal(mockState.readinessState.camera, 'error');
    assert.equal(mockState.readinessState.overallReady, false);
    assert.equal(mockState.cameraStream, null);
    assert.match(mockState.readinessState.errorMessage, /Webcam access failed/i);

    const html = renderReadinessScreen();
    assert.match(html, /id="btn-begin-proctored-exam"[^>]*disabled/);
    assert.match(html, /readiness-status-banner error/);
    assert.match(html, /CAMERA ERROR/);
  });

  // ─── Test 4: Screen share denial handling ───────────────────────────────────
  it('4. Screen share denial flags screen error and keeps exam locked', async () => {
    openReadiness('jee-main-phase4a');

    // Camera succeeds but screen share is denied/cancelled
    global.setMockNavigator({
      getDisplayMedia: async () => {
        const err = new Error('User cancelled screen sharing prompt');
        err.name = 'NotAllowedError';
        throw err;
      },
    });

    await requestProctoringPermissions();

    assert.equal(mockState.readinessState.camera, 'ready');
    assert.equal(mockState.readinessState.screen, 'error');
    assert.equal(mockState.readinessState.overallReady, false);
    assert.equal(mockState.screenStream, null);
    assert.match(mockState.readinessState.errorMessage, /Screen sharing failed/i);

    const html = renderReadinessScreen();
    assert.match(html, /id="btn-begin-proctored-exam"[^>]*disabled/);
    assert.match(html, /SCREEN ERROR/);
  });

  // ─── Test 5: Successful permission acquisition unlocks exam ─────────────────
  it('5. Granting camera and screen permissions activates streams and enables "Begin Examination"', async () => {
    openReadiness('jee-main-phase4a');

    await requestProctoringPermissions();

    assert.equal(mockState.readinessState.camera, 'ready');
    assert.equal(mockState.readinessState.screen, 'ready');
    assert.equal(mockState.readinessState.overallReady, true);
    assert.ok(mockState.cameraStream, 'Camera stream must be populated');
    assert.ok(mockState.screenStream, 'Screen stream must be populated');
    assert.equal(mockState.proctoringState.cameraState, 'active');
    assert.equal(mockState.proctoringState.screenShareState, 'active');

    const html = renderReadinessScreen();
    // Button must NOT be disabled
    assert.doesNotMatch(html, /id="btn-begin-proctored-exam"[^>]*disabled/);
    assert.match(html, /Ready to Begin/);
    assert.match(html, /readiness-status-banner success/);
  });

  // ─── Test 6: Invalidation if camera disconnects during preview ──────────────
  it('6. Camera disconnection during readiness preview revokes readiness and disables button', async () => {
    openReadiness('jee-main-phase4a');
    await requestProctoringPermissions();
    assert.equal(mockState.readinessState.overallReady, true);

    // Simulate camera track disconnection (e.g. webcam unplugged)
    const videoTrack = mockState.cameraStream.getVideoTracks()[0];
    assert.ok(typeof videoTrack.onended === 'function', 'track.onended must be registered');

    // Trigger track onended
    videoTrack.onended();

    assert.equal(mockState.readinessState.camera, 'error');
    assert.equal(mockState.readinessState.overallReady, false);
    assert.match(mockState.readinessState.errorMessage, /Webcam stream was stopped/i);

    const html = renderReadinessScreen();
    assert.match(html, /id="btn-begin-proctored-exam"[^>]*disabled/);
  });

  // ─── Test 7: Invalidation if screen share is stopped during preview ─────────
  it('7. Screen share stopped during readiness preview revokes readiness and disables button', async () => {
    openReadiness('jee-main-phase4a');
    await requestProctoringPermissions();
    assert.equal(mockState.readinessState.overallReady, true);

    // Simulate candidate clicking "Stop sharing" on the browser screen bar
    const screenTrack = mockState.screenStream.getVideoTracks()[0];
    assert.ok(typeof screenTrack.onended === 'function', 'screenTrack.onended must be registered');

    // Trigger track onended
    screenTrack.onended();

    assert.equal(mockState.readinessState.screen, 'error');
    assert.equal(mockState.readinessState.overallReady, false);
    assert.match(mockState.readinessState.errorMessage, /Screen sharing was stopped/i);

    const html = renderReadinessScreen();
    assert.match(html, /id="btn-begin-proctored-exam"[^>]*disabled/);
  });

  // ─── Test 8: Exam launch emits CAMERA_STARTED and SCREEN_SHARE_STARTED ──────
  it('8. startExamWithProctoring emits CAMERA_STARTED and SCREEN_SHARE_STARTED lifecycle telemetry exactly once', async () => {
    openReadiness('jee-main-phase4a');
    await requestProctoringPermissions();
    assert.equal(mockState.readinessState.overallReady, true);

    await startExamWithProctoring('jee-main-phase4a');

    assert.equal(mockState.screen, 'exam');
    assert.equal(mockState.sessionId, 'sess_phase4a_123');
    assert.equal(mockState.cameraStartedEmitted, true);
    assert.equal(mockState.screenStartedEmitted, true);

    // Inspect apiFetch calls for proctoring/event
    const eventCalls = apiFetchCalls.filter((c) => c.endpoint.includes('/proctoring/event'));

    const camStarted = eventCalls.find((c) => c.options.body?.type === 'CAMERA_STARTED');
    assert.ok(camStarted, 'CAMERA_STARTED event must have been sent');
    assert.equal(camStarted.options.body.source, 'media');
    assert.equal(camStarted.options.body.metadata.width, 640);
    assert.equal(camStarted.options.body.metadata.height, 480);
    assert.equal(camStarted.options.body.metadata.frameRate, 30);

    const screenStarted = eventCalls.find((c) => c.options.body?.type === 'SCREEN_SHARE_STARTED');
    assert.ok(screenStarted, 'SCREEN_SHARE_STARTED event must have been sent');
    assert.equal(screenStarted.options.body.source, 'screen');
    assert.equal(screenStarted.options.body.metadata.displaySurface, 'monitor');
    assert.equal(screenStarted.options.body.metadata.width, 1920);
    assert.equal(screenStarted.options.body.metadata.height, 1080);

    // Ensure proctoring/start was called with active states
    const startProcCall = apiFetchCalls.find((c) => c.endpoint.includes('/proctoring/start'));
    assert.ok(startProcCall, 'proctoring/start must be called');
    assert.equal(startProcCall.options.body.cameraState, 'active');
    assert.equal(startProcCall.options.body.screenShareState, 'active');
  });

  // ─── Test 9: Mid-exam track stoppage triggers STOPPED telemetry ─────────────
  it('9. Mid-exam camera and screen interruptions emit CAMERA_STOPPED and SCREEN_SHARE_STOPPED', async () => {
    openReadiness('jee-main-phase4a');
    await requestProctoringPermissions();
    await startExamWithProctoring('jee-main-phase4a');

    // Clear event history
    apiFetchCalls = [];

    // Simulate mid-exam camera drop
    const camTrack = mockState.cameraStream.getVideoTracks()[0];
    camTrack.onended();

    assert.equal(mockState.proctoringState.cameraState, 'inactive');
    const camStopCall = apiFetchCalls.find((c) => c.options.body?.type === 'CAMERA_STOPPED');
    assert.ok(camStopCall, 'CAMERA_STOPPED must be sent on mid-exam camera drop');
    assert.equal(camStopCall.options.body.source, 'media');

    // Simulate mid-exam screen share drop
    const scrTrack = mockState.screenStream.getVideoTracks()[0];
    scrTrack.onended();

    assert.equal(mockState.proctoringState.screenShareState, 'inactive');
    const scrStopCall = apiFetchCalls.find((c) => c.options.body?.type === 'SCREEN_SHARE_STOPPED');
    assert.ok(scrStopCall, 'SCREEN_SHARE_STOPPED must be sent on mid-exam screen drop');
    assert.equal(scrStopCall.options.body.source, 'screen');
  });

  // ─── Test 10: Submission teardown suppresses false STOPPED events ────────────
  it('10. Normal exam submission teardown cleanly stops tracks WITHOUT emitting false STOPPED events', async () => {
    openReadiness('jee-main-phase4a');
    await requestProctoringPermissions();
    await startExamWithProctoring('jee-main-phase4a');

    // Mock result endpoint for confirmSubmit
    mockApiResponses.set('/api/mock-tests/sess_phase4a_123/submit', {
      ok: true,
      data: {
        success: true,
        evaluationStatus: 'EVALUATED',
        result: { score: 120, maxMarks: 300 },
      },
    });
    mockApiResponses.set('/api/mock-tests/sess_phase4a_123/result', {
      ok: true,
      data: {
        success: true,
        evaluationStatus: 'EVALUATED',
        result: { score: 120, maxMarks: 300 },
        review: [],
        mockTest: mockState.selectedMockTest,
      },
    });

    apiFetchCalls = [];

    // Trigger normal candidate submission
    await confirmSubmit();

    // Verify teardown occurred
    assert.equal(mockState.cameraStream, null);
    assert.equal(mockState.screenStream, null);
    assert.equal(mockState.cameraStartedEmitted, false);
    assert.equal(mockState.screenStartedEmitted, false);

    // Verify NO false CAMERA_STOPPED or SCREEN_SHARE_STOPPED events were sent
    const stopEvents = apiFetchCalls.filter(
      (c) => c.options.body?.type === 'CAMERA_STOPPED' || c.options.body?.type === 'SCREEN_SHARE_STOPPED'
    );
    assert.equal(
      stopEvents.length,
      0,
      'Normal exam submit must NOT emit false CAMERA_STOPPED or SCREEN_SHARE_STOPPED'
    );
  });

  // ─── Test 11: Navigation back cleanly releases hardware preview tracks ───────
  it('11. Leaving readiness screen (backToInstructions / backToList) stops preview streams', async () => {
    openReadiness('jee-main-phase4a');
    await requestProctoringPermissions();
    assert.ok(mockState.cameraStream);
    assert.ok(mockState.screenStream);

    const camTrack = mockState.cameraStream.getVideoTracks()[0];
    const scrTrack = mockState.screenStream.getVideoTracks()[0];

    // Candidate clicks back to instructions
    backToInstructions('jee-main-phase4a');

    assert.equal(mockState.cameraStream, null);
    assert.equal(mockState.screenStream, null);
    assert.equal(camTrack.readyState, 'ended');
    assert.equal(scrTrack.readyState, 'ended');
    assert.equal(mockState.readinessState.overallReady, false);
  });
});
