const user = getUser();
if (user) {
  document.getElementById('welcome-msg').textContent = 'Welcome back, ' + user.name + '!';
}

const homeState = {
  continueProgress: null,
  latestTest: null,
};

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function updateRecentActivity() {
  const activityEl = document.getElementById('recent-activity-list');
  if (!activityEl) return;

  const items = [];

  if (homeState.continueProgress) {
    const { subject, chapter } = homeState.continueProgress;
    items.push(`
      <div class="activity-item">
        <span>Recently visited</span>
        <strong>${getSubjectTitle(subject)} - ${getChapterTitle(chapter)}</strong>
      </div>
    `);
  }

  if (homeState.latestTest) {
    const latest = homeState.latestTest;
    const scoreText = latest.totalQuestions
      ? `${latest.score}/${latest.totalQuestions}`
      : 'Saved score';
    items.push(`
      <div class="activity-item">
        <span>Recent test score</span>
        <strong>${getSubjectTitle(latest.subject)} - ${getChapterTitle(latest.chapter)} (${scoreText})</strong>
      </div>
    `);
  }

  activityEl.innerHTML = items.length
    ? items.join('')
    : '<p class="card-text">Start a chapter or attempt a test to build your activity feed.</p>';
}

function calculateStreak(results) {
  const uniqueDays = [...new Set(results
    .map((result) => new Date(result.createdAt))
    .filter((date) => !Number.isNaN(date.getTime()))
    .map((date) => date.toISOString().slice(0, 10)))].sort().reverse();

  if (!uniqueDays.length) return 0;

  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);

  for (const day of uniqueDays) {
    const expected = cursor.toISOString().slice(0, 10);
    if (day !== expected) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

async function loadContinueLearning() {
  const token = getToken();
  if (!token) return;

  const sectionEl = document.getElementById('continue-learning-section');
  const textEl = document.getElementById('continue-text');
  const resumeBtn = document.getElementById('resume-btn');

  sectionEl.style.display = 'block';

  try {
    const response = await fetch(`${API_BASE_URL}/api/progress/continue`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        handleUnauthorized();
        return;
      }
      textEl.textContent = data.message || 'Unable to load progress right now.';
      return;
    }

    if (data.progress) {
      const { subject, chapter } = data.progress;
      homeState.continueProgress = data.progress;
      const formattedSubject = getSubjectTitle(subject);
      const formattedChapter = getChapterTitle(chapter);
      
      textEl.textContent = `You were recently studying ${formattedSubject} - ${formattedChapter}.`;
      setText('hero-focus-text', `${formattedChapter} in ${formattedSubject} is ready when you are.`);
      resumeBtn.style.display = 'inline-block';
      resumeBtn.onclick = () => {
        window.location.href = `chapter.html?name=${chapter}`;
      };
    } else {
      textEl.textContent = 'You haven\'t started studying yet. Select a subject below to begin!';
    }
    updateRecentActivity();
  } catch (error) {
    textEl.textContent = 'Unable to load progress. Please check that the backend is running.';
  }
}

async function loadHomeStats() {
  const token = getToken();
  if (!token) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/progress/stats`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        handleUnauthorized();
      }
      return;
    }

    const orderedSubjects = ['physics', 'chemistry', 'maths'];
    let completed = 0;
    let total = 0;

    orderedSubjects.forEach((subject) => {
      const stats = data.stats[subject];
      if (!stats) return;

      completed += Number(stats.completedChapters) || 0;
      total += Number(stats.totalChapters) || 0;

      setText(`${subject}-progress-text`, `${stats.completionPercentage}% progress`);
      setText(`${subject}-chapters-text`, `${stats.completedChapters}/${stats.totalChapters} chapters completed`);

      const bar = document.getElementById(`${subject}-progress-bar`);
      if (bar) bar.style.width = `${stats.completionPercentage}%`;
    });

    const overall = total ? Math.round((completed / total) * 100) : 0;
    setText('home-chapters-completed', completed);
    setText('home-progress-percent', `${overall}%`);
  } catch (error) {
    setText('home-progress-percent', '--');
  }
}

async function loadTestStats() {
  const token = getToken();
  if (!token) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/tests/dashboard`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        handleUnauthorized();
      }
      return;
    }

    const dashboard = data.dashboard;
    setText('home-tests-attempted', dashboard.totalTests || 0);

    updateRecentActivity();
  } catch (error) {
    setText('home-tests-attempted', '--');
  }
}

async function loadRecentHistory() {
  const token = getToken();
  if (!token) return;

  try {
    const response = await fetch(`${API_BASE_URL}/api/tests/history`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        handleUnauthorized();
      }
      return;
    }

    const results = data.results || [];
    setText('home-current-streak', `${calculateStreak(results)} days`);

    if (results.length) {
      homeState.latestTest = results[0];
    }

    updateRecentActivity();
  } catch (error) {
    setText('home-current-streak', '--');
  }
}

window.onload = function() {
  loadContinueLearning();
  loadHomeStats();
  loadTestStats();
  loadRecentHistory();
};
