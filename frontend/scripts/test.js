// ─── Helper ──────────────────────────────────────────────
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── State ───────────────────────────────────────────────
let state = {
  screen: 'main',
  subject: null,
  chapterId: null,
  chapter: null,
  questions: [],
  answers: [],
  currentQ: 0,
  score: 0,
  totalQuestions: 10,
  timer: null,
  timeLeft: 120,
  answered: false,
  lockNext: false,
  loading: false,
  loadingError: '',
  resultSaved: false,
  resultSaveMessage: '',
  submitting: false
};

// ─── Render ──────────────────────────────────────────────
function render() {
  const container = document.getElementById('test-container');
  if (!container) return;

  if (state.screen === 'main')     container.innerHTML = screenMain();
  if (state.screen === 'chapters') container.innerHTML = screenChapters();
  if (state.screen === 'test')     container.innerHTML = screenTest();
  if (state.screen === 'result')   container.innerHTML = screenResult();
}

// ─── Screens ─────────────────────────────────────────────

function screenMain() {
  return `
    <button class="back-btn" onclick="window.location.href='home.html'"><span class="back-icon" aria-hidden="true"></span><span>Back to Home</span></button>
    <h1>Practice Tests</h1>
    <p>Select a subject to practice chapter-wise tests</p>
    <div class="subjects">
      <div class="card" onclick="goSubject('physics')">
        <div>⚡</div>
        <div>Physics</div>
        <div class="card-sub">4 chapters · 40 Qs</div>
      </div>
      <div class="card" onclick="goSubject('chemistry')">
        <div>🧪</div>
        <div>Chemistry</div>
        <div class="card-sub">4 chapters · 40 Qs</div>
      </div>
      <div class="card" onclick="goSubject('maths')">
        <div>📐</div>
        <div>Mathematics</div>
        <div class="card-sub">4 chapters · 40 Qs</div>
      </div>
    </div>
  `;
}

function screenChapters() {
  const chapters = getSubjectChapters(state.subject);
  const label = escapeHtml(getSubjectTitle(state.subject));

  const cards = chapters.map(ch => `
    <div class="card" onclick="startTest('${escapeHtml(state.subject)}', '${escapeHtml(ch.id)}')">
      <div>${escapeHtml(ch.name)}</div>
      <div class="card-sub">10 Qs · 2 mins</div>
    </div>
  `).join('');

  return `
    <button class="back-btn" onclick="back()"><span class="back-icon" aria-hidden="true"></span><span>Back</span></button>
    <h1>${label} Tests</h1>
    <p>Select a chapter to begin</p>
    <div class="subjects">${cards}</div>
  `;
}

