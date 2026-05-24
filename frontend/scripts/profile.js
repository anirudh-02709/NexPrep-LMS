window.onload = async function () {
  const token = getToken();
  const messageEl = document.getElementById('profile-message');

  messageEl.textContent = 'Loading profile...';
  messageEl.classList.remove('error', 'success');

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
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

      messageEl.textContent = data.message || 'Unable to load profile right now.';
      messageEl.classList.add('error');
      return;
    }

    const user = data.user;
    localStorage.setItem('user', JSON.stringify(user));

    document.getElementById('profile-username').textContent = user.name || 'User';
    document.getElementById('profile-email').textContent = user.email || '';

    const initials = user.name ? user.name.substring(0, 2).toUpperCase() : '?';
    document.getElementById('avatar-initials').textContent = initials;

    await loadProfileStats(token);
    messageEl.textContent = '';
  } catch (error) {
    messageEl.textContent = 'Unable to load profile. Please check that the backend is running.';
    messageEl.classList.add('error');
  }
};

async function loadProfileStats(token) {
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

    throw new Error(data.message || 'Unable to load profile stats.');
  }

  document.getElementById('profile-tests-taken').textContent = data.dashboard.totalTests;
  document.getElementById('profile-avg-score').textContent = `${data.dashboard.averageScorePercentage}%`;
}
