const params = new URLSearchParams(window.location.search);
const chapter = params.get("name");

// Guard: If URL has no ?name= query parameter, show fallback state
if (!chapter) {
    document.getElementById("chapter-title").innerText = "Chapter not found";
    document.getElementById("videos").innerText = "No chapter was specified. Please go back and select a chapter.";
    // Stop the rest of the script from running
    throw new Error("No chapter param in URL");
}

const chapterTitleEl = document.getElementById("chapter-title");
const completionStateEl = document.getElementById("chapter-completion-state");
const completionBtn = document.getElementById("chapter-completion-btn");

let currentSubject = getChapterSubject(chapter);
let currentCompletionState = false;

chapterTitleEl.innerText = getChapterTitle(chapter);

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
  const token = getToken();
  const subject = currentSubject;

  if (!token || !subject) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/progress/update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        subject,
        chapter
      })
    });

    if (!response.ok) {
      handleUnauthorized();
    }
  } catch (error) {
    handleUnauthorized();
  }
}

async function loadCompletionState() {
  const token = getToken();

  if (!token || !currentSubject) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/progress/status?subject=${encodeURIComponent(currentSubject)}&chapter=${encodeURIComponent(chapter)}`, {
      method: "GET",
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
  const token = getToken();

  if (!token || !currentSubject) {
    return;
  }

  const endpoint = nextState ? 'complete' : 'incomplete';

  completionBtn.disabled = true;

  try {
    const response = await fetch(`${API_BASE_URL}/api/progress/${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        subject: currentSubject,
        chapter,
      })
    });

    const data = await response.json();

    if (!response.ok) {
      if (response.status === 401) {
        handleUnauthorized();
        return;
      }
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

updateLearningProgress();
loadCompletionState();

const videoData = {
  kinematics: [
    "https://youtube.com/",
    "https://youtube.com/"
  ],
  atomicstructure: [
    "https://youtube.com/"
  ],
  quadraticequations: [
    "https://youtube.com/"
  ]
};

const videoContainer = document.getElementById("videos");
videoContainer.innerHTML = "";

if (videoData[chapter]) {
  videoData[chapter].forEach(link => {
    const a = document.createElement("a");
    a.href = link;
    a.target = "_blank";
    a.innerText = "Watch Video";
    a.classList.add("video-card");
    videoContainer.appendChild(a);
  });
} else {
  videoContainer.innerText = "No videos available for this chapter.";
}
