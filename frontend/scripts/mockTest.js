// ─── NexPrep JEE Main Mock Test & Proctoring State Machine ───

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const mockState = {
  screen: 'list', // 'list' | 'instructions' | 'readiness' | 'exam' | 'result'
  mockTests: [],
  selectedMockTest: null,
  activeSessionInfo: null,
  sessionId: null,
  sessionStatus: null,
  startedAt: null,
  expiresAt: null,
  questions: [],
  answers: new Map(), // questionId -> { selectedOption, isMarkedForReview }
  visitedQuestions: new Set(),
  currentQIndex: 0,
  currentSection: 'physics',
  timerInterval: null,
  heartbeatInterval: null,
  remainingSeconds: 0,
  showSubmitModal: false,
  submitting: false,
  loading: false,
  errorMessage: '',
  result: null,
  review: [],

  // ─── Phase 2: Proctoring & Telemetry State ───
  procSessionId: null,
  proctoringState: {
    cameraState: 'inactive',
    microphoneState: 'inactive',
    screenShareState: 'inactive',
    fullscreenState: 'inactive',
    visibilityState: 'visible',
  },
  readinessCapabilities: null,
  cameraStream: null,
  screenStream: null,
  blurTimestamp: null,
  activeEventListeners: [],

  // ─── Phase 3: Webcam Computer Vision State ───
  cvAnalyzer: null,
  cvStatus: 'off', // 'off' | 'initializing' | 'active' | 'unavailable' | 'stopped'

  // ─── Phase 4: Screen Monitoring & Intelligence State ───
  screenMonitor: null,
  screenAiStatus: 'off', // 'off' | 'initializing' | 'active' | 'unavailable' | 'stopped'

  // ─── Phase 6: Proctoring Report State ───
  resultTab: 'academic', // 'academic' | 'proctoring'
  proctoringReport: null,
  reportLoading: false,
  reportError: null,
  activeEvidenceModal: null, // array of evidence items to display
};

function attachExamWebcamVideo() {
  const videoEl = document.getElementById('exam-webcam-video');
  if (videoEl && mockState.cameraStream) {
    if (videoEl.srcObject !== mockState.cameraStream) {
      videoEl.srcObject = mockState.cameraStream;
    }
    videoEl.play().catch(() => {});
  }
}

// ─── Renderer ──────────────────────────────────────────
function render() {
  const container = document.getElementById('mock-test-container');
  if (!container) return;

  if (mockState.screen === 'list') {
    container.innerHTML = renderListScreen();
  } else if (mockState.screen === 'instructions') {
    container.innerHTML = renderInstructionsScreen();
  } else if (mockState.screen === 'readiness') {
    container.innerHTML = renderReadinessScreen();
    // Reattach video stream if camera stream is already active
    attachWebcamPreview();
  } else if (mockState.screen === 'exam') {
    container.innerHTML = renderExamScreen();
    attachExamWebcamVideo();
  } else if (mockState.screen === 'result') {
    container.innerHTML = renderResultScreen();
  }

  // Render submit confirmation modal if triggered during exam
  if (mockState.showSubmitModal && mockState.screen === 'exam') {
    const modalWrap = document.createElement('div');
    modalWrap.innerHTML = renderSubmitModal();
    container.appendChild(modalWrap.firstElementChild);
  }
}

// ─── Screens ───────────────────────────────────────────

function renderListScreen() {
  const testsHtml = (mockState.mockTests || [])
    .map((test) => {
      const isResumable =
        mockState.activeSessionInfo &&
        (mockState.activeSessionInfo.mockTestId === test._id ||
          mockState.activeSessionInfo.mockTestId === test.id);

      const actionBtn = isResumable
        ? `<button class="btn-start-mock btn-resume-mock" onclick="openReadiness('${escapeHtml(test.slug || test._id)}')">⚡ Resume Attempt</button>`
        : `<button class="btn-start-mock" onclick="openInstructions('${escapeHtml(test.slug || test._id)}')">Start Mock Test →</button>`;

      const sectionsHtml = (test.sections || [])
        .map((s) => `<span class="mock-section-tag">${escapeHtml(s.name)} (${s.totalQuestions} Qs)</span>`)
        .join('');

      return `
        <div class="mock-card">
          <div class="mock-card-header">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span class="badge-pill badge-jee">JEE Main Pattern</span>
              ${isResumable ? '<span class="badge-pill badge-active">In Progress</span>' : ''}
            </div>
            <h3>${escapeHtml(test.title)}</h3>
            <p>${escapeHtml(test.description)}</p>
          </div>

          <div class="mock-specs">
            <div class="mock-spec-item">
              <span class="mock-spec-label">Duration</span>
              <span class="mock-spec-val">${test.duration} mins</span>
            </div>
            <div class="mock-spec-item">
              <span class="mock-spec-label">Questions</span>
              <span class="mock-spec-val">${test.totalQuestions} Qs</span>
            </div>
            <div class="mock-spec-item">
              <span class="mock-spec-label">Max Marks</span>
              <span class="mock-spec-val">${test.totalMarks}</span>
            </div>
          </div>

          <div>
            <div style="font-size:0.8rem; color:var(--muted); margin-bottom:8px; text-transform:uppercase;">Sections Included</div>
            <div class="mock-sections-tags">${sectionsHtml}</div>
          </div>

          <div style="margin-top: 10px;">
            ${actionBtn}
          </div>
        </div>
      `;
    })
    .join('');

  return `
    <div class="mock-test-hero">
      <div>
        <span class="badge-pill badge-jee" style="margin-bottom:12px;">Exam Subsystem</span>
        <h1>JEE Main Mock Examinations</h1>
        <p>Full-pattern practice exams featuring Physics, Chemistry, and Mathematics sections with authentic +4 / -1 negative marking, server-authoritative timer controls, and telemetry monitoring.</p>
      </div>
      <div>
        <button class="back-btn" onclick="window.location.href='home.html'"><span class="back-icon" aria-hidden="true"></span><span>Back to Home</span></button>
      </div>
    </div>

    ${
      mockState.errorMessage
        ? `<p class="page-message error">${escapeHtml(mockState.errorMessage)}</p>`
        : ''
    }

    <h2>Available Mock Tests</h2>
    <div class="mock-cards-grid">
      ${
        testsHtml ||
        '<p class="page-message">No mock tests currently active. Please check back soon.</p>'
      }
    </div>
  `;
}

function renderInstructionsScreen() {
  const test = mockState.selectedMockTest;
  if (!test) return '';

  return `
    <div class="instructions-panel">
      <button class="back-btn" onclick="backToList()"><span class="back-icon" aria-hidden="true"></span><span>Back to Tests</span></button>
      <h2>Exam Instructions: ${escapeHtml(test.title)}</h2>
      <p style="color:var(--muted-2);">Please review the exam protocol carefully before proceeding.</p>

      <div class="instructions-list">
        <div class="instruction-item">
          <div class="instruction-num">1</div>
          <div class="instruction-text">
            <strong>Duration & Server Authority</strong>
            <p>Total time allocated is <strong>${test.duration} minutes</strong>. The server is the authoritative clock. If the timer expires, the test will automatically submit.</p>
          </div>
        </div>
        <div class="instruction-item">
          <div class="instruction-num">2</div>
          <div class="instruction-text">
            <strong>Marking Scheme</strong>
            <p>Each correct answer awards <strong>+4 marks</strong>. Each incorrect answer incurs a penalty of <strong>-1 mark</strong>. Unattempted questions receive <strong>0 marks</strong>.</p>
          </div>
        </div>
        <div class="instruction-item">
          <div class="instruction-num">3</div>
          <div class="instruction-text">
            <strong>Sectional Navigation</strong>
            <p>The exam consists of 3 sections: Physics, Chemistry, and Mathematics. You can switch between sections and navigate between questions freely using the Question Palette.</p>
          </div>
        </div>
        <div class="instruction-item">
          <div class="instruction-num">4</div>
          <div class="instruction-text">
            <strong>Proctored Environment & Telemetry</strong>
            <p>During the exam, browser focus, visibility, and device availability will be monitored. You will verify your devices on the next readiness screen before the exam begins.</p>
          </div>
        </div>
      </div>

      <div style="display:flex; justify-content:flex-end; gap:14px; margin-top:28px;">
        <button class="card" style="min-height:unset; padding:12px 24px;" onclick="backToList()">Cancel</button>
        <button class="btn-start-mock" onclick="openReadiness('${escapeHtml(test.slug || test._id)}')">Proceed to Proctoring Readiness →</button>
      </div>
    </div>
  `;
}