function screenTest() {
  if (state.loading) {
    return `
      <button class="back-btn" onclick="back()"><span class="back-icon" aria-hidden="true"></span><span>Back</span></button>
      <h1>${escapeHtml(state.chapter)}</h1>
      <p class="page-message">Loading questions from server...</p>
    `;
  }

  if (state.loadingError) {
    return `
      <button class="back-btn" onclick="back()"><span class="back-icon" aria-hidden="true"></span><span>Back</span></button>
      <h1>${escapeHtml(state.chapter)}</h1>
      <p class="page-message error">${escapeHtml(state.loadingError)}</p>
      <div class="result-actions" style="margin-top: 20px;">
        <button class="card" onclick="retryTest()">🔁 Try Again</button>
      </div>
    `;
  }

  if (!state.questions || state.questions.length === 0) {
    return `
      <button class="back-btn" onclick="back()"><span class="back-icon" aria-hidden="true"></span><span>Back</span></button>
      <h1>${escapeHtml(state.chapter)}</h1>
      <p class="page-message">No questions available for this chapter.</p>
    `;
  }

  const q = state.questions[state.currentQ];
  const qNum = state.currentQ + 1;
  const total = state.questions.length;
  const mins = Math.floor(state.timeLeft / 60);
  const secs = String(state.timeLeft % 60).padStart(2, '0');
  const timerClass = state.timeLeft <= 30 ? 'timer danger' : 'timer';

  const selectedAnswerObj = state.answers[state.currentQ];
  const selectedIndex = selectedAnswerObj ? selectedAnswerObj.selectedOption : -1;

  const options = q.options.map((opt, i) => {
    const isSelected = selectedIndex === i;
    const selectedClass = isSelected ? ' selected' : '';
    const disabledAttr = state.answered ? ' disabled' : '';

    return `
      <button class="option-btn${selectedClass}" id="opt-${i}" onclick="selectAnswer(${i})"${disabledAttr}>
        <span class="option-label">${String.fromCharCode(65 + i)}</span>
        ${escapeHtml(opt)}
      </button>
    `;
  }).join('');

  return `
    <div class="test-topbar">
      <div>
        <div class="test-chapter-name">${escapeHtml(state.chapter)}</div>
        <div class="test-progress">Question ${qNum} of ${total}</div>
      </div>
      <div class="${timerClass}" id="timer-display">${mins}:${secs}</div>
    </div>
    <button class="back-btn" onclick="exitTest()"><span class="back-icon" aria-hidden="true"></span><span>Exit Test</span></button>
    <div class="progress-bar-wrap">
      <div class="progress-bar-fill" style="width: ${(qNum / total) * 100}%"></div>
    </div>
    <div class="question-box">
      <p class="question-text">Q${qNum}. ${escapeHtml(q.q)}</p>
      <div class="options-list">${options}</div>
    </div>
    <button class="next-btn" id="next-btn" onclick="nextQuestion()" ${state.answered ? '' : 'disabled'}>
      ${state.currentQ === total - 1 ? 'Finish Test →' : 'Next Question →'}
    </button>
  `;
}

function screenResult() {
  const total = state.totalQuestions || 10;
  const score = state.score || 0;
  const percent = total ? Math.round((score / total) * 100) : 0;
  const saveMessage = state.resultSaveMessage
    ? `<div class="card-sub">${escapeHtml(state.resultSaveMessage)}</div>`
    : '';

  if (state.submitting) {
    return `
      <div class="result-box">
        <div class="result-title">Evaluating Test...</div>
        <div class="result-chapter">${escapeHtml(state.chapter)}</div>
        <p class="card-text">Submitting your answers to the server for authoritative grading.</p>
        ${saveMessage}
      </div>
    `;
  }

  let message, messageClass;
  if (percent >= 80)      { message = "Excellent! 🔥"; messageClass = "result-great"; }
  else if (percent >= 50) { message = "Good effort! 👍"; messageClass = "result-ok"; }
  else                    { message = "Keep practicing! 💪"; messageClass = "result-low"; }

  return `
    <div class="result-box">
      <div class="result-title">Test Complete</div>
      <div class="result-chapter">${escapeHtml(state.chapter)}</div>
      <div class="result-score">${score} / ${total}</div>
      <div class="result-percent">${percent}%</div>
      <div class="result-message ${messageClass}">${message}</div>
      ${saveMessage}
      <div class="result-actions">
        <button class="card" onclick="retryTest()">🔁 Retry</button>
        <button class="card" onclick="back()">📚 All Chapters</button>
        <button class="card" onclick="goHome()">🏠 Home</button>
      </div>
    </div>
  `;
}

// ─── Test Logic ──────────────────────────────────────────

async function startTest(subject, chapterId) {
  clearInterval(state.timer);
  state.subject = subject;
  state.chapterId = chapterId;
  state.chapter = getChapterTitle(chapterId);
  state.currentQ = 0;
  state.score = 0;
  state.timeLeft = 120;
  state.answered = false;
  state.lockNext = false;
  state.resultSaved = false;
  state.resultSaveMessage = '';
  state.submitting = false;
  state.questions = [];
  state.answers = [];
  state.loading = true;
  state.loadingError = '';
  state.screen = 'test';
  render();

  try {
    const { ok, data } = await apiFetch(
      `/api/tests/questions?subject=${encodeURIComponent(subject)}&chapter=${encodeURIComponent(chapterId)}`
    );

    if (!ok) {
      state.loading = false;
      state.loadingError = data.message || 'Unable to load test questions.';
      render();
      return;
    }

    state.questions = data.questions || [];
    state.totalQuestions = data.totalQuestions || state.questions.length;
    // Pre-initialize answers array for each question as unanswered (-1)
    state.answers = state.questions.map(q => ({
      questionId: q.id,
      selectedOption: -1
    }));

    state.loading = false;
    render();
    startTimer();
  } catch (error) {
    state.loading = false;
    state.loadingError = 'Unable to load test questions. Please check that the backend is running.';
    render();
  }
}

