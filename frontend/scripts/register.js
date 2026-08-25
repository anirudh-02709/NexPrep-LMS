async function handleRegistration() {
  const name = document.getElementById('nameInput').value.trim();
  const email = document.getElementById('emailInput').value.trim();
  const password = document.getElementById('passwordInput').value;
  const confirmPassword = document.getElementById('confirmPasswordInput').value;
  const messageEl = document.getElementById('register-message');
  const registerButton = document.getElementById('registerButton');

  messageEl.textContent = '';
  messageEl.classList.remove('success');

  if (!name || !email || !password || !confirmPassword) {
    messageEl.textContent = 'Please fill in all fields.';
    return;
  }

  if (password.length < 8) {
    messageEl.textContent = 'Password must be at least 8 characters long.';
    return;
  }

  if (password !== confirmPassword) {
    messageEl.textContent = 'Passwords do not match.';
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    messageEl.textContent = 'Please provide a valid email address.';
    return;
  }

  try {
    registerButton.disabled = true;
    registerButton.textContent = 'Creating account...';

    const { ok, data } = await apiFetch('/api/auth/register', {
      method: 'POST',
      body: {
        name,
        email,
        password,
        confirmPassword,
      },
    });

    if (!ok) {
      messageEl.textContent = data.message || 'Registration failed. Please try again.';
      return;
    }

    messageEl.textContent = 'Account created successfully. Redirecting to login...';
    messageEl.classList.add('success');
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 1200);
  } catch (error) {
    messageEl.textContent = 'Unable to connect to the server. Please make sure the backend is running.';
  } finally {
    registerButton.disabled = false;
    registerButton.textContent = 'Create account';
  }
}
