async function handleSignIn() {
  const email = document.getElementById('emailInput').value.trim();
  const password = document.getElementById('passwordInput').value.trim();
  const messageEl = document.getElementById('login-message');
  const signInButton = document.getElementById('signInButton');

  messageEl.textContent = '';
  messageEl.classList.remove('success');

  if (!email || !password) {
    messageEl.textContent = 'Please enter your email and password.';
    return;
  }

  try {
    signInButton.disabled = true;
    signInButton.textContent = 'Loading...';

    const { ok, data } = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: {
        email,
        password,
      },
    });

    if (!ok) {
      messageEl.textContent = data.message || 'Login failed. Please try again.';
      return;
    }

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    messageEl.textContent = 'Login successful. Redirecting...';
    messageEl.classList.add('success');
    window.location.href = 'home.html';
  } catch (error) {
    messageEl.textContent = 'Unable to connect to the server. Please make sure the backend is running.';
  } finally {
    signInButton.disabled = false;
    signInButton.textContent = 'Sign in';
  }
}

async function handleGoogleLogin() {
  const messageEl = document.getElementById('login-message');
  const googleButton = document.getElementById('googleButton');

  messageEl.textContent = '';
  messageEl.classList.remove('success');

  try {
    googleButton.disabled = true;
    googleButton.textContent = 'Loading...';

    if (window.firebaseConfig.apiKey === 'YOUR_FIREBASE_API_KEY') {
      messageEl.textContent = 'Firebase web config is missing.';
      return;
    }

    const provider = new firebase.auth.GoogleAuthProvider();
    const googleResult = await firebase.auth().signInWithPopup(provider);
    const idToken = await googleResult.user.getIdToken();

    const { ok, data } = await apiFetch('/api/auth/google', {
      method: 'POST',
      body: { idToken },
    });

    if (!ok) {
      messageEl.textContent = data.message || 'Google login failed. Please try again.';
      return;
    }

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    messageEl.textContent = 'Google login successful. Redirecting...';
    messageEl.classList.add('success');
    window.location.href = 'home.html';
  } catch (error) {
    messageEl.textContent = 'Google login could not be completed.';
  } finally {
    googleButton.disabled = false;
    googleButton.textContent = 'Continue with Google';
  }
}
