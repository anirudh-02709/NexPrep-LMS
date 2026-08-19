let currentHistoryPage = 1;
const historyPageSize = 10;

window.onload = function () {
  loadHistory(1);
};

async function loadHistory(page = 1) {
  const token = getToken();
  const historyList = document.getElementById('history-list');
  const statusEl = document.getElementById('history-status');

  statusEl.textContent = 'Loading test history...';
  statusEl.classList.remove('error', 'success');

  try {
    const response = await fetch(`${API_BASE_URL}/api/tests/history?page=${page}&limit=${historyPageSize}`, {
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

    const results = data.results || [];

    if (!results.length) {
      statusEl.textContent = 'No test history yet. Complete a test to see it here.';
      historyList.textContent = '';
      const emptyCard = document.createElement('div');
      emptyCard.className = 'card';
      emptyCard.textContent = 'No test history yet.';
      historyList.appendChild(emptyCard);
      renderPagination(1, 1);
      return;
    }

    currentHistoryPage = data.page || page;
    const totalPages = data.totalPages || 1;

    statusEl.textContent = '';
    historyList.textContent = '';

    results.forEach((result) => {
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

    renderPagination(currentHistoryPage, totalPages);
  } catch (error) {
    statusEl.textContent = 'Unable to load test history. Please check that the backend is running.';
    statusEl.classList.add('error');
  }
}

function renderPagination(page, totalPages) {
  let paginationContainer = document.getElementById('history-pagination');

  if (totalPages <= 1) {
    if (paginationContainer) {
      paginationContainer.remove();
    }
    return;
  }

  if (!paginationContainer) {
    paginationContainer = document.createElement('div');
    paginationContainer.id = 'history-pagination';
    paginationContainer.style.display = 'flex';
    paginationContainer.style.justifyContent = 'center';
    paginationContainer.style.alignItems = 'center';
    paginationContainer.style.gap = '16px';
    paginationContainer.style.marginTop = '24px';
    
    const content = document.querySelector('.content');
    if (content) {
      content.appendChild(paginationContainer);
    }
  }

  paginationContainer.textContent = '';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'back-btn';
  prevBtn.textContent = '← Previous';
  prevBtn.disabled = page <= 1;
  prevBtn.style.opacity = page <= 1 ? '0.5' : '1';
  prevBtn.style.cursor = page <= 1 ? 'not-allowed' : 'pointer';
  prevBtn.onclick = () => {
    if (page > 1) loadHistory(page - 1);
  };

  const pageInfo = document.createElement('span');
  pageInfo.className = 'card-sub';
  pageInfo.textContent = `Page ${page} of ${totalPages}`;

  const nextBtn = document.createElement('button');
  nextBtn.className = 'back-btn';
  nextBtn.textContent = 'Next →';
  nextBtn.disabled = page >= totalPages;
  nextBtn.style.opacity = page >= totalPages ? '0.5' : '1';
  nextBtn.style.cursor = page >= totalPages ? 'not-allowed' : 'pointer';
  nextBtn.onclick = () => {
    if (page < totalPages) loadHistory(page + 1);
  };

  paginationContainer.appendChild(prevBtn);
  paginationContainer.appendChild(pageInfo);
  paginationContainer.appendChild(nextBtn);
}
