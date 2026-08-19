window.onload = async function () {
  const token = getToken();
  const historyList = document.getElementById('history-list');
  const statusEl = document.getElementById('history-status');

  statusEl.textContent = 'Loading test history...';
  statusEl.classList.remove('error', 'success');

  try {
    const response = await fetch(`${API_BASE_URL}/api/tests/history`, {
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

      statusEl.textContent = data.message || 'Unable to load test history right now.';
      statusEl.classList.add('error');
      return;
    }

    if (!data.results.length) {
      statusEl.textContent = 'No test history yet. Complete a test to see it here.';
      historyList.textContent = '';
      const emptyCard = document.createElement('div');
      emptyCard.className = 'card';
      emptyCard.textContent = 'No test history yet.';
      historyList.appendChild(emptyCard);
      return;
    }

    statusEl.textContent = '';
    historyList.textContent = '';

    data.results.forEach((result) => {
      const card = document.createElement('div');
      card.className = 'card';

      const subjectDiv = document.createElement('div');
      subjectDiv.textContent = getSubjectTitle(result.subject);

      const chapterDiv = document.createElement('div');
      chapterDiv.className = 'card-sub';
      chapterDiv.textContent = getChapterTitle(result.chapter);

      const scoreDiv = document.createElement('div');
      scoreDiv.className = 'card-sub';
      scoreDiv.textContent = `Score: ${result.score}/${result.totalQuestions}`;

      const dateDiv = document.createElement('div');
      dateDiv.className = 'card-sub';
      dateDiv.textContent = new Date(result.createdAt).toLocaleDateString();

      card.appendChild(subjectDiv);
      card.appendChild(chapterDiv);
      card.appendChild(scoreDiv);
      card.appendChild(dateDiv);

      historyList.appendChild(card);
    });
  } catch (error) {
    statusEl.textContent = 'Unable to load test history. Please check that the backend is running.';
    statusEl.classList.add('error');
  }
};
