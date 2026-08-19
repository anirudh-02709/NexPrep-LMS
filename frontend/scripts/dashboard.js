window.onload = async function () {
  const totalTestsEl = document.getElementById('total-tests');
  const averageScoreEl = document.getElementById('average-score');
  const latestTestEl = document.getElementById('latest-test');
  const subjectStatsEl = document.getElementById('subject-stats');
  const progressStatsEl = document.getElementById('progress-stats');
  const statusEl = document.getElementById('dashboard-status');

  // Performance Insights Elements
  const weakestSubjectEl = document.getElementById('weakest-subject');
  const strongestSubjectEl = document.getElementById('strongest-subject');
  const performanceTrendEl = document.getElementById('performance-trend');
  const recommendationTextEl = document.getElementById('recommendation-text');
  const consistencyInsightEl = document.getElementById('consistency-insight');

  statusEl.textContent = 'Loading dashboard...';
  statusEl.classList.remove('error', 'success');

  const loadTestDashboard = async () => {
    try {
      const { ok, data } = await apiFetch('/api/tests/dashboard');

      if (!ok) {
        statusEl.textContent = data.message || 'Unable to load dashboard right now.';
        statusEl.classList.add('error');
        return;
      }

      const dashboard = data.dashboard || {};

      totalTestsEl.textContent = dashboard.totalTests || 0;
      averageScoreEl.textContent = `${dashboard.averageScorePercentage || 0}%`;
      statusEl.textContent = '';

      if (dashboard.latestTest) {
        latestTestEl.textContent = `${getSubjectTitle(dashboard.latestTest.subject)} - ${getChapterTitle(dashboard.latestTest.chapter)}`;
      } else {
        latestTestEl.textContent = 'No tests yet';
      }

      if (dashboard.insights) {
        weakestSubjectEl.textContent = dashboard.insights.weakestSubject || 'N/A';
        strongestSubjectEl.textContent = dashboard.insights.strongestSubject || 'N/A';
        performanceTrendEl.textContent = dashboard.insights.performanceTrend || 'Stable';
        recommendationTextEl.textContent = dashboard.insights.recommendation || '';
        consistencyInsightEl.textContent = dashboard.insights.consistencyInsight || '';
      }

      const subjectCounts = dashboard.subjectWiseTestCounts || {};
      const subjects = Object.keys(subjectCounts);

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
        subDiv.textContent = `${subjectCounts[subject]} tests`;

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
      const { ok, data } = await apiFetch('/api/progress/stats');

      progressStatsEl.textContent = '';

      if (!ok) {
        const errorCard = document.createElement('div');
        errorCard.className = 'card';
        errorCard.textContent = data.message || 'Unable to load chapter progress.';
        progressStatsEl.appendChild(errorCard);
        return;
      }

      const orderedSubjects = typeof ALL_SUBJECTS !== 'undefined' ? ALL_SUBJECTS : ['physics', 'chemistry', 'maths'];

      orderedSubjects.forEach((subject) => {
        const subjectStats = data.stats && data.stats[subject];
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

  await Promise.all([
    loadTestDashboard(),
    loadChapterProgress(),
  ]);
};
