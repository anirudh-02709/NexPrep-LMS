let currentHistoryPage = 1;
const historyPageSize = 10;
let activeHistoryTab = 'chapter'; // 'chapter' | 'mock'

window.onload = function () {
  loadHistory(1);
};

function switchHistoryTab(tab) {
  if (tab === activeHistoryTab) return;
  activeHistoryTab = tab;

  const chapterBtn = document.getElementById('tab-btn-chapter');
  const mockBtn = document.getElementById('tab-btn-mock');

  if (chapterBtn && mockBtn) {
    if (tab === 'chapter') {
      chapterBtn.classList.add('active');
      mockBtn.classList.remove('active');
    } else {
      mockBtn.classList.add('active');
      chapterBtn.classList.remove('active');
    }
  }

  // Remove existing pagination when switching tabs
  const paginationContainer = document.getElementById('history-pagination');
  if (paginationContainer) {
    paginationContainer.remove();
  }

  if (tab === 'chapter') {
    loadHistory(1);
  } else {
    loadMockHistory(1);
  }
}

async function loadHistory(page = 1) {
  const historyList = document.getElementById('history-list');
  const statusEl = document.getElementById('history-status');

  statusEl.textContent = 'Loading test history...';
  statusEl.classList.remove('error', 'success');

  try {
    const { ok, data } = await apiFetch(`/api/tests/history?page=${page}&limit=${historyPageSize}`);

    if (!ok) {
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

async function loadMockHistory(page = 1) {
  const historyList = document.getElementById('history-list');
  const statusEl = document.getElementById('history-status');

  statusEl.textContent = 'Loading mock test history...';
  statusEl.classList.remove('error', 'success');

  try {
    const { ok, data } = await apiFetch(`/api/mock-tests/history?page=${page}&limit=${historyPageSize}`);

    if (!ok) {
      statusEl.textContent = data.message || 'Unable to load mock test history right now.';
      statusEl.classList.add('error');
      return;
    }

    const items = data.data || data.results || [];

    if (!items.length) {
      statusEl.textContent = 'No mock test history yet. Start a JEE Mock Test to see it here.';
      historyList.textContent = '';
      const emptyCard = document.createElement('div');
      emptyCard.className = 'card';
      emptyCard.textContent = 'No mock test history yet.';
      historyList.appendChild(emptyCard);
      renderPagination(1, 1);
      return;
    }

    const pagination = data.pagination || {};
    currentHistoryPage = pagination.page || page;
    const totalPages = pagination.pages || data.totalPages || 1;

    statusEl.textContent = '';
    historyList.textContent = '';

    items.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'card mock-history-card';

      // Title & Date Header
      const titleDiv = document.createElement('div');
      titleDiv.className = 'card-title';
      titleDiv.textContent = item.title || 'JEE Mock Test';

      const dateDiv = document.createElement('div');
      dateDiv.className = 'card-sub';
      const attemptDate = item.submittedAt || item.startedAt;
      dateDiv.textContent = attemptDate ? new Date(attemptDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Recent';

      card.appendChild(titleDiv);
      card.appendChild(dateDiv);

      // Evaluation Status & Details Presentation
      const evalStatus = item.evaluationStatus || 'PENDING';

      if (evalStatus === 'EVALUATED') {
        const badge = document.createElement('div');
        badge.className = 'mock-status-badge mock-badge-evaluated';
        badge.textContent = 'Evaluated';
        card.appendChild(badge);

        const scoreDiv = document.createElement('div');
        scoreDiv.className = 'card-sub';
        const maxMarks = item.maxMarks || 300;
        scoreDiv.textContent = `Score: ${item.score !== null ? item.score : '--'} / ${maxMarks}`;
        card.appendChild(scoreDiv);

        if (item.percentage !== null && item.percentage !== undefined) {
          const percentDiv = document.createElement('div');
          percentDiv.className = 'card-sub';
          percentDiv.textContent = `Percentage: ${item.percentage}% | Accuracy: ${item.accuracy !== null ? item.accuracy : '--'}%`;
          card.appendChild(percentDiv);
        }

        const actionBtn = document.createElement('button');
        actionBtn.className = 'btn-view-mock-result';
        actionBtn.textContent = 'View Result →';
        actionBtn.onclick = () => {
          window.location.href = `mock-test.html?sessionId=${encodeURIComponent(item.sessionId)}`;
        };
        card.appendChild(actionBtn);
      } else if (evalStatus === 'HELD_FOR_REVIEW') {
        const badge = document.createElement('div');
        badge.className = 'mock-status-badge mock-badge-review';
        badge.textContent = 'Under Review';
        card.appendChild(badge);

        const noteDiv = document.createElement('div');
        noteDiv.className = 'mock-status-note';
        noteDiv.textContent = 'Submission under review. Scores will be available upon completion of verification.';
        card.appendChild(noteDiv);
      } else if (evalStatus === 'HELD_TECHNICAL_REVIEW') {
        const badge = document.createElement('div');
        badge.className = 'mock-status-badge mock-badge-technical';
        badge.textContent = 'Technical Verification';
        card.appendChild(badge);

        const noteDiv = document.createElement('div');
        noteDiv.className = 'mock-status-note';
        noteDiv.textContent = 'Technical telemetry verification in progress. Academic scoring will follow resolution.';
        card.appendChild(noteDiv);
      } else if (evalStatus === 'REJECTED') {
        const badge = document.createElement('div');
        badge.className = 'mock-status-badge mock-badge-rejected';
        badge.textContent = 'Rejected';
        card.appendChild(badge);

        const noteDiv = document.createElement('div');
        noteDiv.className = 'mock-status-note';
        noteDiv.textContent = 'This exam attempt was reviewed and rejected. No score is available.';
        card.appendChild(noteDiv);
      } else {
        const badge = document.createElement('div');
        badge.className = 'mock-status-badge mock-badge-pending';
        badge.textContent = 'Pending';
        card.appendChild(badge);

        const noteDiv = document.createElement('div');
        noteDiv.className = 'mock-status-note';
        noteDiv.textContent = 'Evaluation in progress.';
        card.appendChild(noteDiv);
      }

      historyList.appendChild(card);
    });

    renderPagination(currentHistoryPage, totalPages);
  } catch (error) {
    statusEl.textContent = 'Unable to load mock test history. Please check that the backend is running.';
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
    if (page > 1) {
      if (activeHistoryTab === 'chapter') {
        loadHistory(page - 1);
      } else {
        loadMockHistory(page - 1);
      }
    }
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
    if (page < totalPages) {
      if (activeHistoryTab === 'chapter') {
        loadHistory(page + 1);
      } else {
        loadMockHistory(page + 1);
      }
    }
  };

  paginationContainer.appendChild(prevBtn);
  paginationContainer.appendChild(pageInfo);
  paginationContainer.appendChild(nextBtn);
}
