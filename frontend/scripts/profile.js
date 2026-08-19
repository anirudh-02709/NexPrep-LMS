window.onload = async function () {
  const messageEl = document.getElementById('profile-message');

  messageEl.textContent = 'Loading profile...';
  messageEl.classList.remove('error', 'success');

  try {
    const [meResult, dashResult] = await Promise.all([
      apiFetch('/api/auth/me'),
      apiFetch('/api/tests/dashboard'),
    ]);

    if (!meResult.ok) {
      messageEl.textContent = meResult.data.message || 'Unable to load profile right now.';
      messageEl.classList.add('error');
      return;
    }

    const user = meResult.data.user || {};
    localStorage.setItem('user', JSON.stringify(user));

    document.getElementById('profile-username').textContent = user.name || 'User';
    document.getElementById('profile-email').textContent = user.email || '';

    const initials = user.name ? user.name.substring(0, 2).toUpperCase() : '?';
    document.getElementById('avatar-initials').textContent = initials;

    if (dashResult.ok && dashResult.data.dashboard) {
      document.getElementById('profile-tests-taken').textContent = dashResult.data.dashboard.totalTests || 0;
      document.getElementById('profile-avg-score').textContent = `${dashResult.data.dashboard.averageScorePercentage || 0}%`;
    }

    messageEl.textContent = '';
  } catch (error) {
    messageEl.textContent = 'Unable to load profile. Please check that the backend is running.';
    messageEl.classList.add('error');
  }
};
