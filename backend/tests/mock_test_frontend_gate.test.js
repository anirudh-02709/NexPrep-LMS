const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// Import frontend mock test module
const mockTestModule = require('../../frontend/scripts/mockTest.js');
const {
  mockState,
  setEvaluationState,
  renderHeldForReviewScreen,
  renderResultScreen,
  confirmSubmit,
  backToList,
  switchResultTab,
  fetchProctoringReport,
  initMockTests,
  teardownMediaAndTelemetry,
  sendProctoringEvent,
  escapeHtml,
} = mockTestModule;

describe('Frontend Evaluation-Aware Presentation Suite (Stage 3)', () => {
  let mockContainer;
  let mockEventListeners = [];
  let apiFetchCalls = [];
  let mockApiResponses = new Map();

  beforeEach(() => {
    // Reset mockState
    mockState.screen = 'list';
    mockState.mockTests = [];
    mockState.selectedMockTest = null;
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

    // Reset Stage 3 evaluation state
    mockState.evaluationStatus = null;
    mockState.heldMessage = '';
    mockState.submittedAt = null;

    // Reset Proctoring state
    mockState.procSessionId = null;
    mockState.resultTab = 'academic';
    mockState.proctoringReport = null;
    mockState.reportLoading = false;
    mockState.reportError = null;
    mockState.activeEvidenceModal = null;
    mockState.cameraStream = null;
    mockState.screenStream = null;
    mockState.cvAnalyzer = null;
    mockState.screenMonitor = null;
    mockState.activeEventListeners = [];

    // Reset tracking mocks
    apiFetchCalls = [];
    mockApiResponses.clear();
    mockEventListeners = [];

    // Setup Mock DOM
    mockContainer = {
      innerHTML: '',
      appendChild: () => {},
    };

    global.document = {
      getElementById: (id) => {
        if (id === 'mock-test-container') return mockContainer;
        return null;
      },
      createElement: () => ({
        innerHTML: '',
        firstElementChild: {},
      }),
      addEventListener: (evt, handler) => {
        mockEventListeners.push({ target: 'document', evt, handler });
      },
      removeEventListener: (evt, handler) => {
        mockEventListeners = mockEventListeners.filter(
          (l) => !(l.target === 'document' && l.evt === evt && l.handler === handler)
        );
      },
      hidden: false,
      fullscreenElement: null,
      fullscreenEnabled: true,
    };

    global.window = {
      location: {
        pathname: '/mock-test.html',
        search: '',
      },
      history: {
        replaceState: (state, title, url) => {
          if (url) {
            const parts = url.split('?');
            global.window.location.pathname = parts[0];
            global.window.location.search = parts[1] ? `?${parts[1]}` : '';
          }
        },
      },
      isSecureContext: true,
      addEventListener: (evt, handler) => {
        mockEventListeners.push({ target: 'window', evt, handler });
      },
      removeEventListener: (evt, handler) => {
        mockEventListeners = mockEventListeners.filter(
          (l) => !(l.target === 'window' && l.evt === evt && l.handler === handler)
        );
      },
      alert: () => {},
    };

    global.apiFetch = async (endpoint, options = {}) => {
      apiFetchCalls.push({ endpoint, options });
      if (mockApiResponses.has(endpoint)) {
        const resp = mockApiResponses.get(endpoint);
        return typeof resp === 'function' ? await resp(endpoint, options) : resp;
      }
      return { ok: true, data: { success: true } };
    };
  });

  // ─── Test 1: EVALUATED renders normal score and review ──────────────────────
  it('1. EVALUATED status renders academic score, section breakdown, question review, and tabs', () => {
    mockState.sessionId = 'sess_eval_101';
    mockState.selectedMockTest = {
      id: 'test_1',
      title: 'JEE Main Full Mock Test 1',
      duration: 180,
      totalQuestions: 75,
      totalMarks: 300,
    };

    const evaluatedResult = {
      score: 184,
      maxMarks: 300,
      percentage: '61.3',
      accuracy: '82.0',
      totalQuestions: 75,
      correctCount: 48,
      incorrectCount: 8,
      unattemptedCount: 19,
      sectionScores: {
        physics: { score: 64, maxMarks: 100, correctCount: 16, incorrectCount: 0, unattemptedCount: 9 },
        chemistry: { score: 70, maxMarks: 100, correctCount: 18, incorrectCount: 2, unattemptedCount: 5 },
        maths: { score: 50, maxMarks: 100, correctCount: 14, incorrectCount: 6, unattemptedCount: 5 },
      },
    };

    const reviewItems = [
      {
        q: 'What is the unit of Force?',
        section: 'physics',
        options: ['Newton', 'Joule', 'Watt', 'Pascal'],
        correctAnswer: 0,
        userSelectedOption: 0,
        isAttempted: true,
        isCorrect: true,
      },
    ];

    setEvaluationState({
      evaluationStatus: 'EVALUATED',
      result: evaluatedResult,
      review: reviewItems,
      mockTest: mockState.selectedMockTest,
      submittedAt: new Date('2026-09-24T10:00:00.000Z'),
    });

    assert.equal(mockState.evaluationStatus, 'EVALUATED');
    assert.deepEqual(mockState.result, evaluatedResult);
    assert.equal(mockState.review.length, 1);

    const html = renderResultScreen();

    // Must render evaluation tabs
    assert.match(html, /class="result-nav-tabs"/);
    assert.match(html, /Academic Score &amp; Review|Academic Score & Review/);
    assert.match(html, /Proctoring Telemetry Report/);

    // Must render hero score details
    assert.match(html, /class="result-hero"/);
    assert.match(html, /\+184 \/ 300/);
    assert.match(html, /61\.3% Score/);
    assert.match(html, /82\.0% Accuracy/);

    // Must render section breakdown
    assert.match(html, /Subject Breakdown/);
    assert.match(html, /Physics/);
    assert.match(html, /Chemistry/);
    assert.match(html, /Maths/);

    // Must render question review
    assert.match(html, /Question Review &amp; Answer Key|Question Review & Answer Key/);
    assert.match(html, /What is the unit of Force\?/);
    assert.match(html, /Newton/);
    assert.match(html, /Correct Answer/);
  });

  // ─── Test 2: HELD_FOR_REVIEW renders neutral held state ─────────────────────
  it('2. HELD_FOR_REVIEW renders neutral submission receipt with safe metadata', () => {
    mockState.sessionId = 'sess_held_202';
    mockState.selectedMockTest = {
      id: 'test_1',
      title: 'JEE Main Full Mock Test 1',
      duration: 180,
      totalQuestions: 75,
      totalMarks: 300,
    };

    setEvaluationState({
      evaluationStatus: 'HELD_FOR_REVIEW',
      mockTest: mockState.selectedMockTest,
      message: 'Your exam submission is currently pending standard review. Results will be released once verification is complete.',
      submittedAt: new Date('2026-09-24T10:30:00.000Z'),
    });

    assert.equal(mockState.evaluationStatus, 'HELD_FOR_REVIEW');
    assert.equal(mockState.result, null);
    assert.equal(mockState.review.length, 0);

    const html = renderResultScreen();

    // Must render held hero card and styling
    assert.match(html, /class="held-hero"/);
    assert.match(html, /class="badge-pill badge-held"/);
    assert.match(html, /Submission Received/);
    assert.match(html, /Submission Under Verification/);
    assert.match(html, /Your exam submission is currently pending standard review/);

    // Safe metadata checks
    assert.match(html, /class="held-info-card"/);
    assert.match(html, /Session ID/);
    assert.match(html, /sess_held_202/);
    assert.match(html, /Test Duration/);
    assert.match(html, /180 mins/);
    assert.match(html, /Questions In Assessment/);
    assert.match(html, /75/);

    // Return button
    assert.match(html, /Return to Mock Tests/);
    assert.match(html, /onclick="backToList\(\)"/);
  });

  // ─── Test 3: HELD_FOR_REVIEW does not render score or question review ───────
  it('3. HELD_FOR_REVIEW strictly withholds score, accuracy, section breakdowns, and question review', () => {
    mockState.sessionId = 'sess_held_303';
    mockState.selectedMockTest = {
      id: 'test_2',
      title: 'JEE Main Paper 2',
      duration: 180,
      totalQuestions: 75,
      totalMarks: 300,
    };

    setEvaluationState({
      evaluationStatus: 'HELD_FOR_REVIEW',
      mockTest: mockState.selectedMockTest,
      message: 'Submission under review',
      submittedAt: new Date(),
    });

    const html = renderResultScreen();

    // Withhold score and statistics
    assert.doesNotMatch(html, /result-hero-score/);
    assert.doesNotMatch(html, /result-hero-percent/);
    assert.doesNotMatch(html, /result-metrics-grid/);
    assert.doesNotMatch(html, /Subject Breakdown/);
    assert.doesNotMatch(html, /section-result-card/);

    // Withhold question review and answer keys
    assert.doesNotMatch(html, /review-item/);
    assert.doesNotMatch(html, /Question Review & Answer Key/);
    assert.doesNotMatch(html, /Correct Answer/);
    assert.doesNotMatch(html, /Your Answer/);

    // Withhold proctoring tab navigation
    assert.doesNotMatch(html, /result-nav-tabs/);
    assert.doesNotMatch(html, /Proctoring Telemetry Report/);
    assert.doesNotMatch(html, /Academic Score & Review/);
  });

  // ─── Test 4: HELD_FOR_REVIEW clears previously existing result state ────────
  it('4. Stale-state protection: HELD_FOR_REVIEW purges any existing score, review, and report from memory', () => {
    mockState.sessionId = 'sess_stale_404';

    // Pre-populate stale academic result in memory
    mockState.result = {
      score: 240,
      maxMarks: 300,
      percentage: '80.0',
    };
    mockState.review = [
      { q: 'Stale Question', isCorrect: true },
    ];
    mockState.proctoringReport = {
      overview: { sessionStatus: 'completed' },
    };
    mockState.resultTab = 'proctoring';

    // Now transition to HELD_FOR_REVIEW
    setEvaluationState({
      evaluationStatus: 'HELD_FOR_REVIEW',
      mockTest: { title: 'Target Test' },
      message: 'Processing hold',
    });

    // In-memory state MUST be wiped
    assert.equal(mockState.result, null);
    assert.deepEqual(mockState.review, []);
    assert.equal(mockState.proctoringReport, null);
    assert.equal(mockState.resultTab, 'academic');

    // Even if malicious script re-injects result directly on mockState:
    mockState.result = { score: 999 };
    const html = renderResultScreen();

    // renderResultScreen checks evaluationStatus === 'HELD_FOR_REVIEW' first and refuses to show score
    assert.match(html, /held-hero/);
    assert.doesNotMatch(html, /999/);
    assert.doesNotMatch(html, /result-hero-score/);
  });

  // ─── Test 5: Response contains no rule IDs, metrics, or suspicion terms ─────
  it('5. Privacy & candidate safety: held screen contains no rule IDs, suspicion terms, or telemetry internals', () => {
    mockState.sessionId = 'sess_privacy_505';
    mockState.selectedMockTest = {
      id: 'test_priv',
      title: 'JEE Main Physics Practice',
      duration: 60,
      totalQuestions: 25,
      totalMarks: 100,
    };

    setEvaluationState({
      evaluationStatus: 'HELD_FOR_REVIEW',
      mockTest: mockState.selectedMockTest,
      message: 'Your exam submission has been recorded successfully. Results are pending standard verification and will be released upon completion.',
      submittedAt: new Date(),
    });

    const html = renderResultScreen();

    // Verify absence of sensitive suspicion terms, telemetry jargon, and rule IDs
    const forbiddenPatterns = [
      /RULE_/i,
      /suspicious/i,
      /cheating/i,
      /flagged/i,
      /violation/i,
      /malpractice/i,
      /telemetry/i,
      /proctor/i,
      /burst/i,
      /episode/i,
      /multi_face/i,
      /tab_switch/i,
      /head_pose/i,
      /anomaly/i,
      /threshold/i,
    ];

    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(
        html,
        pattern,
        `Rendered held screen leaked sensitive term matching ${pattern}`
      );
    }
  });

  // ─── Test 6: Refresh / result retrieval with HELD_FOR_REVIEW remains held ───
  it('6. Durability on refresh: initMockTests with HELD_FOR_REVIEW sessionId URL param establishes held state', async () => {
    global.window.location.search = '?sessionId=sess_held_refresh_606';

    mockApiResponses.set('/api/mock-tests/sess_held_refresh_606/result', {
      ok: true,
      data: {
        success: true,
        sessionId: 'sess_held_refresh_606',
        status: 'completed',
        evaluationStatus: 'HELD_FOR_REVIEW',
        submittedAt: '2026-09-24T10:45:00.000Z',
        mockTest: {
          id: 'test_refresh',
          title: 'JEE Main Mock Test - Refresh',
          duration: 180,
          totalQuestions: 75,
        },
        message: 'Your exam submission is currently pending standard review.',
      },
    });

    await initMockTests();

    assert.equal(mockState.screen, 'result');
    assert.equal(mockState.sessionId, 'sess_held_refresh_606');
    assert.equal(mockState.evaluationStatus, 'HELD_FOR_REVIEW');
    assert.equal(mockState.result, null);
    assert.deepEqual(mockState.review, []);

    const html = renderResultScreen();
    assert.match(html, /class="held-hero"/);
    assert.match(html, /Submission Under Verification/);
    assert.doesNotMatch(html, /result-hero-score/);
  });

  // ─── Test 7: EVALUATED remains accessible after refresh ──────────────────────
  it('7. Durability on refresh: initMockTests with EVALUATED sessionId URL param restores score and review', async () => {
    global.window.location.search = '?sessionId=sess_eval_refresh_707';

    mockApiResponses.set('/api/mock-tests/sess_eval_refresh_707/result', {
      ok: true,
      data: {
        success: true,
        sessionId: 'sess_eval_refresh_707',
        status: 'completed',
        evaluationStatus: 'EVALUATED',
        submittedAt: '2026-09-24T11:00:00.000Z',
        mockTest: {
          id: 'test_eval_refresh',
          title: 'JEE Main Mock Test - Evaluated',
          duration: 180,
          totalQuestions: 75,
        },
        result: {
          score: 210,
          maxMarks: 300,
          percentage: '70.0',
          accuracy: '88.5',
          totalQuestions: 75,
          correctCount: 55,
          incorrectCount: 10,
          unattemptedCount: 10,
          sectionScores: {},
        },
        review: [
          { q: 'Refresh Q1', section: 'physics', isAttempted: false, isCorrect: false },
        ],
      },
    });

    await initMockTests();

    assert.equal(mockState.screen, 'result');
    assert.equal(mockState.sessionId, 'sess_eval_refresh_707');
    assert.equal(mockState.evaluationStatus, 'EVALUATED');
    assert.notEqual(mockState.result, null);
    assert.equal(mockState.result.score, 210);
    assert.equal(mockState.review.length, 1);

    const html = renderResultScreen();
    assert.match(html, /class="result-hero"/);
    assert.match(html, /\+210 \/ 300/);
  });

  // ─── Test 8: Successful submission without score is handled gracefully ──────
  it('8. Graceful submission: confirmSubmit receiving HELD_FOR_REVIEW seamlessly renders held receipt', async () => {
    mockState.sessionId = 'sess_submit_held_808';
    mockState.screen = 'exam';
    mockState.selectedMockTest = {
      id: 'test_held_submit',
      title: 'JEE Test Held Submit',
      duration: 180,
      totalQuestions: 75,
    };

    // Mock proctoring stop endpoint
    mockApiResponses.set('/api/mock-tests/sess_submit_held_808/proctoring/stop', {
      ok: true,
      data: { success: true },
    });

    // Mock submit response (HELD_FOR_REVIEW without result score)
    mockApiResponses.set('/api/mock-tests/sess_submit_held_808/submit', {
      ok: true,
      data: {
        success: true,
        sessionId: 'sess_submit_held_808',
        status: 'completed',
        evaluationStatus: 'HELD_FOR_REVIEW',
        submittedAt: '2026-09-24T11:15:00.000Z',
        message: 'Exam submitted successfully. Your submission is pending standard review.',
      },
    });

    // Mock get result response
    mockApiResponses.set('/api/mock-tests/sess_submit_held_808/result', {
      ok: true,
      data: {
        success: true,
        sessionId: 'sess_submit_held_808',
        status: 'completed',
        evaluationStatus: 'HELD_FOR_REVIEW',
        submittedAt: '2026-09-24T11:15:00.000Z',
        mockTest: mockState.selectedMockTest,
        message: 'Your exam submission is currently pending standard review.',
      },
    });

    await confirmSubmit();

    assert.equal(mockState.screen, 'result');
    assert.equal(mockState.evaluationStatus, 'HELD_FOR_REVIEW');
    assert.equal(mockState.result, null);
    assert.equal(mockState.review.length, 0);

    // Verify URL was updated with sessionId for refresh durability
    assert.match(global.window.location.search, /sessionId=sess_submit_held_808/);

    // Verify proctoring report was NOT fetched
    const reportCalls = apiFetchCalls.filter((c) => c.endpoint.includes('/proctoring/report'));
    assert.equal(reportCalls.length, 0);

    const html = renderResultScreen();
    assert.match(html, /class="held-hero"/);
    assert.match(html, /Submission Under Verification/);
  });

  // ─── Test 9: Double submission remains guarded ──────────────────────────────
  it('9. Concurrency protection: confirmSubmit blocks duplicate concurrent submission calls', async () => {
    mockState.sessionId = 'sess_double_submit_909';
    mockState.submitting = false;

    let submitCallCount = 0;
    global.apiFetch = async (endpoint) => {
      if (endpoint.includes('/submit')) {
        submitCallCount++;
        // Simulate network delay
        await new Promise((r) => setTimeout(r, 50));
        return {
          ok: true,
          data: {
            success: true,
            evaluationStatus: 'HELD_FOR_REVIEW',
          },
        };
      }
      return { ok: true, data: { success: true } };
    };

    // Fire two submissions simultaneously
    const p1 = confirmSubmit();
    const p2 = confirmSubmit();

    await Promise.all([p1, p2]);

    assert.equal(submitCallCount, 1, 'Only exactly one submit API request was initiated');
  });

  // ─── Test 10: Terminal state teardown stops media, intervals, and listeners ─
  it('10. Terminal state teardown: media tracks, timers, heartbeat intervals, and listeners are cleanly terminated', () => {
    let cameraStopped = false;
    let screenStopped = false;

    mockState.cameraStream = {
      getTracks: () => [
        {
          stop: () => {
            cameraStopped = true;
          },
        },
      ],
    };
    mockState.screenStream = {
      getTracks: () => [
        {
          stop: () => {
            screenStopped = true;
          },
        },
      ],
    };

    let timerCleared = false;
    let heartbeatCleared = false;
    mockState.timerInterval = 1111;
    mockState.heartbeatInterval = 2222;

    const originalClearInterval = global.clearInterval;
    global.clearInterval = (id) => {
      if (id === 1111) timerCleared = true;
      if (id === 2222) heartbeatCleared = true;
    };

    try {
      teardownMediaAndTelemetry();

      assert.equal(cameraStopped, true);
      assert.equal(screenStopped, true);
      assert.equal(timerCleared, true);
      assert.equal(heartbeatCleared, true);
      assert.equal(mockState.cameraStream, null);
      assert.equal(mockState.screenStream, null);
      assert.equal(mockState.timerInterval, null);
      assert.equal(mockState.heartbeatInterval, null);
    } finally {
      global.clearInterval = originalClearInterval;
    }
  });

  // ─── Test 11: Chapter test functionality remains unaffected ─────────────────
  it('11. Isolation verification: chapter test routes and state machine remain completely independent', () => {
    // Verify that chapter test files exist and do not couple to mock test evaluation gate
    const fs = require('fs');
    const path = require('path');

    const chapterTestScriptPath = path.join(__dirname, '../../frontend/scripts/test.js');
    assert.equal(fs.existsSync(chapterTestScriptPath), true);

    const chapterTestContent = fs.readFileSync(chapterTestScriptPath, 'utf8');
    // Chapter tests evaluate chapter questions and store in testResults without proctoring evaluation gates
    assert.match(chapterTestContent, /screenResult/);
    assert.match(chapterTestContent, /saveTestResult/);
  });

  // ─── Test 12: Normal mock test flow remains unaffected ──────────────────────
  it('12. Normal flow verification: CLEAR assessment releases score and allows proctoring report tab', async () => {
    mockState.sessionId = 'sess_normal_1212';
    mockState.selectedMockTest = {
      id: 'test_clear_flow',
      title: 'JEE Main Complete Normal Flow',
      duration: 180,
      totalQuestions: 75,
      totalMarks: 300,
    };

    const clearResult = {
      score: 220,
      maxMarks: 300,
      percentage: '73.3',
      accuracy: '91.2',
      totalQuestions: 75,
      correctCount: 56,
      incorrectCount: 4,
      unattemptedCount: 15,
      sectionScores: {},
    };

    mockApiResponses.set('/api/mock-tests/sess_normal_1212/proctoring/stop', {
      ok: true,
      data: { success: true },
    });

    mockApiResponses.set('/api/mock-tests/sess_normal_1212/submit', {
      ok: true,
      data: {
        success: true,
        sessionId: 'sess_normal_1212',
        status: 'completed',
        evaluationStatus: 'EVALUATED',
        result: clearResult,
      },
    });

    mockApiResponses.set('/api/mock-tests/sess_normal_1212/result', {
      ok: true,
      data: {
        success: true,
        sessionId: 'sess_normal_1212',
        status: 'completed',
        evaluationStatus: 'EVALUATED',
        mockTest: mockState.selectedMockTest,
        result: clearResult,
        review: [],
      },
    });

    mockApiResponses.set('/api/mock-tests/sess_normal_1212/proctoring/report', {
      ok: true,
      data: {
        success: true,
        report: {
          overview: { examStartedAt: new Date(), examEndedAt: new Date() },
          proctoringOverview: { totalEpisodes: 0 },
        },
      },
    });

    await confirmSubmit();

    assert.equal(mockState.evaluationStatus, 'EVALUATED');
    assert.deepEqual(mockState.result, clearResult);

    // Proctoring report should be fetched in the background for EVALUATED
    const reportCalls = apiFetchCalls.filter((c) => c.endpoint.includes('/proctoring/report'));
    assert.equal(reportCalls.length, 1);

    // Test switching tabs works when EVALUATED
    switchResultTab('proctoring');
    assert.equal(mockState.resultTab, 'proctoring');

    // Return to list clears sessionId URL query param and resets state
    backToList();
    assert.equal(mockState.screen, 'list');
    assert.equal(mockState.sessionId, null);
    assert.equal(mockState.result, null);
    assert.equal(mockState.evaluationStatus, null);
    assert.equal(global.window.location.search, '');
  });

  // ─── Test 13: Teardown safety & final observation event dispatch ─────────────
  it('13. Teardown safety: cvAnalyzer.stop() emitting FACE_ABSENT dispatches event, verifies acceptance BEFORE proctoring/stop and result transition', async () => {
    mockState.sessionId = 'sess_teardown_face_absent_13';
    mockState.screen = 'exam';
    mockState.selectedMockTest = { id: 'test_td', title: 'Teardown Test', duration: 60, totalQuestions: 10 };

    let screenWhenEventDispatched = null;
    let eventRequestActive = false;
    let eventAccepted = false;
    let stopCalledWhileEventActive = false;
    let stopCalledOnlyAfterEventAccepted = false;
    let screenWhenStopCalled = null;

    // Attach mock cvAnalyzer that emits FACE_ABSENT on stop()
    mockState.cvAnalyzer = {
      stop: () => {
        // 1 & 2. Exam is active; cvAnalyzer.stop() generates FACE_ABSENT
        screenWhenEventDispatched = mockState.screen;
        sendProctoringEvent('FACE_ABSENT', 'webcam', 15000, { confirmedDurationMs: 15000 });
      },
    };

    mockApiResponses.set('/api/mock-tests/sess_teardown_face_absent_13/proctoring/event', async () => {
      eventRequestActive = true;
      // Simulate asynchronous network roundtrip
      await new Promise((r) => setTimeout(r, 10));
      eventRequestActive = false;
      eventAccepted = true;
      return { ok: true, status: 201, data: { success: true } };
    });

    mockApiResponses.set('/api/mock-tests/sess_teardown_face_absent_13/proctoring/stop', async () => {
      screenWhenStopCalled = mockState.screen;
      if (eventRequestActive) stopCalledWhileEventActive = true;
      if (eventAccepted) stopCalledOnlyAfterEventAccepted = true;
      return { ok: true, status: 200, data: { success: true } };
    });

    mockApiResponses.set('/api/mock-tests/sess_teardown_face_absent_13/submit', {
      ok: true,
      data: {
        success: true,
        sessionId: 'sess_teardown_face_absent_13',
        status: 'completed',
        evaluationStatus: 'EVALUATED',
        submittedAt: new Date().toISOString(),
      },
    });

    mockApiResponses.set('/api/mock-tests/sess_teardown_face_absent_13/result', {
      ok: true,
      data: {
        success: true,
        sessionId: 'sess_teardown_face_absent_13',
        status: 'completed',
        evaluationStatus: 'EVALUATED',
        result: { score: 100 },
        mockTest: mockState.selectedMockTest,
      },
    });

    await confirmSubmit();

    // 1. Exam was active when event was generated
    assert.strictEqual(screenWhenEventDispatched, 'exam', '1. Exam must be active when cvAnalyzer generates FACE_ABSENT');

    // 2 & 3. cvAnalyzer.stop() generated FACE_ABSENT and event transmission was invoked
    const eventCall = apiFetchCalls.find((c) =>
      c.endpoint.includes('/proctoring/event') && c.options?.body?.type === 'FACE_ABSENT'
    );
    assert.ok(eventCall, '2 & 3. FACE_ABSENT event transmission MUST be invoked via apiFetch');
    assert.strictEqual(eventCall.options.body.duration, 15000);

    // 4. Telemetry request succeeded and got accepted
    assert.strictEqual(eventAccepted, true, '4. Telemetry request must succeed and be accepted before continuing');
    assert.strictEqual(mockState.lastTelemetryFlushOk, true, '4. flushPendingTelemetry confirms delivery success');

    // 5. /proctoring/stop occurs only AFTER telemetry was accepted, and while still before result screen
    assert.strictEqual(stopCalledWhileEventActive, false, '5. /proctoring/stop must NOT be called while telemetry is in-flight');
    assert.strictEqual(stopCalledOnlyAfterEventAccepted, true, '5. /proctoring/stop must occur ONLY AFTER telemetry was accepted');
    assert.strictEqual(screenWhenStopCalled, 'exam', '5. /proctoring/stop occurs before result-screen transition');

    // 6. Result-screen transition occurs only afterward
    assert.strictEqual(mockState.screen, 'result', '6. Result-screen transition occurs only after stop and teardown');
  });

  // ─── Test 14: Failed terminal telemetry is not silently treated as successful ──
  it('14. Teardown safety: failed terminal telemetry is not silently treated as successfully delivered', async () => {
    mockState.sessionId = 'sess_teardown_fail_14';
    mockState.screen = 'exam';
    mockState.selectedMockTest = { id: 'test_td2', title: 'Teardown Test 2', duration: 60, totalQuestions: 10 };

    mockState.cvAnalyzer = {
      stop: () => {
        sendProctoringEvent('FACE_ABSENT', 'webcam', 15000, { confirmedDurationMs: 15000 });
      },
    };

    // Simulate endpoint returning HTTP 500 error
    mockApiResponses.set('/api/mock-tests/sess_teardown_fail_14/proctoring/event', {
      ok: false,
      status: 500,
      data: { success: false, message: 'Internal server error' },
    });

    mockApiResponses.set('/api/mock-tests/sess_teardown_fail_14/proctoring/stop', {
      ok: true,
      data: { success: true },
    });

    mockApiResponses.set('/api/mock-tests/sess_teardown_fail_14/submit', {
      ok: true,
      data: { success: true, evaluationStatus: 'EVALUATED' },
    });

    mockApiResponses.set('/api/mock-tests/sess_teardown_fail_14/result', {
      ok: true,
      data: { success: true, result: {} },
    });

    await confirmSubmit();

    // Delivery failure must be detected and recorded, not silently ignored as successful
    assert.strictEqual(mockState.lastTelemetryFlushOk, false, 'Failed terminal telemetry must set lastTelemetryFlushOk to false');
  });
});
