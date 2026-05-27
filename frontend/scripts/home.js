const user = getUser();
if (user) {
  document.getElementById('welcome-msg').textContent = 'Welcome back, ' + user.name + '!';
}

async function loadContinueLearning() {
  const token = getToken();
  if (!token) return;

  const sectionEl = document.getElementById('continue-learning-section');
  const textEl = document.getElementById('continue-text');
  const resumeBtn = document.getElementById('resume-btn');

  sectionEl.style.display = 'block';

  try {
    const response = await fetch(`${API_BASE_URL}/api/progress/continue`, {
      method: 'GET',
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
      textEl.textContent = data.message || 'Unable to load progress right now.';
      return;
    }

    if (data.progress) {
      const { subject, chapter } = data.progress;
      const formattedSubject = getSubjectTitle(subject);
      const formattedChapter = getChapterTitle(chapter);
      
      textEl.textContent = `You were recently studying ${formattedSubject} - ${formattedChapter}.`;
      resumeBtn.style.display = 'inline-block';
      resumeBtn.onclick = () => {
        window.location.href = `chapter.html?name=${chapter}`;
      };
    } else {
      textEl.textContent = 'You haven\'t started studying yet. Select a subject below to begin!';
    }
  } catch (error) {
    textEl.textContent = 'Unable to load progress. Please check that the backend is running.';
  }
}

window.onload = function() {
  loadContinueLearning();
};