function selectAnswer(index) {
  if (state.answered) return;
  state.answered = true;

  const currentQObj = state.questions[state.currentQ];
  state.answers[state.currentQ] = {
    questionId: currentQObj.id,
    selectedOption: index
  };

  document.querySelectorAll('.option-btn').forEach((btn, i) => {
    btn.disabled = true;
    if (i === index) {
      btn.classList.add('selected');
    }
  });

  const nextBtn = document.getElementById('next-btn');
  if (nextBtn) {
    nextBtn.disabled = false;
  }
}

function nextQuestion() {
  if (state.screen !== 'test') return;
  if (state.lockNext) return;
  state.lockNext = true;
  clearInterval(state.timer);

  // Ensure current question is populated in answers array even if unanswered
  if (!state.answers[state.currentQ]) {
    const currentQObj = state.questions[state.currentQ];
    state.answers[state.currentQ] = {
      questionId: currentQObj.id,
      selectedOption: -1
    };
  }

  const total = state.questions.length;

  if (state.currentQ < total - 1) {
    state.currentQ++;
    state.timeLeft = 120;
    state.answered = false;
    render();
    startTimer();
    state.lockNext = false;
  } else {
    state.screen = 'result';
    state.submitting = true;
    render();
    saveTestResult();
  }
}

async function saveTestResult() {
  if (state.resultSaved) return;

  const chapterKey = state.chapterId || state.chapter;

  state.resultSaveMessage = 'Evaluating and saving result...';
  render();

  try {
    const { ok, data } = await apiFetch('/api/tests/result', {
      method: 'POST',
      body: {
        subject: state.subject,
        chapter: chapterKey,
        answers: state.answers
      }
    });

    if (!ok) {
      state.submitting = false;
      state.resultSaveMessage = data.message || 'Result could not be saved.';
      render();
      return;
    }

    state.score = data.score;
    state.totalQuestions = data.totalQuestions;
    state.resultSaved = true;
    state.submitting = false;
    state.resultSaveMessage = 'Result saved.';
    render();
  } catch (error) {
    state.submitting = false;
    state.resultSaveMessage = 'Result could not be saved. Please check that the backend is running.';
    render();
  }
}

function startTimer() {
  clearInterval(state.timer);
  state.timer = setInterval(() => {
    state.timeLeft--;

    const display = document.getElementById('timer-display');
    if (display) {
      const mins = Math.floor(state.timeLeft / 60);
      const secs = String(state.timeLeft % 60).padStart(2, '0');
      display.textContent = `${mins}:${secs}`;
      if (state.timeLeft <= 30) display.classList.add('danger');
    }

    if (state.timeLeft <= 0) {
      state.answered = true;
      nextQuestion();
    }
  }, 1000);
}

function retryTest() {
  startTest(state.subject, state.chapterId || state.chapter);
}

function goHome() {
  state.screen = 'main';
  render();
}

function exitTest() {
  const shouldExit = confirm('Exit this test? Your unfinished attempt will not be saved.');

  if (!shouldExit) return;

  clearInterval(state.timer);
  state.screen = 'main';
  state.chapterId = null;
  state.currentQ = 0;
  state.score = 0;
  state.timeLeft = 120;
  state.answered = false;
  state.lockNext = false;
  state.resultSaved = false;
  state.resultSaveMessage = '';
  state.submitting = false;
  state.questions = [];
  state.answers = [];
  render();
}

// ─── Navigation ──────────────────────────────────────────

function goSubject(subject) {
  state.subject = subject;
  state.screen = 'chapters';
  render();
}

function back() {
  clearInterval(state.timer);
  if (state.screen === 'chapters') state.screen = 'main';
  else if (state.screen === 'result') state.screen = 'chapters';
  render();
}

// ─── Start ───────────────────────────────────────────────
render();
