window.onload = async function () {
  const token = getToken();
  const totalTestsEl = document.getElementById('total-tests');
  const averageScoreEl = document.getElementById('average-score');
  const latestTestEl = document.getElementById('latest-test');
  const subjectStatsEl = document.getElementById('subject-stats');
  const statusEl = document.getElementById('dashboard-status');

  statusEl.textContent = 'Loading dashboard...';
  statusEl.classList.remove('error', 'success');

  try {
    const response = await fetch(`${API_BASE_URL}/api/tests/dashboard`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      statusEl.textContent = data.message || 'Unable to load dashboard right now.';
      statusEl.classList.add('error');
      return;
    }

    const dashboard = data.dashboard;

    totalTestsEl.textContent = dashboard.totalTests;
    averageScoreEl.textContent = `${dashboard.averageScorePercentage}%`;
    statusEl.textContent = '';

    if (dashboard.latestTest) {
      latestTestEl.textContent = `${getSubjectTitle(dashboard.latestTest.subject)} - ${getChapterTitle(dashboard.latestTest.chapter)}`;
    } else {
      latestTestEl.textContent = 'No tests yet';
    }

    const subjects = Object.keys(dashboard.subjectWiseTestCounts);

    if (!subjects.length) {
      statusEl.textContent = 'No dashboard data yet. Complete a test to see progress here.';
      subjectStatsEl.innerHTML = '<div class="card">No subject data yet.</div>';
      return;
    }

    subjectStatsEl.innerHTML = subjects.map((subject) => {
      return `
        <div class="card">
          <div>${getSubjectTitle(subject)}</div>
          <div class="card-sub">${dashboard.subjectWiseTestCounts[subject]} tests</div>
        </div>
      `;
    }).join('');
  } catch (error) {
    statusEl.textContent = 'Unable to load dashboard. Please check that the backend is running.';
    statusEl.classList.add('error');
  }
};
