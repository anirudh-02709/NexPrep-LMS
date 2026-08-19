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

  activityEl.textContent = '';

  const items = [];

  if (homeState.continueProgress) {
    const { subject, chapter } = homeState.continueProgress;
    const item = document.createElement('div');
    item.className = 'activity-item';

    const label = document.createElement('span');
    label.textContent = 'Recently visited';

    const strong = document.createElement('strong');
    strong.textContent = `${getSubjectTitle(subject)} - ${getChapterTitle(chapter)}`;

    item.appendChild(label);
    item.appendChild(strong);
    items.push(item);
  }

  if (homeState.latestTest) {
    const latest = homeState.latestTest;
    const scoreText = latest.totalQuestions
      ? `${latest.score}/${latest.totalQuestions}`
      : 'Saved score';

    const item = document.createElement('div');
    item.className = 'activity-item';

    const label = document.createElement('span');
    label.textContent = 'Recent test score';

    const strong = document.createElement('strong');
    strong.textContent = `${getSubjectTitle(latest.subject)} - ${getChapterTitle(latest.chapter)} (${scoreText})`;

    item.appendChild(label);
    item.appendChild(strong);
    items.push(item);
  }

  if (items.length) {
    items.forEach((it) => activityEl.appendChild(it));
  } else {
    const emptyMsg = document.createElement('p');
    emptyMsg.className = 'card-text';
    emptyMsg.textContent = 'Start a chapter or attempt a test to build your activity feed.';
    activityEl.appendChild(emptyMsg);
  }
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
  const sectionEl = document.getElementById('continue-learning-section');
  const textEl = document.getElementById('continue-text');
  const resumeBtn = document.getElementById('resume-btn');

  sectionEl.style.display = 'block';

  try {
    const { ok, data } = await apiFetch('/api/progress/continue');

    if (!ok) {
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
  try {
    const { ok, data } = await apiFetch('/api/progress/stats');

    if (!ok) {
      return;
    }

    const orderedSubjects = typeof ALL_SUBJECTS !== 'undefined' ? ALL_SUBJECTS : ['physics', 'chemistry', 'maths'];
    let completed = 0;
    let total = 0;

    orderedSubjects.forEach((subject) => {
      const stats = data.stats && data.stats[subject];
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
  try {
    const { ok, data } = await apiFetch('/api/tests/dashboard');

    if (!ok) {
      return;
    }

    const dashboard = data.dashboard || {};
    setText('home-tests-attempted', dashboard.totalTests || 0);

    updateRecentActivity();
  } catch (error) {
    setText('home-tests-attempted', '--');
  }
}

async function loadRecentHistory() {
  try {
    const { ok, data } = await apiFetch('/api/tests/history');

    if (!ok) {
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
  Promise.all([
    loadContinueLearning(),
    loadHomeStats(),
    loadTestStats(),
    loadRecentHistory(),
  ]);
};
