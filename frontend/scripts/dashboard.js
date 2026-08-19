window.onload = async function () {
  const token = getToken();
  const totalTestsEl = document.getElementById('total-tests');
  const averageScoreEl = document.getElementById('average-score');
  const latestTestEl = document.getElementById('latest-test');
  const subjectStatsEl = document.getElementById('subject-stats');
  const progressStatsEl = document.getElementById('progress-stats');
  const statusEl = document.getElementById('dashboard-status');

  // AI Insights Elements
  const weakestSubjectEl = document.getElementById('weakest-subject');
  const strongestSubjectEl = document.getElementById('strongest-subject');
  const performanceTrendEl = document.getElementById('performance-trend');
  const recommendationTextEl = document.getElementById('recommendation-text');
  const consistencyInsightEl = document.getElementById('consistency-insight');

  statusEl.textContent = 'Loading dashboard...';
  statusEl.classList.remove('error', 'success');

  const loadTestDashboard = async () => {
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

      if (dashboard.insights) {
        weakestSubjectEl.textContent = dashboard.insights.weakestSubject;
        strongestSubjectEl.textContent = dashboard.insights.strongestSubject;
        performanceTrendEl.textContent = dashboard.insights.performanceTrend;
        recommendationTextEl.textContent = dashboard.insights.recommendation;
        consistencyInsightEl.textContent = dashboard.insights.consistencyInsight;
      }

      const subjects = Object.keys(dashboard.subjectWiseTestCounts);

      subjectStatsEl.textContent = '';
      if (!subjects.length) {
        statusEl.textContent = 'No dashboard data yet. Complete a test to see progress here.';
        const emptyCard = document.createElement('div');
        emptyCard.className = 'card';
        emptyCard.textContent = 'No subject data yet.';
        subjectStatsEl.appendChild(emptyCard);
        return;
      }

      subjects.forEach((subject) => {
        const card = document.createElement('div');
        card.className = 'card';

        const subjectDiv = document.createElement('div');
        subjectDiv.textContent = getSubjectTitle(subject);

        const subDiv = document.createElement('div');
        subDiv.className = 'card-sub';
        subDiv.textContent = `${dashboard.subjectWiseTestCounts[subject]} tests`;

        card.appendChild(subjectDiv);
        card.appendChild(subDiv);
        subjectStatsEl.appendChild(card);
      });
    } catch (error) {
      statusEl.textContent = 'Unable to load dashboard. Please check that the backend is running.';
      statusEl.classList.add('error');
    }
  };

  const loadChapterProgress = async () => {
    if (!progressStatsEl) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/progress/stats`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      progressStatsEl.textContent = '';

      if (!response.ok) {
        if (response.status === 401) {
          handleUnauthorized();
          return;
        }

        const errorCard = document.createElement('div');
        errorCard.className = 'card';
        errorCard.textContent = 'Unable to load chapter progress.';
        progressStatsEl.appendChild(errorCard);
        return;
      }

      const orderedSubjects = typeof ALL_SUBJECTS !== 'undefined' ? ALL_SUBJECTS : ['physics', 'chemistry', 'maths'];

      orderedSubjects.forEach((subject) => {
        const subjectStats = data.stats[subject];
        if (!subjectStats) return;

        const card = document.createElement('div');
        card.className = 'card progress-card';

        const titleDiv = document.createElement('div');
        titleDiv.className = 'card-title';
        titleDiv.textContent = `${getSubjectTitle(subject)} Progress`;

        const percentDiv = document.createElement('div');
        percentDiv.className = 'progress-percentage';
        percentDiv.textContent = `${subjectStats.completionPercentage}%`;

        const subDiv = document.createElement('div');
        subDiv.className = 'card-sub';
        subDiv.textContent = `${subjectStats.completedChapters}/${subjectStats.totalChapters} chapters completed`;

        card.appendChild(titleDiv);
        card.appendChild(percentDiv);
        card.appendChild(subDiv);

        progressStatsEl.appendChild(card);
      });
    } catch (error) {
      progressStatsEl.textContent = '';
      const errorCard = document.createElement('div');
      errorCard.className = 'card';
      errorCard.textContent = 'Unable to load chapter progress.';
      progressStatsEl.appendChild(errorCard);
    }
  };

  await loadTestDashboard();
  await loadChapterProgress();
};