function renderReadinessScreen() {
  const test = mockState.selectedMockTest;
  const caps = mockState.readinessCapabilities || {
    secureContext: window.isSecureContext,
    cameraSupported: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    microphoneSupported: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    screenShareSupported: !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia),
    fullscreenSupported: !!(document.fullscreenEnabled || document.webkitFullscreenEnabled),
  };

  const isCamActive = mockState.proctoringState.cameraState === 'active';
  const isMicActive = mockState.proctoringState.microphoneState === 'active';
  const isScreenActive = mockState.proctoringState.screenShareState === 'active';

  return `
    <div class="readiness-panel">
      <button class="back-btn" onclick="openInstructions('${escapeHtml(test?.slug || test?._id || '')}')"><span class="back-icon" aria-hidden="true"></span><span>Back to Instructions</span></button>
      <h2>System & Proctoring Readiness</h2>
      <p style="color:var(--muted-2);">Verify that your browser environment meets the requirements for a proctored examination. Permissions are requested only when you click "Enable Devices".</p>

      <div class="readiness-grid">
        <!-- Secure Context -->
        <div class="readiness-card">
          <div class="readiness-card-header">
            <span class="readiness-card-title">Secure Context (HTTPS/Local)</span>
            <span class="chip-status ${caps.secureContext ? 'chip-supported' : 'chip-unsupported'}">
              ${caps.secureContext ? 'Supported' : 'Not Supported'}
            </span>
          </div>
          <p class="readiness-desc">Required for secure browser media streams and full hardware access.</p>
        </div>

        <!-- Camera API -->
        <div class="readiness-card">
          <div class="readiness-card-header">
            <span class="readiness-card-title">Webcam Stream</span>
            <span class="chip-status ${isCamActive ? 'chip-active' : caps.cameraSupported ? 'chip-permission' : 'chip-unsupported'}">
              ${isCamActive ? 'Active' : caps.cameraSupported ? 'Permission Required' : 'Not Supported'}
            </span>
          </div>
          <p class="readiness-desc">Used locally to verify student presence. Video stays local and is not stored remotely.</p>
        </div>

        <!-- Microphone API -->
        <div class="readiness-card">
          <div class="readiness-card-header">
            <span class="readiness-card-title">Microphone Stream</span>
            <span class="chip-status ${isMicActive ? 'chip-active' : caps.microphoneSupported ? 'chip-permission' : 'chip-unsupported'}">
              ${isMicActive ? 'Active' : caps.microphoneSupported ? 'Permission Required' : 'Not Supported'}
            </span>
          </div>
          <p class="readiness-desc">Monitors audio hardware state during testing session.</p>
        </div>

        <!-- Screen Share API -->
        <div class="readiness-card">
          <div class="readiness-card-header">
            <span class="readiness-card-title">Screen Sharing Stream</span>
            <span class="chip-status ${isScreenActive ? 'chip-active' : caps.screenShareSupported ? 'chip-optional' : 'chip-unsupported'}">
              ${isScreenActive ? 'Active' : caps.screenShareSupported ? 'Optional / Ready' : 'Not Supported'}
            </span>
          </div>
          <p class="readiness-desc">Verifies screen capture capability for display integrity.</p>
        </div>

        <!-- Fullscreen API -->
        <div class="readiness-card">
          <div class="readiness-card-header">
            <span class="readiness-card-title">Fullscreen Mode</span>
            <span class="chip-status ${caps.fullscreenSupported ? 'chip-supported' : 'chip-unsupported'}">
              ${caps.fullscreenSupported ? 'Supported' : 'Not Supported'}
            </span>
          </div>
          <p class="readiness-desc">The exam will expand to full screen upon launch to minimize distractions.</p>
        </div>
      </div>

      <div class="preview-container">
        <div class="webcam-preview-box">
          <video id="webcam-preview-el" autoplay playsinline muted style="${isCamActive ? '' : 'display:none;'}"></video>
          <div id="webcam-preview-placeholder" class="webcam-placeholder-text" style="${isCamActive ? 'display:none;' : ''}">
            ${isCamActive ? '' : 'Camera preview will appear here once enabled.'}
          </div>
        </div>

        <div style="flex:1; display:flex; flex-direction:column; justify-content:space-between; gap:16px;">
          <div>
            <h4 style="margin:0 0 8px 0; color:#fff;">Device Permissions</h4>
            <p style="color:var(--muted-2); font-size:0.92rem; margin:0 0 16px 0;">
              Click below to grant the necessary hardware permissions for this exam session.
            </p>
            <button class="btn-exam btn-exam-review" onclick="requestProctoringPermissions()">
              📷 ${isCamActive ? 'Devices Enabled (Re-check)' : 'Enable Devices & Permissions'}
            </button>
          </div>

          <div style="display:flex; justify-content:flex-end; gap:14px; margin-top:20px;">
            <button class="card" style="min-height:unset; padding:12px 24px;" onclick="openInstructions('${escapeHtml(test?.slug || test?._id || '')}')">Back</button>
            <button class="btn-start-mock" id="btn-begin-proctored-exam" onclick="startExamWithProctoring('${escapeHtml(test?.slug || test?._id || '')}')">
              Begin Examination →
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderExamScreen() {
  if (mockState.loading) {
    return `
      <div style="text-align:center; padding: 80px 20px;">
        <h2>Initializing Exam & Proctoring Environment...</h2>
        <p class="page-message">Connecting to server and establishing session telemetry.</p>
      </div>
    `;
  }

  const q = mockState.questions[mockState.currentQIndex];
  if (!q) return '<p class="page-message error">No question loaded.</p>';

  const total = mockState.questions.length;
  const qNum = mockState.currentQIndex + 1;

  // Timer formatted
  const mins = Math.floor(mockState.remainingSeconds / 60);
  const secs = String(mockState.remainingSeconds % 60).padStart(2, '0');
  const isDanger = mockState.remainingSeconds <= 300; // <= 5 mins

  // Current answer state
  const curAns = mockState.answers.get(q.id) || { selectedOption: -1, isMarkedForReview: false };

  // Section tabs
  const sections = mockState.selectedMockTest ? mockState.selectedMockTest.sections || [] : [];
  const sectionTabs = sections
    .map((sec) => {
      const isActive = (sec.id || '').toLowerCase() === (mockState.currentSection || '').toLowerCase();
      return `
        <button class="exam-section-tab ${isActive ? 'active' : ''}" onclick="switchSection('${escapeHtml(sec.id)}')">
          ${escapeHtml(sec.name)}
        </button>
      `;
    })
    .join('');

  // Options
  const optionsHtml = q.options
    .map((opt, i) => {
      const isSelected = curAns.selectedOption === i;
      return `
        <button class="exam-option-card ${isSelected ? 'selected' : ''}" onclick="selectOption(${i})">
          <div class="exam-option-index">${String.fromCharCode(65 + i)}</div>
          <div>${escapeHtml(opt)}</div>
        </button>
      `;
    })
    .join('');

  // Palette buttons
  const paletteBtns = mockState.questions
    .map((item, idx) => {
      const num = idx + 1;
      const isCur = idx === mockState.currentQIndex;
      const ansObj = mockState.answers.get(item.id);
      const isVisited = mockState.visitedQuestions.has(item.id);

      let statusClass = 'not-visited';
      if (ansObj && ansObj.isMarkedForReview) {
        statusClass = 'marked-review';
      } else if (ansObj && ansObj.selectedOption !== -1 && ansObj.selectedOption !== null && ansObj.selectedOption !== undefined) {
        statusClass = 'answered';
      } else if (isVisited) {
        statusClass = 'not-answered';
      }

      return `
        <button class="palette-btn ${statusClass} ${isCur ? 'current' : ''}" onclick="goToQuestion(${idx})">
          ${num}
        </button>
      `;
    })
    .join('');

  // Proctoring telemetry indicators
  const pState = mockState.proctoringState;
  let cvDotClass = 'dot-inactive';
  let cvText = 'CV: Off';
  if (mockState.cvStatus === 'active') {
    cvDotClass = 'dot-active';
    cvText = 'CV: Active';
  } else if (mockState.cvStatus === 'initializing') {
    cvDotClass = 'dot-warning';
    cvText = 'CV: Init';
  } else if (mockState.cvStatus === 'unavailable') {
    cvDotClass = 'dot-unavailable';
    cvText = 'CV: Unavailable';
  }

  let screenDotClass = 'dot-inactive';
  let screenText = 'Screen AI: Off';
  if (mockState.screenAiStatus === 'active') {
    screenDotClass = 'dot-active';
    screenText = 'Screen AI: Active';
  } else if (mockState.screenAiStatus === 'initializing') {
    screenDotClass = 'dot-warning';
    screenText = 'Screen AI: Init';
  } else if (mockState.screenAiStatus === 'unavailable') {
    screenDotClass = 'dot-unavailable';
    screenText = 'Screen AI: Unavailable';
  }

  return `
    <div class="exam-topbar">
      <div>
        <div class="exam-info-title">${escapeHtml(mockState.selectedMockTest?.title || 'JEE Mock Test')}</div>
        <div style="font-size:0.82rem; color:var(--muted-2);">Section: ${escapeHtml(q.section?.toUpperCase() || '')}</div>
      </div>

      <div class="exam-section-tabs">
        ${sectionTabs}
      </div>

      <!-- Proctoring Status Pill -->
      <div class="proctoring-topbar-pill" id="proctoring-pill">
        <span style="color:var(--muted); font-size:0.75rem; text-transform:uppercase;">Proctoring</span>
        <div class="telemetry-item" title="Webcam Stream State">
          <div class="dot-indicator ${pState.cameraState === 'active' ? 'dot-active' : 'dot-inactive'}"></div>
          <span>Cam</span>
        </div>
        <div class="telemetry-item" title="Microphone State">
          <div class="dot-indicator ${pState.microphoneState === 'active' ? 'dot-active' : 'dot-inactive'}"></div>
          <span>Mic</span>
        </div>
        <div class="telemetry-item" title="Screen Sharing State">
          <div class="dot-indicator ${pState.screenShareState === 'active' ? 'dot-active' : 'dot-inactive'}"></div>
          <span>Screen</span>
        </div>
        <div class="telemetry-item" title="Fullscreen State">
          <div class="dot-indicator ${pState.fullscreenState === 'active' ? 'dot-active' : 'dot-inactive'}"></div>
          <span>FS</span>
        </div>
        <div class="telemetry-item" title="Computer Vision Status: ${mockState.cvStatus}">
          <div class="dot-indicator ${cvDotClass}"></div>
          <span>${cvText}</span>
        </div>
        <div class="telemetry-item" title="Screen Intelligence Status: ${mockState.screenAiStatus}">
          <div class="dot-indicator ${screenDotClass}"></div>
          <span>${screenText}</span>
        </div>
        ${typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('proc_debug') === '1' ? `
        <div class="telemetry-item" title="Temporal Correlation Engine (?proc_debug=1)">
          <div class="dot-indicator dot-active"></div>
          <span>Temporal: Ready</span>
        </div>` : ''}
      </div>

      <div style="display:flex; align-items:center; gap:16px;">
        <div class="exam-timer-box ${isDanger ? 'warning' : ''}" id="exam-timer">
          ⏱ ${mins}:${secs}
        </div>
        <button class="btn-exam btn-exam-submit" onclick="openSubmitModal()">Submit Exam</button>
      </div>
    </div>

    <div class="exam-main-container">
      <!-- Left: Question Panel -->
      <div class="exam-question-panel">
        <div class="q-panel-header">
          <span class="q-panel-badge">Question ${qNum} of ${total} · Section: ${escapeHtml(q.section?.toUpperCase() || '')}</span>
          <span class="q-marks-badge">+4 / -1</span>
        </div>

        <p class="exam-q-text">Q${qNum}. ${escapeHtml(q.q)}</p>

        <div class="exam-options-list">
          ${optionsHtml}
        </div>

        <div class="exam-action-bar">
          <div class="action-group-left">
            <button class="btn-exam btn-exam-clear" onclick="clearResponse()">Clear Response</button>
            <button class="btn-exam btn-exam-review" onclick="toggleMarkForReview()">
              ${curAns.isMarkedForReview ? '✓ Marked for Review' : 'Mark for Review'}
            </button>
          </div>

          <div class="action-group-right">
            ${
              mockState.currentQIndex > 0
                ? `<button class="btn-exam btn-exam-clear" onclick="goToQuestion(${mockState.currentQIndex - 1})">← Previous</button>`
                : ''
            }
            <button class="btn-exam btn-exam-primary" onclick="saveAndNext()">
              ${mockState.currentQIndex === total - 1 ? 'Save & Review Palette' : 'Save & Next →'}
            </button>
          </div>
        </div>
      </div>

      <!-- Right: Palette Panel -->
      <div class="exam-palette-panel">
        <!-- Compact Webcam Monitor (Phase 3) -->
        <div class="exam-webcam-card">
          <div class="exam-webcam-header">
            <span>Webcam Monitor</span>
            <span class="exam-webcam-badge ${mockState.cvStatus === 'active' ? 'badge-active' : ''}">${cvText}</span>
          </div>
          <div class="exam-webcam-box">
            <video id="exam-webcam-video" autoplay playsinline muted></video>
            <div id="exam-webcam-placeholder" class="exam-webcam-placeholder" style="${mockState.cameraStream ? 'display:none;' : ''}">
              Camera inactive
            </div>
          </div>
        </div>

        <h3 class="palette-title">Question Palette</h3>

        <div class="palette-legend">
          <div class="legend-item">
            <div class="legend-indicator indicator-answered"></div>
            <span>Answered</span>
          </div>
          <div class="legend-item">
            <div class="legend-indicator indicator-review"></div>
            <span>Review</span>
          </div>
          <div class="legend-item">
            <div class="legend-indicator indicator-not-answered"></div>
            <span>Not Answered</span>
          </div>
          <div class="legend-item">
            <div class="legend-indicator indicator-not-visited"></div>
            <span>Not Visited</span>
          </div>
        </div>

        <div class="palette-grid">
          ${paletteBtns}
        </div>
      </div>
    </div>
  `;
}

function renderSubmitModal() {
  let answered = 0;
  let markedReview = 0;
  let notAnswered = 0;
  const total = mockState.questions.length;

  mockState.questions.forEach((q) => {
    const ans = mockState.answers.get(q.id);
    if (ans && ans.isMarkedForReview) {
      markedReview++;
    }
    if (ans && ans.selectedOption !== -1 && ans.selectedOption !== null && ans.selectedOption !== undefined) {
      answered++;
    } else {
      notAnswered++;
    }
  });

  return `
    <div class="modal-overlay">
      <div class="modal-card">
        <h3>Submit Mock Examination</h3>
        <p style="color:var(--muted-2); font-size:0.92rem; margin:0;">
          Are you sure you wish to conclude this exam? Your responses will be authoritatively graded on the server and the proctoring session will terminate.
        </p>

        <div class="modal-stats-list">
          <div class="modal-stat-box">
            <span>Total Questions</span>
            <strong>${total}</strong>
          </div>
          <div class="modal-stat-box">
            <span style="color:#34d399;">Answered</span>
            <strong style="color:#34d399;">${answered}</strong>
          </div>
          <div class="modal-stat-box">
            <span style="color:#c4b5fd;">Marked for Review</span>
            <strong style="color:#c4b5fd;">${markedReview}</strong>
          </div>
          <div class="modal-stat-box">
            <span style="color:#f87171;">Unanswered</span>
            <strong style="color:#f87171;">${notAnswered}</strong>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn-exam btn-exam-clear" onclick="closeSubmitModal()">Return to Exam</button>
          <button class="btn-exam btn-exam-submit" onclick="confirmSubmit()">Confirm & Submit Test</button>
        </div>
      </div>
    </div>
  `;
}

function renderResultScreen() {
  const res = mockState.result;
  const test = mockState.selectedMockTest;

  if (!res) {
    return `
      <div style="text-align:center; padding:60px 20px;">
        <h2>Evaluating Submission...</h2>
        <p class="page-message">Contacting grading server...</p>
      </div>
    `;
  }

  const isAcademic = mockState.resultTab !== 'proctoring';

  return `
    <div class="result-nav-tabs">
      <button class="result-nav-tab ${isAcademic ? 'active' : ''}" onclick="switchResultTab('academic')">
        Academic Score & Review
      </button>
      <button class="result-nav-tab ${!isAcademic ? 'active' : ''}" onclick="switchResultTab('proctoring')">
        Proctoring Telemetry Report
      </button>
    </div>

    ${isAcademic ? renderAcademicResultContent(res, test) : renderProctoringReportContent()}

    ${mockState.activeEvidenceModal ? renderEvidenceModal() : ''}
  `;
}

function renderAcademicResultContent(res, test) {
  const scoreSign = res.score > 0 ? `+${res.score}` : `${res.score}`;

  // Section score cards
  const sectionCards = Object.keys(res.sectionScores || {})
    .map((secKey) => {
      const secData = res.sectionScores[secKey];
      const secTitle = secKey.charAt(0).toUpperCase() + secKey.slice(1);
      return `
        <div class="section-result-card">
          <h4>${escapeHtml(secTitle)}</h4>
          <div class="section-stat-row">
            <span>Score / Max</span>
            <strong>${secData.score} / ${secData.maxMarks}</strong>
          </div>
          <div class="section-stat-row">
            <span>Correct</span>
            <strong style="color:#34d399;">${secData.correctCount}</strong>
          </div>
          <div class="section-stat-row">
            <span>Incorrect (-1)</span>
            <strong style="color:#f87171;">${secData.incorrectCount}</strong>
          </div>
          <div class="section-stat-row">
            <span>Unattempted</span>
            <strong>${secData.unattemptedCount}</strong>
          </div>
        </div>
      `;
    })
    .join('');

  // Detailed Question Review
  const reviewItems = (mockState.review || [])
    .map((item, index) => {
      const qNum = index + 1;
      let statusLabel = 'Unattempted';
      let itemClass = 'unattempted';

      if (item.isAttempted) {
        if (item.isCorrect) {
          statusLabel = 'Correct (+4)';
          itemClass = 'correct';
        } else {
          statusLabel = 'Incorrect (-1)';
          itemClass = 'incorrect';
        }
      }

      const optionsReview = (item.options || [])
        .map((optText, optIdx) => {
          const isUserPicked = item.userSelectedOption === optIdx;
          const isCorrect = item.correctAnswer === optIdx;

          let optClass = '';
          if (isCorrect) optClass = 'correct-answer';
          else if (isUserPicked) optClass = 'user-picked';

          const marker = isCorrect ? '✓ Correct Answer' : isUserPicked ? '✗ Your Answer' : '';

          return `
            <div class="review-opt ${optClass}">
              <strong>${String.fromCharCode(65 + optIdx)}.</strong> ${escapeHtml(optText)}
              ${marker ? `<span style="float:right; font-weight:600; font-size:0.8rem;">${marker}</span>` : ''}
            </div>
          `;
        })
        .join('');

      return `
        <div class="review-item ${itemClass}">
          <div class="review-item-header">
            <span>Q${qNum} · Section: ${escapeHtml(item.section?.toUpperCase() || '')}</span>
            <span>${statusLabel}</span>
          </div>
          <p style="margin:0 0 12px 0; color:#f1f5f9; font-weight:500;">${escapeHtml(item.q)}</p>
          <div>${optionsReview}</div>
        </div>
      `;
    })
    .join('');

  return `
    <div class="result-hero">
      <span class="badge-pill badge-jee">Examination Complete</span>
      <h2>${escapeHtml(test?.title || 'JEE Main Mock Test')} Result</h2>
      <div class="result-hero-score">${scoreSign} / ${res.maxMarks}</div>
      <div class="result-hero-percent">${res.percentage}% Score · ${res.accuracy}% Accuracy</div>

      <div class="result-metrics-grid">
        <div class="result-metric-card">
          <span>Total Questions</span>
          <strong>${res.totalQuestions}</strong>
        </div>
        <div class="result-metric-card">
          <span style="color:#34d399;">Correct (+4)</span>
          <strong style="color:#34d399;">${res.correctCount}</strong>
        </div>
        <div class="result-metric-card">
          <span style="color:#f87171;">Incorrect (-1)</span>
          <strong style="color:#f87171;">${res.incorrectCount}</strong>
        </div>
        <div class="result-metric-card">
          <span>Unattempted (0)</span>
          <strong>${res.unattemptedCount}</strong>
        </div>
      </div>
    </div>

    <h3>Subject Breakdown</h3>
    <div class="section-results-grid">
      ${sectionCards}
    </div>

    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:36px;">
      <h3>Question Review & Answer Key</h3>
      <button class="back-btn" onclick="backToList()"><span class="back-icon" aria-hidden="true"></span><span>Return to Mock Tests</span></button>
    </div>

    <div class="review-container">
      ${reviewItems || '<p class="page-message">No question review available.</p>'}
    </div>
  `;
}

function renderProctoringReportContent() {
  if (mockState.reportLoading) {
    return `
      <div style="text-align:center; padding:60px 20px;">
        <h2>Generating Proctoring Telemetry Report...</h2>
        <p class="page-message">Correlating multi-stream observations and temporal episodes...</p>
      </div>
    `;
  }

  if (mockState.reportError) {
    return `
      <div style="text-align:center; padding:40px 20px;">
        <p class="page-message" style="color:#f87171; margin-bottom:16px;">${escapeHtml(mockState.reportError)}</p>
        <button class="btn-start-mock" onclick="fetchProctoringReport()">Retry Loading Report</button>
      </div>
    `;
  }

  const report = mockState.proctoringReport;
  if (!report) {
    return `
      <div style="text-align:center; padding:40px 20px;">
        <p class="page-message">Proctoring report not yet loaded.</p>
        <button class="btn-start-mock" onclick="fetchProctoringReport()">Load Proctoring Report</button>
      </div>
    `;
  }

  const overview = report.overview || {};
  const procOverview = report.proctoringOverview || {};
  const stats = report.statistics || {};
  const timeline = report.timeline || [];
  const relationships = report.relationships || [];
  const techObs = report.technicalObservations || [];
  const unknowns = report.limitationsAndUnknowns || [];

  const startStr = overview.examStartedAt ? new Date(overview.examStartedAt).toLocaleString() : 'N/A';
  const endStr = overview.examEndedAt ? new Date(overview.examEndedAt).toLocaleString() : 'In Progress';
  const durationStr = overview.examDurationSeconds ? `${Math.floor(overview.examDurationSeconds / 60)}m ${overview.examDurationSeconds % 60}s` : '0s';

  const fmtSeconds = (ms) => ms ? `${(ms / 1000).toFixed(1)}s` : '0s';

  // Hardware & Environment Observations
  const techObsHtml = techObs.length > 0 ? `
    <div class="report-section">
      <h3>Hardware & Environment Observations</h3>
      ${techObs.map((obs) => `
        <div class="report-technical-card">
          <div class="report-card-header">
            <strong style="color:#f8fafc;">${escapeHtml(obs.title)}</strong>
            ${obs.evidenceIds && obs.evidenceIds.length > 0 ? `
              <button class="btn-view-evidence" onclick="viewEvidenceModal('${obs.evidenceIds.join(',')}')">
                View Evidence (${obs.evidenceIds.length})
              </button>
            ` : ''}
          </div>
          <p class="report-narrative" style="margin-bottom:0;">${escapeHtml(obs.description)}</p>
        </div>
      `).join('')}
    </div>
  ` : '';

  // Chronological Episodes Timeline
  const timelineHtml = timeline.length > 0 ? timeline.map((ep) => {
    const timeStr = ep.startedAt ? new Date(ep.startedAt).toLocaleTimeString() : '';
    const durStr = ep.durationMs ? `${(ep.durationMs / 1000).toFixed(1)}s` : 'Instantaneous';
    const tagsHtml = (ep.signalTags || []).map((tag) => {
      let tagClass = '';
      if (tag.includes('camera') || tag.includes('face') || tag.includes('pose')) tagClass = 'camera';
      else if (tag.includes('screen')) tagClass = 'screen';
      else if (tag.includes('media') || tag.includes('fullscreen')) tagClass = 'media';
      return `<span class="signal-tag ${tagClass}">${escapeHtml(tag)}</span>`;
    }).join(' ');

    return `
      <div class="report-timeline-card">
        <div class="report-card-header">
          <div>
            <strong style="color:#f1f5f9; font-size:0.95rem;">${escapeHtml(ep.type)}</strong>
            <span style="color:#94a3b8; font-size:0.8rem; margin-left:10px;">${timeStr} · Duration: ${durStr}</span>
          </div>
          ${ep.evidenceIds && ep.evidenceIds.length > 0 ? `
            <button class="btn-view-evidence" onclick="viewEvidenceModal('${ep.evidenceIds.join(',')}')">
              View Evidence (${ep.evidenceIds.length})
            </button>
          ` : ''}
        </div>
        ${tagsHtml ? `<div class="report-signal-tags">${tagsHtml}</div>` : ''}
        <p class="report-narrative">${escapeHtml(ep.narrative)}</p>
        ${ep.questionContext ? `<div style="font-size:0.8rem; color:#94a3b8;">${escapeHtml(ep.questionContext)}</div>` : ''}
      </div>
    `;
  }).join('') : '<p class="page-message">No notable temporal episodes recorded during this exam session.</p>';

  // Multi-stream Temporal Relationships
  const relationshipsHtml = relationships.length > 0 ? relationships.map((rel) => {
    const timeStr = rel.startedAt ? new Date(rel.startedAt).toLocaleTimeString() : '';
    const durStr = rel.durationMs ? `${(rel.durationMs / 1000).toFixed(1)}s` : '0s';
    const deltaStr = rel.deltaTimeMs !== null && rel.deltaTimeMs !== undefined ? ` · Δt: ${(rel.deltaTimeMs / 1000).toFixed(1)}s` : '';

    return `
      <div class="report-relationship-card">
        <div class="report-card-header">
          <div>
            <strong style="color:#a78bfa; font-size:0.95rem;">${escapeHtml(rel.type)}</strong>
            <span style="color:#94a3b8; font-size:0.8rem; margin-left:10px;">${timeStr} · Overlap: ${durStr}${deltaStr}</span>
          </div>
          ${rel.evidenceIds && rel.evidenceIds.length > 0 ? `
            <button class="btn-view-evidence" onclick="viewEvidenceModal('${rel.evidenceIds.join(',')}')">
              View Linked Evidence (${rel.evidenceIds.length})
            </button>
          ` : ''}
        </div>
        <p class="report-narrative" style="margin-bottom:0;">${escapeHtml(rel.description)}</p>
      </div>
    `;
  }).join('') : '<p class="page-message">No multi-stream concurrent or causal relationships detected.</p>';

  // Limitations & Explicit Unknowns
  const unknownsHtml = unknowns.map((u) => `
    <div class="report-unknown-item">
      <strong style="color:#93c5fd;">${escapeHtml(u.area)}:</strong> ${escapeHtml(u.statement)}
    </div>
  `).join('');

  return `
    <div class="report-header-card">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px;">
        <div>
          <span class="badge-pill badge-jee">Evidence-Grounded Proctoring Report</span>
          <h2 style="margin:8px 0 4px 0;">${escapeHtml(overview.testTitle || 'JEE Mock Test')}</h2>
          <div style="color:#94a3b8; font-size:0.85rem;">
            Candidate: <strong>${escapeHtml(overview.studentName || 'Student')}</strong> · Exam Status: <strong>${escapeHtml(overview.finalStatus || 'completed')}</strong>
          </div>
        </div>
        <button class="back-btn" onclick="backToList()"><span class="back-icon" aria-hidden="true"></span><span>Return to Mock Tests</span></button>
      </div>

      <div style="display:flex; gap:20px; flex-wrap:wrap; font-size:0.84rem; color:#cbd5e1; margin-bottom:16px; border-top:1px solid var(--border); padding-top:12px;">
        <div>Started: <strong>${startStr}</strong></div>
        <div>Ended: <strong>${endStr}</strong></div>
        <div>Duration: <strong>${durationStr}</strong></div>
        <div>Camera: <strong>${escapeHtml(procOverview.cameraState || 'inactive')} (${procOverview.cameraStopCount || 0} stops)</strong></div>
        <div>Screen: <strong>${escapeHtml(procOverview.screenShareState || 'inactive')} (${procOverview.screenShareStopCount || 0} stops)</strong></div>
        <div>Fullscreen: <strong>${escapeHtml(procOverview.fullscreenState || 'inactive')} (${procOverview.fullscreenExitCount || 0} exits)</strong></div>
      </div>

      <div style="background:rgba(30, 41, 59, 0.5); border:1px solid #334155; border-radius:8px; padding:12px 16px; font-size:0.82rem; color:#94a3b8; line-height:1.5;">
        ℹ️ <strong>System Notice:</strong> This report presents deterministic facts, temporal correlation episodes, and technical observations recorded during the examination. In accordance with strict fairness and integrity policies, the system does not calculate cheating probabilities, assign suspicion scores, or speculate on student intent.
      </div>
    </div>

    <div class="report-metrics-grid">
      <div class="report-metric-card">
        <span>Raw Events</span>
        <strong>${stats.totalRawEvents || 0}</strong>
      </div>
      <div class="report-metric-card">
        <span>Temporal Episodes</span>
        <strong>${stats.totalTemporalEpisodes || 0}</strong>
      </div>
      <div class="report-metric-card">
        <span>Cross-Stream Correlations</span>
        <strong>${stats.totalRelationships || 0}</strong>
      </div>
      <div class="report-metric-card">
        <span>Longest Focus Loss</span>
        <strong>${fmtSeconds(stats.longestFocusLossMs)}</strong>
      </div>
      <div class="report-metric-card">
        <span>Longest Face Absence</span>
        <strong>${fmtSeconds(stats.longestFaceAbsentMs)}</strong>
      </div>
      <div class="report-metric-card">
        <span>Longest Screen Deviation</span>
        <strong>${fmtSeconds(stats.longestScreenViewChangedMs)}</strong>
      </div>
    </div>

    ${techObsHtml}

    <div class="report-section">
      <h3>Chronological Episode Timeline</h3>
      ${timelineHtml}
    </div>

    <div class="report-section">
      <h3>Multi-Stream Temporal Correlations</h3>
      ${relationshipsHtml}
    </div>

    <div class="report-section">
      <h3>System Limitations & Explicit Unknowns</h3>
      <div class="report-unknowns-card">
        ${unknownsHtml}
      </div>
    </div>
  `;
}

function renderEvidenceModal() {
  const items = mockState.activeEvidenceModal || [];
  return `
    <div class="modal-overlay" onclick="closeEvidenceModal()">
      <div class="modal-card" style="max-width:720px; width:90%;" onclick="event.stopPropagation()">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <h3 style="margin:0;">Evidence Drill-Down (${items.length} records)</h3>
          <button onclick="closeEvidenceModal()" style="background:transparent; border:none; color:#94a3b8; font-size:1.4rem; cursor:pointer;">&times;</button>
        </div>
        <p style="color:#94a3b8; font-size:0.84rem; margin:0 0 16px 0;">
          Raw telemetry observations and derived temporal records supporting this report item.
        </p>
        <div class="evidence-modal-body">
          ${items.length === 0 ? '<p class="page-message">No raw records found for this reference.</p>' : ''}
          ${items.map((ev) => {
            const timeStr = ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : 'N/A';
            const durStr = ev.durationMs ? `${(ev.durationMs / 1000).toFixed(1)}s` : '0s';
            return `
              <div class="evidence-entry">
                <div class="evidence-entry-header">
                  <span><strong>${escapeHtml(ev.evidenceId)}</strong> · Nature: <span style="color:#38bdf8;">${escapeHtml(ev.nature)}</span></span>
                  <span>${timeStr}</span>
                </div>
                <div style="color:#cbd5e1; margin-bottom:6px;">
                  Source: <strong>${escapeHtml(ev.source)}</strong> | Type: <strong>${escapeHtml(ev.type)}</strong> | Duration: <strong>${durStr}</strong>
                </div>
                ${ev.metadata && Object.keys(ev.metadata).length > 0 ? `
                  <pre>${escapeHtml(JSON.stringify(ev.metadata, null, 2))}</pre>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
        <div style="text-align:right; margin-top:16px;">
          <button class="btn-exam" onclick="closeEvidenceModal()">Close</button>
        </div>
      </div>
    </div>
  `;
}

// ─── Actions & Logic ───────────────────────────────────

async function initMockTests() {
  mockState.loading = true;
  mockState.errorMessage = '';
  render();

  try {
    const { ok, data } = await apiFetch('/api/mock-tests');
    if (!ok) {
      mockState.errorMessage = data.message || 'Failed to load mock tests.';
      mockState.loading = false;
      render();
      return;
    }

    mockState.mockTests = data.mockTests || [];
    mockState.activeSessionInfo = data.activeSession || null;
    mockState.loading = false;
    render();
  } catch (error) {
    mockState.loading = false;
    mockState.errorMessage = 'Network error: could not connect to backend.';
    render();
  }
}

async function openInstructions(testIdOrSlug) {
  mockState.loading = true;
  render();

  try {
    const { ok, data } = await apiFetch(`/api/mock-tests/${testIdOrSlug}`);
    if (!ok) {
      alert(data.message || 'Could not load mock test details.');
      mockState.loading = false;
      render();
      return;
    }

    mockState.selectedMockTest = data.mockTest;
    mockState.screen = 'instructions';
    mockState.loading = false;
    render();
  } catch (error) {
    mockState.loading = false;
    alert('Network error connecting to backend.');
    render();
  }
}

function openReadiness(testIdOrSlug) {
  mockState.screen = 'readiness';
  mockState.readinessCapabilities = {
    secureContext: window.isSecureContext,
    cameraSupported: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    microphoneSupported: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
    screenShareSupported: !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia),
    fullscreenSupported: !!(document.fullscreenEnabled || document.webkitFullscreenEnabled),
  };
  render();
}

function attachWebcamPreview() {
  const videoEl = document.getElementById('webcam-preview-el');
  if (videoEl && mockState.cameraStream) {
    videoEl.srcObject = mockState.cameraStream;
  }
}

async function requestProctoringPermissions() {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('Media devices are not supported in this browser environment.');
      return;
    }

    // Request Webcam and Microphone streams explicitly
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 } },
      audio: true,
    });

    mockState.cameraStream = stream;
    mockState.proctoringState.cameraState = 'active';
    mockState.proctoringState.microphoneState = 'active';

    // Track when tracks end (hardware disconnected)
    stream.getVideoTracks().forEach((track) => {
      track.onended = () => {
        mockState.proctoringState.cameraState = 'inactive';
        sendProctoringEvent('CAMERA_STOPPED', 'media');
        updateTopbarTelemetryUI();
      };
    });

    stream.getAudioTracks().forEach((track) => {
      track.onended = () => {
        mockState.proctoringState.microphoneState = 'inactive';
        sendProctoringEvent('MICROPHONE_STOPPED', 'media');
        updateTopbarTelemetryUI();
      };
    });

    // Optionally check screen share support
    if (navigator.mediaDevices.getDisplayMedia) {
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        mockState.screenStream = displayStream;
        mockState.proctoringState.screenShareState = 'active';

        displayStream.getVideoTracks().forEach((track) => {
          track.onended = () => {
            mockState.proctoringState.screenShareState = 'inactive';
            sendProctoringEvent('SCREEN_SHARE_STOPPED', 'screen');
            updateTopbarTelemetryUI();
          };
        });
      } catch (e) {
        // Screen share optional or cancelled by user
        mockState.proctoringState.screenShareState = 'inactive';
      }
    }

    render();
  } catch (error) {
    mockState.proctoringState.cameraState = 'denied';
    mockState.proctoringState.microphoneState = 'denied';
    alert('Permission denied or camera/microphone not accessible: ' + (error.message || ''));
    render();
  }
}

function backToList() {
  teardownMediaAndTelemetry();
  mockState.screen = 'list';
  mockState.errorMessage = '';
  initMockTests();
}

async function startExamWithProctoring(testIdOrSlug) {
  mockState.loading = true;
  mockState.screen = 'exam';
  render();

  try {
    // 1. Start or resume MockTestSession
    const { ok, data } = await apiFetch(`/api/mock-tests/${testIdOrSlug}/start`, {
      method: 'POST',
    });

    if (!ok) {
      alert(data.message || 'Failed to start exam session.');
      mockState.screen = 'list';
      mockState.loading = false;
      initMockTests();
      return;
    }

    mockState.sessionId = data.sessionId;
    mockState.sessionStatus = data.status;
    mockState.startedAt = new Date(data.startedAt);
    mockState.expiresAt = new Date(data.expiresAt);
    mockState.selectedMockTest = data.mockTest;
    mockState.questions = data.questions || [];

    // Populate answers Map from server
    mockState.answers.clear();
    (data.answers || []).forEach((a) => {
      mockState.answers.set(a.questionId, {
        selectedOption: a.selectedOption,
        isMarkedForReview: !!a.isMarkedForReview,
      });
      if (a.selectedOption !== -1 && a.selectedOption !== null && a.selectedOption !== undefined) {
        mockState.visitedQuestions.add(a.questionId);
      }
    });

    mockState.currentQIndex = 0;
    if (mockState.questions.length > 0) {
      mockState.visitedQuestions.add(mockState.questions[0].id);
      mockState.currentSection = mockState.questions[0].section || 'physics';
    }

    // 2. Start ProctoringSession associated with MockTestSession
    const procRes = await apiFetch(`/api/mock-tests/${mockState.sessionId}/proctoring/start`, {
      method: 'POST',
      body: {
        cameraState: mockState.proctoringState.cameraState,
        microphoneState: mockState.proctoringState.microphoneState,
        screenShareState: mockState.proctoringState.screenShareState,
        fullscreenState: mockState.proctoringState.fullscreenState,
      },
    });

    if (procRes.ok && procRes.data.proctoringSession) {
      mockState.procSessionId = procRes.data.proctoringSession._id;
    }

    // 3. Request Fullscreen mode
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        mockState.proctoringState.fullscreenState = 'active';
      }
    } catch (e) {
      // Fullscreen permitted but ignored by user/browser
    }

    mockState.loading = false;
    render();

    // 4. Attach Browser & Page Telemetry Listeners
    attachTelemetryListeners();

    // 5. Start Authoritative Countdown Timer
    startExamTimer();

    // 6. Start Unified Heartbeat (every 30s)
    startHeartbeat();

    // 7. Start Webcam Computer Vision Pipeline (Phase 3)
    startWebcamCvPipeline();

    // 8. Start Screen Capture Monitoring Pipeline (Phase 4)
    startScreenMonitoringPipeline();
  } catch (error) {
    mockState.loading = false;
    alert('Network error: unable to start proctored mock test.');
    mockState.screen = 'list';
    render();
  }
}

async function startWebcamCvPipeline() {
  const examVideoEl = document.getElementById('exam-webcam-video');
  if (!examVideoEl || !mockState.cameraStream) {
    mockState.cvStatus = 'unavailable';
    updateTopbarTelemetryUI();
    return;
  }

  if (mockState.cvAnalyzer) {
    mockState.cvAnalyzer.stop();
  }

  if (window.WebcamCv && window.WebcamCv.createWebcamCvAnalyzer) {
    mockState.cvAnalyzer = window.WebcamCv.createWebcamCvAnalyzer({
      videoElement: examVideoEl,
      onObservation: (observation) => {
        // Forward stabilized observation to server-authoritative telemetry endpoint
        sendProctoringEvent(
          observation.type,
          observation.source || 'webcam',
          observation.duration || 0,
          observation.metadata || {}
        );
      },
      onStatusChange: ({ status }) => {
        mockState.cvStatus = status;
        updateTopbarTelemetryUI();
      },
    });

    await mockState.cvAnalyzer.start(examVideoEl);
  } else {
    mockState.cvStatus = 'unavailable';
    updateTopbarTelemetryUI();
  }
}

async function startScreenMonitoringPipeline() {
  if (!mockState.screenStream) {
    mockState.screenAiStatus = 'unavailable';
    updateTopbarTelemetryUI();
    return;
  }

  if (mockState.screenMonitor) {
    mockState.screenMonitor.stop();
  }

  if (window.ScreenMonitor && window.ScreenMonitor.createScreenMonitor) {
    mockState.screenMonitor = window.ScreenMonitor.createScreenMonitor({
      onObservation: (observation) => {
        // Forward stabilized observation to server-authoritative telemetry endpoint
        sendProctoringEvent(
          observation.type,
          observation.source || 'screen',
          observation.duration || 0,
          observation.metadata || {}
        );
      },
      onStatusChange: ({ status }) => {
        mockState.screenAiStatus = status;
        updateTopbarTelemetryUI();
      },
    });

    await mockState.screenMonitor.start(mockState.screenStream);
  } else {
    mockState.screenAiStatus = 'unavailable';
    updateTopbarTelemetryUI();
  }
}

// ─── Telemetry Event Listeners & Episode Tracking ───────

function attachTelemetryListeners() {
  removeTelemetryListeners();

  const handleVisibilityChange = () => {
    if (document.hidden) {
      mockState.proctoringState.visibilityState = 'hidden';
      sendProctoringEvent('PAGE_HIDDEN', 'browser');
    } else {
      mockState.proctoringState.visibilityState = 'visible';
      sendProctoringEvent('PAGE_VISIBLE', 'browser');
    }
    updateTopbarTelemetryUI();
  };

  const handleWindowBlur = () => {
    mockState.blurTimestamp = Date.now();
    sendProctoringEvent('FOCUS_LOST', 'browser');
  };

  const handleWindowFocus = () => {
    let episodeDuration = 0;
    if (mockState.blurTimestamp) {
      episodeDuration = Date.now() - mockState.blurTimestamp;
      mockState.blurTimestamp = null;
    }
    sendProctoringEvent('FOCUS_REGAINED', 'browser', episodeDuration);
  };

  const handleFullscreenChange = () => {
    if (!document.fullscreenElement) {
      mockState.proctoringState.fullscreenState = 'inactive';
      sendProctoringEvent('FULLSCREEN_EXITED', 'browser');
    } else {
      mockState.proctoringState.fullscreenState = 'active';
      sendProctoringEvent('FULLSCREEN_ENTERED', 'browser');
    }
    updateTopbarTelemetryUI();
  };

  const handleBeforeUnload = () => {
    // Best effort delivery on unload (observations only, not authoritative)
    if (mockState.sessionId && navigator.sendBeacon) {
      const url = `${typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : ''}/api/mock-tests/${mockState.sessionId}/proctoring/event`;
      const payload = JSON.stringify({ type: 'BEFORE_UNLOAD', source: 'browser' });
      const blob = new Blob([payload], { type: 'application/json' });
      navigator.sendBeacon(url, blob);
    }
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('blur', handleWindowBlur);
  window.addEventListener('focus', handleWindowFocus);
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  window.addEventListener('beforeunload', handleBeforeUnload);

  mockState.activeEventListeners = [
    { target: document, event: 'visibilitychange', handler: handleVisibilityChange },
    { target: window, event: 'blur', handler: handleWindowBlur },
    { target: window, event: 'focus', handler: handleWindowFocus },
    { target: document, event: 'fullscreenchange', handler: handleFullscreenChange },
    { target: window, event: 'beforeunload', handler: handleBeforeUnload },
  ];
}

function removeTelemetryListeners() {
  (mockState.activeEventListeners || []).forEach(({ target, event, handler }) => {
    target.removeEventListener(event, handler);
  });
  mockState.activeEventListeners = [];
}

async function sendProctoringEvent(type, source = 'browser', duration = 0, metadata = {}) {
  if (!mockState.sessionId || mockState.screen !== 'exam') return;

  try {
    await apiFetch(`/api/mock-tests/${mockState.sessionId}/proctoring/event`, {
      method: 'POST',
      body: {
        type,
        source,
        duration: Math.max(0, duration),
        metadata,
      },
    });
  } catch (e) {
    // Fail silently on transient telemetry delivery
  }
}

function updateTopbarTelemetryUI() {
  const pill = document.getElementById('proctoring-pill');
  if (!pill) return;

  const pState = mockState.proctoringState;
  let cvDotClass = 'dot-inactive';
  let cvText = 'CV: Off';
  if (mockState.cvStatus === 'active') {
    cvDotClass = 'dot-active';
    cvText = 'CV: Active';
  } else if (mockState.cvStatus === 'initializing') {
    cvDotClass = 'dot-warning';
    cvText = 'CV: Init';
  } else if (mockState.cvStatus === 'unavailable') {
    cvDotClass = 'dot-unavailable';
    cvText = 'CV: Unavailable';
  }

  let screenDotClass = 'dot-inactive';
  let screenText = 'Screen AI: Off';
  if (mockState.screenAiStatus === 'active') {
    screenDotClass = 'dot-active';
    screenText = 'Screen AI: Active';
  } else if (mockState.screenAiStatus === 'initializing') {
    screenDotClass = 'dot-warning';
    screenText = 'Screen AI: Init';
  } else if (mockState.screenAiStatus === 'unavailable') {
    screenDotClass = 'dot-unavailable';
    screenText = 'Screen AI: Unavailable';
  }

  pill.innerHTML = `
    <span style="color:var(--muted); font-size:0.75rem; text-transform:uppercase;">Proctoring</span>
    <div class="telemetry-item" title="Webcam Stream State">
      <div class="dot-indicator ${pState.cameraState === 'active' ? 'dot-active' : 'dot-inactive'}"></div>
      <span>Cam</span>
    </div>
    <div class="telemetry-item" title="Microphone State">
      <div class="dot-indicator ${pState.microphoneState === 'active' ? 'dot-active' : 'dot-inactive'}"></div>
      <span>Mic</span>
    </div>
    <div class="telemetry-item" title="Screen Sharing State">
      <div class="dot-indicator ${pState.screenShareState === 'active' ? 'dot-active' : 'dot-inactive'}"></div>
      <span>Screen</span>
    </div>
    <div class="telemetry-item" title="Fullscreen State">
      <div class="dot-indicator ${pState.fullscreenState === 'active' ? 'dot-active' : 'dot-inactive'}"></div>
      <span>FS</span>
    </div>
    <div class="telemetry-item" title="Computer Vision Status: ${mockState.cvStatus}">
      <div class="dot-indicator ${cvDotClass}"></div>
      <span>${cvText}</span>
    </div>
    <div class="telemetry-item" title="Screen Intelligence Status: ${mockState.screenAiStatus}">
      <div class="dot-indicator ${screenDotClass}"></div>
      <span>${screenText}</span>
    </div>
  `;
}

function teardownMediaAndTelemetry() {
  clearInterval(mockState.timerInterval);
  clearInterval(mockState.heartbeatInterval);
  removeTelemetryListeners();

  if (mockState.cvAnalyzer) {
    mockState.cvAnalyzer.stop();
    mockState.cvAnalyzer = null;
  }
  mockState.cvStatus = 'off';

  if (mockState.screenMonitor) {
    mockState.screenMonitor.stop();
    mockState.screenMonitor = null;
  }
  mockState.screenAiStatus = 'off';

  if (mockState.cameraStream) {
    mockState.cameraStream.getTracks().forEach((track) => track.stop());
    mockState.cameraStream = null;
  }
  if (mockState.screenStream) {
    mockState.screenStream.getTracks().forEach((track) => track.stop());
    mockState.screenStream = null;
  }

  mockState.proctoringState = {
    cameraState: 'inactive',
    microphoneState: 'inactive',
    screenShareState: 'inactive',
    fullscreenState: 'inactive',
    visibilityState: 'visible',
  };
}

function startExamTimer() {
  clearInterval(mockState.timerInterval);

  const tick = () => {
    const now = Date.now();
    const expiresMs = mockState.expiresAt ? mockState.expiresAt.getTime() : 0;
    const diffSec = Math.max(0, Math.floor((expiresMs - now) / 1000));
    mockState.remainingSeconds = diffSec;

    const timerEl = document.getElementById('exam-timer');
    if (timerEl) {
      const mins = Math.floor(diffSec / 60);
      const secs = String(diffSec % 60).padStart(2, '0');
      timerEl.textContent = `⏱ ${mins}:${secs}`;
      if (diffSec <= 300) {
        timerEl.classList.add('warning');
      } else {
        timerEl.classList.remove('warning');
      }
    }

    if (diffSec <= 0) {
      clearInterval(mockState.timerInterval);
      alert('Time has expired! Submitting your exam now.');
      confirmSubmit();
    }
  };

  tick();
  mockState.timerInterval = setInterval(tick, 1000);
}

function startHeartbeat() {
  clearInterval(mockState.heartbeatInterval);
  // Unified 30-second proctoring & exam session heartbeat (no redundant DB event rows)
  mockState.heartbeatInterval = setInterval(async () => {
    if (!mockState.sessionId || mockState.screen !== 'exam') return;
    try {
      const { ok, data } = await apiFetch(`/api/mock-tests/${mockState.sessionId}/proctoring/heartbeat`, {
        method: 'POST',
        body: {
          cameraState: mockState.proctoringState.cameraState,
          microphoneState: mockState.proctoringState.microphoneState,
          screenShareState: mockState.proctoringState.screenShareState,
          fullscreenState: mockState.proctoringState.fullscreenState,
          visibilityState: mockState.proctoringState.visibilityState,
        },
      });

      if (ok && (data.status === 'expired' || data.mockTestStatus === 'expired')) {
        clearInterval(mockState.timerInterval);
        clearInterval(mockState.heartbeatInterval);
        alert('Your exam session has expired on the server.');
        confirmSubmit();
      }
    } catch (e) {
      // Fail silently on transient background heartbeat failures
    }
  }, 30000);
}

async function selectOption(optionIndex) {
  const q = mockState.questions[mockState.currentQIndex];
  if (!q) return;

  const currentAns = mockState.answers.get(q.id) || { isMarkedForReview: false };
  currentAns.selectedOption = optionIndex;
  mockState.answers.set(q.id, currentAns);
  mockState.visitedQuestions.add(q.id);

  render();

  // Async sync to server
  try {
    await apiFetch(`/api/mock-tests/${mockState.sessionId}/answer`, {
      method: 'POST',
      body: {
        questionId: q.id,
        selectedOption: optionIndex,
        isMarkedForReview: currentAns.isMarkedForReview,
      },
    });
  } catch (e) {
    // Answer is safely buffered in state
  }
}

async function clearResponse() {
  const q = mockState.questions[mockState.currentQIndex];
  if (!q) return;

  const currentAns = mockState.answers.get(q.id) || { isMarkedForReview: false };
  currentAns.selectedOption = -1;
  mockState.answers.set(q.id, currentAns);

  render();

  try {
    await apiFetch(`/api/mock-tests/${mockState.sessionId}/answer`, {
      method: 'POST',
      body: {
        questionId: q.id,
        selectedOption: -1,
        isMarkedForReview: currentAns.isMarkedForReview,
      },
    });
  } catch (e) {}
}

async function toggleMarkForReview() {
  const q = mockState.questions[mockState.currentQIndex];
  if (!q) return;

  const currentAns = mockState.answers.get(q.id) || { selectedOption: -1 };
  currentAns.isMarkedForReview = !currentAns.isMarkedForReview;
  mockState.answers.set(q.id, currentAns);

  render();

  try {
    await apiFetch(`/api/mock-tests/${mockState.sessionId}/answer`, {
      method: 'POST',
      body: {
        questionId: q.id,
        selectedOption: currentAns.selectedOption,
        isMarkedForReview: currentAns.isMarkedForReview,
      },
    });
  } catch (e) {}
}

function goToQuestion(index) {
  if (index < 0 || index >= mockState.questions.length) return;
  mockState.currentQIndex = index;
  const q = mockState.questions[index];
  if (q) {
    mockState.visitedQuestions.add(q.id);
    mockState.currentSection = q.section || mockState.currentSection;
  }
  render();
}

function saveAndNext() {
  if (mockState.currentQIndex < mockState.questions.length - 1) {
    goToQuestion(mockState.currentQIndex + 1);
  } else {
    // If on last question, open review modal
    openSubmitModal();
  }
}

function switchSection(sectionId) {
  mockState.currentSection = sectionId;
  const firstQIdx = mockState.questions.findIndex(
    (q) => (q.section || '').toLowerCase() === (sectionId || '').toLowerCase()
  );
  if (firstQIdx !== -1) {
    goToQuestion(firstQIdx);
  } else {
    render();
  }
}

function openSubmitModal() {
  mockState.showSubmitModal = true;
  render();
}

function closeSubmitModal() {
  mockState.showSubmitModal = false;
  render();
}

async function confirmSubmit() {
  mockState.showSubmitModal = false;
  mockState.loading = true;
  mockState.screen = 'result';
  render();

  // 1. Stop Computer Vision Pipeline (flushes/closes any active episodes)
  if (mockState.cvAnalyzer) {
    try {
      mockState.cvAnalyzer.stop();
    } catch (e) {}
    mockState.cvAnalyzer = null;
  }

  // 2. Stop Screen Monitoring Pipeline (flushes/closes any active change episodes)
  if (mockState.screenMonitor) {
    try {
      mockState.screenMonitor.stop();
    } catch (e) {}
    mockState.screenMonitor = null;
  }

  // 3. Stop Proctoring Session
  try {
    await apiFetch(`/api/mock-tests/${mockState.sessionId}/proctoring/stop`, {
      method: 'POST',
      body: { reason: 'exam_submitted' },
    });
  } catch (e) {}

  // 3. Teardown media & listeners
  teardownMediaAndTelemetry();

  // 3. Prepare answers payload
  const answersPayload = [];
  mockState.answers.forEach((val, key) => {
    answersPayload.push({
      questionId: key,
      selectedOption: val.selectedOption,
      isMarkedForReview: val.isMarkedForReview,
    });
  });

  // 4. Submit Exam
  try {
    const { ok, data } = await apiFetch(`/api/mock-tests/${mockState.sessionId}/submit`, {
      method: 'POST',
      body: { answers: answersPayload },
    });

    if (!ok) {
      alert(data.message || 'Error submitting exam.');
    } else {
      mockState.result = data.result;
    }

    // 5. Fetch complete result and review
    const resResponse = await apiFetch(`/api/mock-tests/${mockState.sessionId}/result`);
    if (resResponse.ok) {
      mockState.result = resResponse.data.result;
      mockState.review = resResponse.data.review || [];
      mockState.selectedMockTest = resResponse.data.mockTest;
    }

    // Prefetch proctoring report in background
    fetchProctoringReport();

    mockState.loading = false;
    render();
  } catch (error) {
    mockState.loading = false;
    alert('Network error submitting exam. Please check backend.');
    render();
  }
}

// ─── Phase 6 Actions ─────────────────────────────────────

function switchResultTab(tab) {
  mockState.resultTab = tab;
  if (tab === 'proctoring' && !mockState.proctoringReport && !mockState.reportLoading) {
    fetchProctoringReport();
  } else {
    render();
  }
}

async function fetchProctoringReport() {
  if (!mockState.sessionId) return;
  mockState.reportLoading = true;
  mockState.reportError = null;
  render();

  try {
    const { ok, data } = await apiFetch(`/api/mock-tests/${mockState.sessionId}/proctoring/report`);
    mockState.reportLoading = false;
    if (ok && data && data.success && data.report) {
      mockState.proctoringReport = data.report;
    } else {
      mockState.reportError = data?.message || 'Failed to load proctoring report.';
    }
  } catch (err) {
    mockState.reportLoading = false;
    mockState.reportError = 'Network error loading proctoring report.';
  }
  render();
}

function viewEvidenceModal(evidenceIdsStr) {
  if (!mockState.proctoringReport || !mockState.proctoringReport.evidence) return;
  const ids = (evidenceIdsStr || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const matched = mockState.proctoringReport.evidence.filter((e) => ids.includes(e.evidenceId));
  mockState.activeEvidenceModal = matched;
  render();
}

function closeEvidenceModal() {
  mockState.activeEvidenceModal = null;
  render();
}

// Global window attachments for inline template handlers
window.switchResultTab = switchResultTab;
window.fetchProctoringReport = fetchProctoringReport;
window.viewEvidenceModal = viewEvidenceModal;
window.closeEvidenceModal = closeEvidenceModal;

// ─── Initialize ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initMockTests();
});
