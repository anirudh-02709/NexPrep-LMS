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

// ─── Mock/PDF Data ───────────────────────────────────────
const data = {
  mains: {
    tests: ['Mock Test 1', 'Mock Test 2', 'Mock Test 3'],
    pdfs: [
      { name: 'JEE Mains PYQ 2024', url: '#' },
      { name: 'JEE Mains PYQ 2023', url: '#' },
      { name: 'JEE Mains PYQ 2022', url: '#' }
    ]
  },
  advanced: {
    tests: ['Mock Test 1', 'Mock Test 2'],
    pdfs: [
      { name: 'JEE Advanced PYQ 2024', url: '#' },
      { name: 'JEE Advanced PYQ 2023', url: '#' },
      { name: 'JEE Advanced PYQ 2022', url: '#' }
    ]
  }
};

// ─── State ───────────────────────────────────────────────
let state = {
  screen: 'main',
  type: null,
  subject: null,
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
  if (state.screen === 'subject')  container.innerHTML = screenSubject();
  if (state.screen === 'chapters') container.innerHTML = screenChapters();
  if (state.screen === 'mode')     container.innerHTML = screenMode();
  if (state.screen === 'tests')    container.innerHTML = screenTests();
  if (state.screen === 'pdfs')     container.innerHTML = screenPDFs();
  if (state.screen === 'test')     container.innerHTML = screenTest();
  if (state.screen === 'result')   container.innerHTML = screenResult();
}

// ─── Screens ─────────────────────────────────────────────

function screenMain() {
  return `
    <button class="back-btn" onclick="window.location.href='home.html'"><span class="back-icon" aria-hidden="true"></span><span>Back to Home</span></button>
    <h1>Tests</h1>
    <p>Choose how you want to practice</p>
    <div class="subjects">
      <div class="card" onclick="go('chapterwise')">
        <div>📖</div>
        <div>Chapter-wise</div>
        <div class="card-sub">Practice by topic</div>
      </div>
      <div class="card" onclick="go('mains')">
        <div>📝</div>
        <div>JEE Mains Mock</div>
        <div class="card-sub">Full mocks & PYQs</div>
      </div>
      <div class="card" onclick="go('advanced')">
        <div>🎯</div>
        <div>JEE Advanced Mock</div>
        <div class="card-sub">Full mocks & PYQs</div>
      </div>
    </div>
  `;
}

function screenSubject() {
  return `
    <button class="back-btn" onclick="back()"><span class="back-icon" aria-hidden="true"></span><span>Back</span></button>
    <h1>Chapter-wise</h1>
    <p>Select a subject</p>
    <div class="subjects">
      <div class="card" onclick="goSubject('physics')">
        <div>⚡</div>
        <div>Physics</div>
        <div class="card-sub">4 chapters</div>
      </div>
      <div class="card" onclick="goSubject('chemistry')">
        <div>🧪</div>
        <div>Chemistry</div>
        <div class="card-sub">4 chapters</div>
      </div>
      <div class="card" onclick="goSubject('maths')">
        <div>📐</div>
        <div>Mathematics</div>
        <div class="card-sub">4 chapters</div>
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
      <div class="card-sub">10 Qs · 20 mins</div>
    </div>
  `).join('');

  return `
    <button class="back-btn" onclick="back()"><span class="back-icon" aria-hidden="true"></span><span>Back</span></button>
    <h1>${label}</h1>
    <p>Select a chapter</p>
    <div class="subjects">${cards}</div>
  `;
}

function screenMode() {
  const label = state.type === 'mains' ? 'JEE Mains' : 'JEE Advanced';
  return `
    <button class="back-btn" onclick="back()"><span class="back-icon" aria-hidden="true"></span><span>Back</span></button>
    <h1>${label}</h1>
    <p>What do you want to access?</p>
    <div class="subjects">
      <div class="card" onclick="goMode('tests')">
        <div>⏱️</div>
        <div>Mock Tests</div>
        <div class="card-sub">Timed full-length tests</div>
      </div>
      <div class="card" onclick="goMode('pdfs')">
        <div>📄</div>
        <div>PYQ PDFs</div>
        <div class="card-sub">Download past papers</div>
      </div>
    </div>
  `;
}

function screenTests() {
  const tests = data[state.type].tests;
  const cards = tests.map(t => `
    <div class="card" onclick="alert('${escapeHtml(t)} coming soon!')">
      <div>⏱️</div>
      <div>${escapeHtml(t)}</div>
      <div class="card-sub">3 hrs · 300 marks</div>
    </div>
  `).join('');

  return `
    <button class="back-btn" onclick="back()"><span class="back-icon" aria-hidden="true"></span><span>Back</span></button>
    <h1>Mock Tests</h1>
    <p>Select a test to begin</p>
    <div class="subjects">${cards}</div>
  `;
}

function screenPDFs() {
  const pdfs = data[state.type].pdfs;
  const cards = pdfs.map(p => `
    <a href="${encodeURI(p.url)}" class="card pdf-card" download>
      <div>📄</div>
      <div>${escapeHtml(p.name)}</div>
      <div class="card-sub">Click to download</div>
    </a>
  `).join('');

  return `
    <button class="back-btn" onclick="back()"><span class="back-icon" aria-hidden="true"></span><span>Back</span></button>
    <h1>PYQ Papers</h1>
    <p>Download and practice</p>
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
        <button class="card" onclick="back(); back();">📚 All Chapters</button>
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

  const token = getToken();
  if (!token) {
    handleUnauthorized();
    return;
  }

  try {
    const response = await fetch(
      `${API_BASE_URL}/api/tests/questions?subject=${encodeURIComponent(subject)}&chapter=${encodeURIComponent(chapterId)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        handleUnauthorized();
        return;
      }
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

  const token = getToken();
  if (!token) {
    handleUnauthorized();
    return;
  }

  const chapterKey = state.chapterId || state.chapter;

  state.resultSaveMessage = 'Evaluating and saving result...';
  render();

  try {
    const response = await fetch(`${API_BASE_URL}/api/tests/result`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        subject: state.subject,
        chapter: chapterKey,
        answers: state.answers
      })
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

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

function go(type) {
  state.type = type;
  state.screen = type === 'chapterwise' ? 'subject' : 'mode';
  render();
}

function goSubject(subject) {
  state.subject = subject;
  state.screen = 'chapters';
  render();
}

function goMode(mode) {
  state.mode = mode;
  state.screen = mode;
  render();
}

function back() {
  clearInterval(state.timer);
  if (state.screen === 'subject')       state.screen = 'main';
  else if (state.screen === 'chapters') state.screen = 'subject';
  else if (state.screen === 'mode')     state.screen = 'main';
  else if (state.screen === 'tests')    state.screen = 'mode';
  else if (state.screen === 'pdfs')     state.screen = 'mode';
  else if (state.screen === 'result')   state.screen = 'chapters';
  render();
}

// ─── Start ───────────────────────────────────────────────
render();
