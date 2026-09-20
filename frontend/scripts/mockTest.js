// ─── NexPrep JEE Main Mock Test State Machine ───

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
  screen: 'list', // 'list' | 'instructions' | 'exam' | 'result'
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
};

// ─── Renderer ──────────────────────────────────────────
function render() {
  const container = document.getElementById('mock-test-container');
  if (!container) return;

  if (mockState.screen === 'list') {
    container.innerHTML = renderListScreen();
  } else if (mockState.screen === 'instructions') {
    container.innerHTML = renderInstructionsScreen();
  } else if (mockState.screen === 'exam') {
    container.innerHTML = renderExamScreen();
  } else if (mockState.screen === 'result') {
    container.innerHTML = renderResultScreen();
  }

  // Render modal if active
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
        ? `<button class="btn-start-mock btn-resume-mock" onclick="startMockTest('${escapeHtml(test.slug || test._id)}')">⚡ Resume Attempt</button>`
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
        <p>Full-pattern mock tests featuring Physics, Chemistry, and Mathematics sections with authentic +4 / -1 negative marking and server-authoritative timer controls.</p>
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
      <p style="color:var(--muted-2);">Please review the exam protocol carefully before beginning your attempt.</p>

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
            <strong>State Restoration & Resilience</strong>
            <p>If your browser disconnects or is accidentally refreshed, your active session and recorded answers are preserved on the server. You can resume immediately without loss of progress.</p>
          </div>
        </div>
      </div>

      <div style="display:flex; justify-content:flex-end; gap:14px; margin-top:28px;">
        <button class="card" style="min-height:unset; padding:12px 24px;" onclick="backToList()">Cancel</button>
        <button class="btn-start-mock" onclick="startMockTest('${escapeHtml(test.slug || test._id)}')">Agree & Start Exam →</button>
      </div>
    </div>
  `;
}

function renderExamScreen() {
  if (mockState.loading) {
    return `
      <div style="text-align:center; padding: 80px 20px;">
        <h2>Initializing Exam Environment...</h2>
        <p class="page-message">Connecting to server and loading sanitized question set.</p>
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

  return `
    <div class="exam-topbar">
      <div>
        <div class="exam-info-title">${escapeHtml(mockState.selectedMockTest?.title || 'JEE Mock Test')}</div>
        <div style="font-size:0.82rem; color:var(--muted-2);">Section: ${escapeHtml(q.section?.toUpperCase() || '')}</div>
      </div>

      <div class="exam-section-tabs">
        ${sectionTabs}
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
          Are you sure you wish to conclude this exam? Your responses will be authoritatively graded on the server.
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

function backToList() {
  clearInterval(mockState.timerInterval);
  clearInterval(mockState.heartbeatInterval);
  mockState.screen = 'list';
  mockState.errorMessage = '';
  initMockTests();
}

async function startMockTest(testIdOrSlug) {
  mockState.loading = true;
  mockState.screen = 'exam';
  render();

  try {
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

    mockState.loading = false;
    render();

    // Start Authoritative Countdown Timer
    startExamTimer();

    // Start 30-second Heartbeat
    startHeartbeat();
  } catch (error) {
    mockState.loading = false;
    alert('Network error: unable to start or resume mock test.');
    mockState.screen = 'list';
    render();
  }
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
  mockState.heartbeatInterval = setInterval(async () => {
    if (!mockState.sessionId || mockState.screen !== 'exam') return;
    try {
      const { ok, data } = await apiFetch(`/api/mock-tests/${mockState.sessionId}/heartbeat`, {
        method: 'POST',
      });
      if (ok && data.status === 'expired') {
        clearInterval(mockState.timerInterval);
        clearInterval(mockState.heartbeatInterval);
        alert('Your exam session has expired on the server.');
        confirmSubmit();
      }
    } catch (e) {
      // Ignore transient network failures on background heartbeat
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
  // Jump to first question belonging to this section
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
  clearInterval(mockState.timerInterval);
  clearInterval(mockState.heartbeatInterval);
  mockState.showSubmitModal = false;
  mockState.loading = true;
  mockState.screen = 'result';
  render();

  // Prepare current answers payload
  const answersPayload = [];
  mockState.answers.forEach((val, key) => {
    answersPayload.push({
      questionId: key,
      selectedOption: val.selectedOption,
      isMarkedForReview: val.isMarkedForReview,
    });
  });

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

    // Fetch complete result and question review
    const resResponse = await apiFetch(`/api/mock-tests/${mockState.sessionId}/result`);
    if (resResponse.ok) {
      mockState.result = resResponse.data.result;
      mockState.review = resResponse.data.review || [];
      mockState.selectedMockTest = resResponse.data.mockTest;
    }

    mockState.loading = false;
    render();
  } catch (error) {
    mockState.loading = false;
    alert('Network error submitting exam. Please check backend.');
    render();
  }
}

// ─── Initialize ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initMockTests();
});
