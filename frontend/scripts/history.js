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
      historyList.innerHTML = '<div class="card">No test history yet.</div>';
      return;
    }

    statusEl.textContent = '';
    historyList.innerHTML = data.results.map((result) => {
      const date = new Date(result.createdAt).toLocaleDateString();

      return `
        <div class="card">
          <div>${getSubjectTitle(result.subject)}</div>
          <div class="card-sub">${getChapterTitle(result.chapter)}</div>
          <div class="card-sub">Score: ${result.score}/${result.totalQuestions}</div>
          <div class="card-sub">${date}</div>
        </div>
      `;
    }).join('');
  } catch (error) {
    statusEl.textContent = 'Unable to load test history. Please check that the backend is running.';
    statusEl.classList.add('error');
  }
};
