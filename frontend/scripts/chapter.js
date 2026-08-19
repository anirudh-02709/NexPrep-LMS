const params = new URLSearchParams(window.location.search);
const chapter = params.get("name");

// Guard: If URL has no ?name= query parameter, show fallback state
if (!chapter) {
  document.getElementById("chapter-title").textContent = "Chapter not found";
  document.getElementById("videos").textContent = "No chapter was specified. Please go back and select a chapter.";
  // Stop the rest of the script from running
  throw new Error("No chapter param in URL");
}

const chapterTitleEl = document.getElementById("chapter-title");
const completionStateEl = document.getElementById("chapter-completion-state");
const completionBtn = document.getElementById("chapter-completion-btn");

let currentSubject = getChapterSubject(chapter);
let currentCompletionState = false;

chapterTitleEl.textContent = getChapterTitle(chapter);

function renderCompletionState() {
  if (!completionStateEl || !completionBtn) {
    return;
  }

  if (currentCompletionState) {
    completionStateEl.textContent = 'This chapter is marked as completed.';
    completionBtn.textContent = 'Mark as Incomplete';
    completionBtn.classList.remove('btn-primary');
    completionBtn.classList.add('btn-secondary');
  } else {
    completionStateEl.textContent = 'This chapter is not marked as completed yet.';
    completionBtn.textContent = 'Mark as Completed';
    completionBtn.classList.remove('btn-secondary');
    completionBtn.classList.add('btn-primary');
  }
}

async function updateLearningProgress() {
  const subject = currentSubject;

  if (!subject) {
    return;
  }

  try {
    await apiFetch('/api/progress/update', {
      method: "POST",
      body: {
        subject,
        chapter,
      },
    });
  } catch (error) {
    // Non-blocking background telemetry
  }
}

async function loadCompletionState() {
  if (!currentSubject) {
    return;
  }

  try {
    const { ok, data } = await apiFetch(
      `/api/progress/status?subject=${encodeURIComponent(currentSubject)}&chapter=${encodeURIComponent(chapter)}`
    );

    if (!ok) {
      completionStateEl.textContent = data.message || 'Unable to load completion state.';
      return;
    }

    currentCompletionState = Boolean(data.progress && data.progress.completed);
    renderCompletionState();
  } catch (error) {
    completionStateEl.textContent = 'Unable to load completion state. Please check that the backend is running.';
  }
}

async function setCompletionState(nextState) {
  if (!currentSubject) {
    return;
  }

  const endpoint = nextState ? 'complete' : 'incomplete';

  completionBtn.disabled = true;

  try {
    const { ok, data } = await apiFetch(`/api/progress/${endpoint}`, {
      method: 'POST',
      body: {
        subject: currentSubject,
        chapter,
      },
    });

    if (!ok) {
      completionStateEl.textContent = data.message || 'Unable to update completion state.';
      return;
    }

    currentCompletionState = Boolean(data.progress && data.progress.completed);
    renderCompletionState();
  } catch (error) {
    completionStateEl.textContent = 'Unable to update completion state. Please try again.';
  } finally {
    completionBtn.disabled = false;
  }
}

if (completionBtn) {
  completionBtn.addEventListener('click', () => {
    setCompletionState(!currentCompletionState);
  });
}

Promise.all([
  updateLearningProgress(),
  loadCompletionState(),
]);
